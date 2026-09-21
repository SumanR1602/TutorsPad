/**
 * billingReceipt.ts
 * Builds a receipt for one payment.
 *
 * A receipt is proof that money changed hands, so it's issued once, numbered
 * in sequence, and frozen — `issueReceipt` snapshots the rendered HTML and
 * `reprintReceipt` replays it verbatim. Correcting one means voiding it, not
 * rewriting it.
 *
 * The figures are computed as at `payment.date` — a session logged later, a
 * break added later, or "today" simply moving on must never change what a
 * receipt says. The period it covers is the window between the previous
 * payment and this one (mirrors billingInvoice.ts, which windows from the
 * last payment to today instead).
 *
 * A receipt confirms a payment — it isn't a second invoice, so it carries no
 * itemized session list. It states what came in, roughly what it covered,
 * and the account's resulting balance.
 */
import { formatCurrency, openPDFWindow } from './billing'
import { getRateAt, getBillingCycles } from './billingCore'
import { formatDate, todayISO, formatDayMonth } from './date'
import { buildReceiptHTML } from './templates/receiptTemplate'
import { DEFAULT_CURRENCY } from '@constants'
import type { Student, Session, Payment, Break, Invoice, Receipt } from '@/types'

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** What one hourly session costs, honoring rate history and per-session extras. */
function sessionCost(student: Student, s: Session): number {
  if (s.type === 'extra' && typeof s.extraAmount === 'number') return s.extraAmount
  return s.hours * getRateAt(student, s.date).ratePerHour
}

/** Payments in the order money actually arrived. */
function chronological(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) =>
    a.date !== b.date
      ? a.date.localeCompare(b.date)
      : (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
  )
}

/**
 * The next receipt number in sequence, e.g. REC-2026-0007.
 * Numbered per calendar year, and voided receipts keep their number so the
 * sequence stays gapless and auditable.
 */
export function nextReceiptNumber(receipts: Receipt[], today: string = todayISO()): string {
  const year = today.slice(0, 4)
  const prefix = `REC-${year}-`
  const highest = receipts
    .filter((r) => r.receiptNumber?.startsWith(prefix))
    .reduce((max, r) => Math.max(max, parseInt(r.receiptNumber.slice(prefix.length), 10) || 0), 0)
  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

/**
 * Builds and freezes a receipt for `payment`. Returns null when the payment
 * isn't in the list, so a caller can't mint a receipt for money that has no
 * record behind it.
 */
export function issueReceipt(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  payment: Payment,
  teacherName: string = 'Teacher',
  breaks: Break[] = [],
  receiptNumber: string = '',
  invoices: Invoice[] = [],
): Pick<Receipt, 'studentId' | 'paymentId' | 'receiptNumber' | 'issuedDate' | 'amount' | 'html'> | null {
  const currency  = student.currency ?? DEFAULT_CURRENCY
  // The plan as it stood when this payment came in — a receipt is a record of
  // that moment, not of whatever plan the student is on today.
  const rateAtPayment = getRateAt(student, payment.date)
  const isMonthly = rateAtPayment.rateType === 'monthly'
  const fmt       = (n: number) => formatCurrency(n, currency)
  const today     = todayISO()
  const issued    = formatDayMonth(today)
  const recNo     = receiptNumber

  const mine = chronological(payments.filter((p) => p.studentId === student.id))
  const idx  = mine.findIndex((p) => p.id === payment.id)
  if (idx === -1) return null  // payment not in the list — nothing to receipt

  const prevPayment = idx > 0 ? mine[idx - 1] : null
  const boundary     = prevPayment?.date ?? null

  // Freeze the world to how it looked on the day this payment was made.
  const asOf = sessions
    .filter((s) => s.studentId === student.id && s.date <= payment.date)
    .sort((a, b) => a.date.localeCompare(b.date))

  const prevPaymentsTotal = round2(
    mine.slice(0, idx).reduce((sum, p) => sum + Math.max(0, p.amount || 0), 0),
  )

  // Cycles as they stood on payment.date — never re-flowed by later edits.
  // Monthly stretches are cycle-based, because only `getBillingCycles` knows
  // what a flat fee covered on a given date. Hourly stretches stay purely
  // date-bounded: their "cycles" are whole calendar months, so leaning on them
  // would re-state sessions an earlier same-month receipt already covered.
  const startedCycles = getBillingCycles(student, asOf, breaks, payment.date).filter((c) => c.started)
  const monthlyCycles = startedCycles.filter((c) => c.rateType === 'monthly')
  const touchedCycles = boundary ? monthlyCycles.filter((c) => c.end > boundary) : monthlyCycles

  const hourlySessions = asOf.filter((s) => getRateAt(student, s.date).rateType === 'hourly')
  const hourlyCovered  = boundary ? hourlySessions.filter((s) => s.date > boundary) : hourlySessions
  const hourlyBefore   = boundary ? hourlySessions.filter((s) => s.date <= boundary) : []

  // Invoice adjustments already issued by this date are part of what the
  // student owed when they paid, so the balance here has to include them or
  // a settled account would still read as being in arrears.
  const adjustmentsBefore = round2(
    invoices
      .filter((i) => i.studentId === student.id && i.status === 'issued' && i.issuedDate <= payment.date)
      .flatMap((i) => i.adjustments ?? [])
      .reduce((sum, a) => sum + (a.amount || 0), 0),
  )

  const costBeforePeriod = round2(
    monthlyCycles
      .filter((c) => !touchedCycles.includes(c))
      .reduce((sum, c) => sum + c.amount, 0)
    + hourlyBefore.reduce((sum, s) => sum + sessionCost(student, s), 0)
    + adjustmentsBefore,
  )
  const periodDue = round2(
    touchedCycles.reduce((sum, c) => sum + c.amount, 0)
    + hourlyCovered.reduce((sum, s) => sum + sessionCost(student, s), 0),
  )
  // null → the coverage line falls back to a generic "Tutoring fees"; only a
  // monthly stretch has a real calendar period to name.
  const periodLabel: string | null = touchedCycles.length
    ? `${formatDate(touchedCycles[0].start)} → ${formatDate(touchedCycles[touchedCycles.length - 1].end)}`
    : null

  // +ve = credit carried in, −ve = arrears carried in
  const carryForward  = round2(prevPaymentsTotal - costBeforePeriod)
  // +ve = still in credit after paying, −ve = still owing
  const creditBalance = round2(carryForward + payment.amount - periodDue)
  const creditHours   = isMonthly || !rateAtPayment.ratePerHour
    ? null
    : round2(creditBalance / rateAtPayment.ratePerHour)

  const html = buildReceiptHTML({
    recNo, teacherName, issued,
    student: { ...student, ratePerHour: rateAtPayment.ratePerHour },
    isMonthly,
    payment, periodLabel, carryForward, periodDue, creditBalance, creditHours, fmt,
  })

  return {
    studentId: student.id,
    paymentId: payment.id,
    receiptNumber: recNo,
    issuedDate: today,
    amount: round2(Math.max(0, payment.amount || 0)),
    html,
  }
}

/** Reprints an already-issued receipt from its frozen record — no recomputation. */
export function reprintReceipt(receipt: Receipt, studentName: string): void {
  const safeName = studentName.replace(/[^a-zA-Z0-9]/g, '-')
  openPDFWindow(receipt.html, `Receipt_${safeName}_${receipt.receiptNumber}`)
}
