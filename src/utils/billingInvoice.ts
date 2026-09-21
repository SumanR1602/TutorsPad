/**
 * billingInvoice.ts
 * Builds an invoice from work that hasn't been billed yet.
 *
 * What goes on an invoice is decided by *coverage*, not by dates: every
 * issued invoice records the sessions and monthly cycles it charged for, and
 * a new invoice picks up whatever isn't on that list. That's what keeps a
 * period from being itemised twice when two invoices are issued without a
 * payment in between, and what lets a back-dated session still get billed
 * instead of falling behind a date watermark.
 *
 * What's still *owed* from before is a separate question, answered from the
 * documents rather than by re-costing history:
 *
 *   previousBalance = Σ issued invoice totals − Σ payments received
 *   amountDueNow    = previousBalance + charges + adjustments
 *
 * Summing invoice totals only works because `Invoice.total` is this
 * invoice's own charges plus its own adjustments — brought-forward arrears
 * are printed but never folded into it. A discount therefore lives inside
 * the total of the invoice that granted it and can never be recomputed away.
 *
 * A student can switch between monthly and hourly mid-lifetime (see
 * billingCore.ts), so those words describe a *segment* of history, not the
 * student as a whole — `student.rateType` is only their current plan. Each
 * session is priced by the rate in force on its own date; deciding from the
 * student's current type would price an old monthly-segment session at
 * hours × that cycle's flat fee, wildly overcharging it.
 */
import { formatCurrency, openPDFWindow } from './billing'
import { getRateAt, getBillingCycles } from './billingCore'
import { formatDate, formatDayMonth, formatMonthLong, formatDuration, todayISO } from './date'
import { buildInvoiceHTML } from './templates/billingInvoiceTemplate'
import { DEFAULT_CURRENCY } from '@constants'
import type {
  Student, Session, Payment, Break, Invoice, InvoiceAdjustment, InvoiceCoverage,
} from '@/types'

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

const sumAdjustments = (adjustments: InvoiceAdjustment[]): number =>
  round2(adjustments.reduce((sum, a) => sum + (a.amount || 0), 0))

/** What one hourly session costs, honoring rate history and per-session extras. */
function sessionCost(student: Student, s: Session): number {
  if (s.type === 'extra' && typeof s.extraAmount === 'number') return s.extraAmount
  return s.hours * getRateAt(student, s.date).ratePerHour
}

/** Issued invoices only — drafts bill nothing and voided ones released their claim. */
function issuedFor(invoices: Invoice[], studentId: string): Invoice[] {
  return invoices.filter((i) => i.studentId === studentId && i.status === 'issued')
}

interface BilledRef { amount: number; kind: 'session' | 'cycle' }

/** ref → amount already billed for it across every issued invoice. */
function buildCoverageIndex(invoices: Invoice[], studentId: string): Map<string, BilledRef> {
  const billed = new Map<string, BilledRef>()
  for (const inv of issuedFor(invoices, studentId)) {
    for (const cov of inv.coverage ?? []) {
      const prev = billed.get(cov.ref)
      billed.set(cov.ref, {
        kind: cov.kind,
        amount: round2((prev?.amount ?? 0) + cov.amount),
      })
    }
  }
  return billed
}

/**
 * Invoices migrated from before coverage existed claim everything up to a
 * date instead of naming it, so their work isn't re-billed on the next run.
 */
function legacyCutoff(invoices: Invoice[], studentId: string): string {
  return issuedFor(invoices, studentId)
    .map((i) => i.legacyCoveredThrough ?? '')
    .reduce((latest, d) => (d > latest ? d : latest), '')
}

/** Prior invoice totals minus everything paid. Positive = still owed, negative = in credit. */
export function previousBalanceFor(
  student: Student,
  payments: Payment[],
  invoices: Invoice[],
): number {
  const invoiced = issuedFor(invoices, student.id)
    .reduce((sum, i) => sum + (i.total || 0), 0)
  const paid = payments
    .filter((p) => p.studentId === student.id)
    .reduce((sum, p) => sum + Math.max(0, p.amount || 0), 0)
  return round2(invoiced - paid)
}

/** Everything needed to render an invoice, before manual adjustments. */
interface InvoiceComputation {
  issued: string
  periodLabel: string
  sessionCount: number
  totalHoursLabel: string
  isMonthly: boolean
  sessionRows: string
  charges: number
  previousBalance: number
  coverage: InvoiceCoverage[]
}

function computeInvoiceData(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  dateFrom: string,
  dateTo: string,
  breaks: Break[],
  invoices: Invoice[],
): InvoiceComputation {
  const currency  = student.currency ?? DEFAULT_CURRENCY
  const fmt       = (n: number) => formatCurrency(n, currency)
  const todayIso  = todayISO()
  // Cosmetic rate chip only. Read from the timeline, not the record, so a
  // change scheduled for a future date doesn't advertise itself early.
  const currentRate = getRateAt(student, todayIso)
  const isMonthly   = currentRate.rateType === 'monthly'
  const issued      = formatDayMonth(todayIso)
  const effectiveTo = dateTo || todayIso

  const billed = buildCoverageIndex(invoices, student.id)
  const legacyThrough = legacyCutoff(invoices, student.id)

  const mySessions = sessions
    .filter((s) => s.studentId === student.id)
    .sort((a, b) => a.date.localeCompare(b.date))

  const coverage: InvoiceCoverage[] = []
  let charges = 0

  // ── Monthly cycles: the flat fee is the billable unit ────────────────────
  const allCycles = getBillingCycles(student, sessions, breaks, todayIso)
    .filter((c) => c.started && c.start <= effectiveTo)

  const billedCycles: { cycle: typeof allCycles[number]; amount: number }[] = []
  for (const cycle of allCycles.filter((c) => c.rateType === 'monthly')) {
    if (dateFrom && cycle.end < dateFrom) continue
    if (dateTo && cycle.start > dateTo) continue
    if (legacyThrough && cycle.end <= legacyThrough) continue
    // Charging the delta rather than the whole fee lets a cycle that grew
    // after it was invoiced — a break added, an extra logged — bill the
    // difference. A negative delta is a cycle that shrank, most often because
    // the student left mid-cycle and it pro-rated: that has to come back as a
    // credit, or the documents would keep claiming money the ledger doesn't.
    const delta = round2(cycle.amount - (billed.get(cycle.key)?.amount ?? 0))
    if (delta === 0) continue
    charges = round2(charges + delta)
    coverage.push({ ref: cycle.key, kind: 'cycle', amount: delta })
    billedCycles.push({ cycle, amount: delta })
  }

  let monthlyRows = ''
  const monthlyContext: Session[] = []
  for (const { cycle, amount } of billedCycles) {
    const period = `${formatDayMonth(cycle.start)} → ${formatDayMonth(cycle.end)}`

    if (amount < 0) {
      monthlyRows += `<tr class="fee-row">
          <td colspan="2"><strong>${period} — Credit</strong> <span style="font-weight:400">(period revised after invoicing)</span></td>
          <td class="c">—</td>
          <td class="r muted">—</td>
          <td class="r"><strong>-${fmt(Math.abs(amount))}</strong></td>
        </tr>`
      continue
    }

    // A top-up — the cycle grew after it was first invoiced — bills only the
    // difference, so re-listing its sessions would imply they're being
    // charged again. It gets a single explanatory row instead.
    if (amount < cycle.amount) {
      monthlyRows += `<tr class="fee-row">
          <td colspan="2"><strong>${period} — Additional Charges</strong> <span style="font-weight:400">(period already invoiced)</span></td>
          <td class="c">—</td>
          <td class="r muted">—</td>
          <td class="r"><strong>${fmt(amount)}</strong></td>
        </tr>`
      continue
    }

    // Sessions inside a monthly cycle are context, not charges — the fee
    // already covers them — so they're listed without their own price.
    // Extras are the exception: they're billed on top, so they show a price
    // and the fee row drops to the base fee to keep the column honest.
    const inCycle = mySessions.filter((s) => s.date >= cycle.start && s.date <= cycle.end)
    monthlyContext.push(...inCycle)
    for (const s of inCycle) {
      const isExtra   = s.type === 'extra'
      const lineTotal = isExtra ? (s.extraAmount ?? 0) : null
      monthlyRows += `<tr class="data-row">
          <td>${formatDate(s.date)}</td>
          <td><span class="badge badge-${s.type}">${isExtra ? 'Extra' : 'Regular'}</span></td>
          <td class="c">${formatDuration(s.hours)}</td>
          <td class="r ${lineTotal === null ? 'muted' : ''}">${isExtra ? 'extra' : '—'}</td>
          <td class="r ${lineTotal === null ? 'muted' : ''}">${lineTotal === null ? '—' : fmt(lineTotal)}</td>
        </tr>`
    }
    const extended = cycle.breakDays > 0
      ? ` <span style="font-weight:400">(extended ${cycle.breakDays} day${cycle.breakDays !== 1 ? 's' : ''} for breaks)</span>`
      : ''
    const proRated = cycle.proRated ? ' <span style="font-weight:400">(pro-rated)</span>' : ''
    monthlyRows += `<tr class="fee-row">
        <td colspan="2"><strong>${period} — Monthly Fee</strong>${extended}${proRated}</td>
        <td class="c"><strong>${formatDuration(cycle.hours)}</strong></td>
        <td class="r">${fmt(cycle.rate)}/mo</td>
        <td class="r"><strong>${fmt(round2(amount - cycle.extraAmount))}</strong></td>
      </tr>`
  }

  // ── Hourly stretches: each session is its own billable unit ─────────────
  const hourlyBilled: { session: Session; amount: number }[] = []
  const hourlyCandidates = mySessions
    .filter((s) => getRateAt(student, s.date).rateType === 'hourly')
    .filter((s) => s.date <= effectiveTo)
    .filter((s) => !dateFrom || s.date >= dateFrom)
    .filter((s) => !legacyThrough || s.date > legacyThrough)
    .map((s) => ({ session: s, raw: sessionCost(student, s) - (billed.get(s.id)?.amount ?? 0) }))
    .filter((d) => round2(d.raw) !== 0)

  // Ledger cycles round each hourly month once, as a whole. Rounding every
  // session's own delta instead — as this used to — can add up to a few
  // paisa off that figure, since each fractional session gets nudged on its
  // own. Grouping by month and rounding all but the last share normally,
  // with the last one forced to the exact remainder, keeps this total
  // identical to what the ledger shows for the same stretch.
  const byMonth = new Map<string, typeof hourlyCandidates>()
  for (const c of hourlyCandidates) {
    const key = c.session.date.slice(0, 7)
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key)!.push(c)
  }
  for (const group of byMonth.values()) {
    const target = round2(group.reduce((sum, d) => sum + d.raw, 0))
    let allocated = 0
    group.forEach((d, idx) => {
      const delta = idx === group.length - 1 ? round2(target - allocated) : round2(d.raw)
      if (idx !== group.length - 1) allocated = round2(allocated + delta)
      charges = round2(charges + delta)
      coverage.push({ ref: d.session.id, kind: 'session', amount: delta })
      hourlyBilled.push({ session: d.session, amount: delta })
    })
  }

  // Anything billed before that no longer exists at all — a deleted session,
  // a cycle dissolved by a moved anchor — is credited back here. It can't be
  // caught by the loops above because there's nothing left to iterate over.
  const liveRefs = new Set<string>([
    ...allCycles.filter((c) => c.rateType === 'monthly').map((c) => c.key),
    ...mySessions.filter((s) => getRateAt(student, s.date).rateType === 'hourly').map((s) => s.id),
  ])
  let vanishedRows = ''
  for (const [ref, entry] of billed) {
    if (liveRefs.has(ref) || entry.amount <= 0) continue
    charges = round2(charges - entry.amount)
    coverage.push({ ref, kind: entry.kind, amount: round2(-entry.amount) })
    vanishedRows += `<tr class="fee-row">
        <td colspan="2"><strong>Credit — ${entry.kind === 'cycle' ? 'billing period' : 'session'} removed</strong></td>
        <td class="c">—</td>
        <td class="r muted">—</td>
        <td class="r"><strong>-${fmt(entry.amount)}</strong></td>
      </tr>`
  }

  let hourlyRows = ''
  // An invoice can span more than one month; when it does, a flat list makes
  // it hard to tell how much belonged to which, so break it up with a header
  // per month. Not worth the clutter when everything falls in one month.
  const monthsSpanned = new Set(hourlyBilled.map((b) => b.session.date.slice(0, 7))).size
  let lastMonthKey = hourlyBilled[0]?.session.date.slice(0, 7) ?? ''
  for (const { session: s, amount } of hourlyBilled) {
    const monthKey = s.date.slice(0, 7)
    if (monthsSpanned > 1 && monthKey !== lastMonthKey) {
      lastMonthKey = monthKey
      const count = hourlyBilled.filter((b) => b.session.date.slice(0, 7) === monthKey).length
      hourlyRows += `<tr class="month-row">
          <td colspan="5"><strong>${formatMonthLong(monthKey)}</strong> &middot; ${count} session${count !== 1 ? 's' : ''}</td>
        </tr>`
    }
    const isExtra = s.type === 'extra'
    const rate    = getRateAt(student, s.date).ratePerHour
    if (amount < 0) {
      hourlyRows += `<tr class="fee-row">
          <td colspan="2"><strong>${formatDate(s.date)} — Credit</strong> <span style="font-weight:400">(session revised after invoicing)</span></td>
          <td class="c">${formatDuration(s.hours)}</td>
          <td class="r muted">—</td>
          <td class="r"><strong>-${fmt(Math.abs(amount))}</strong></td>
        </tr>`
      continue
    }
    hourlyRows += `<tr class="data-row">
        <td>${formatDate(s.date)}</td>
        <td><span class="badge badge-${s.type}">${isExtra ? 'Extra' : 'Regular'}</span></td>
        <td class="c">${formatDuration(s.hours)}</td>
        <td class="r">${isExtra && typeof s.extraAmount === 'number' ? 'extra' : `${fmt(rate)}/hr`}</td>
        <td class="r">${fmt(amount)}</td>
      </tr>`
  }

  // Ordered on the rows' own date range, not on the sessions: a monthly cycle
  // still prints its fee row when no sessions were logged inside it.
  const monthlyFrom = billedCycles[0]?.cycle.start ?? ''
  const hourlyFrom  = hourlyBilled[0]?.session.date ?? ''
  const dated = !monthlyRows || !hourlyRows
    ? (monthlyRows || hourlyRows)
    : monthlyFrom <= hourlyFrom
      ? monthlyRows + hourlyRows
      : hourlyRows + monthlyRows
  const sessionRows = dated + vanishedRows

  const periodBounds = [
    ...(billedCycles.length
      ? [billedCycles[0].cycle.start, billedCycles[billedCycles.length - 1].cycle.end]
      : []),
    ...(hourlyBilled.length
      ? [hourlyBilled[0].session.date, hourlyBilled[hourlyBilled.length - 1].session.date]
      : []),
  ].sort()
  const periodLabel = periodBounds.length
    ? `${formatDate(periodBounds[0])} → ${formatDate(periodBounds[periodBounds.length - 1])}`
    : `up to ${formatDate(effectiveTo)}`

  const counted = [...monthlyContext, ...hourlyBilled.filter((b) => b.amount > 0).map((b) => b.session)]
  const totalHours = counted.reduce((sum, s) => sum + s.hours, 0)

  return {
    issued,
    periodLabel,
    sessionCount: counted.length,
    totalHoursLabel: formatDuration(totalHours),
    isMonthly,
    sessionRows,
    charges,
    previousBalance: previousBalanceFor(student, payments, invoices),
    coverage,
  }
}

/**
 * Live numbers for the draft editor — no HTML, no side effects.
 * Cheap enough to recompute on every keystroke while adjustments are edited.
 */
export function previewInvoiceTotals(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  dateFrom: string = '',
  dateTo: string = '',
  breaks: Break[] = [],
  adjustments: InvoiceAdjustment[] = [],
  invoices: Invoice[] = [],
): {
  periodLabel: string; charges: number; sessionCount: number
  previousBalance: number; total: number; amountDueNow: number
} {
  const data = computeInvoiceData(student, sessions, payments, dateFrom, dateTo, breaks, invoices)
  const total = round2(data.charges + sumAdjustments(adjustments))
  return {
    periodLabel: data.periodLabel,
    charges: data.charges,
    sessionCount: data.sessionCount,
    previousBalance: data.previousBalance,
    total,
    amountDueNow: round2(data.previousBalance + total),
  }
}

/**
 * The next invoice number in sequence, e.g. INV-2026-0007.
 * Numbering is per calendar year and only ever consumed by a finalised
 * invoice, so drafts can be created and discarded without leaving gaps.
 */
export function nextInvoiceNumber(invoices: Invoice[], today: string = todayISO()): string {
  const year = today.slice(0, 4)
  const prefix = `INV-${year}-`
  const highest = invoices
    .filter((i) => i.invoiceNumber?.startsWith(prefix))
    .reduce((max, i) => Math.max(max, parseInt(i.invoiceNumber.slice(prefix.length), 10) || 0), 0)
  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

interface DraftInput {
  periodFrom: string
  periodTo: string
  adjustments: InvoiceAdjustment[]
}
function render(
  student: Student,
  teacherName: string,
  data: InvoiceComputation,
  adjustments: InvoiceAdjustment[],
  invNo: string,
  isDraft: boolean,
): { html: string; total: number; amountDueNow: number } {
  const currency = student.currency ?? DEFAULT_CURRENCY
  const fmt      = (n: number) => formatCurrency(n, currency)
  const currentRate = getRateAt(student, todayISO())

  const total = round2(data.charges + sumAdjustments(adjustments))
  const amountDueNow = round2(data.previousBalance + total)

  const html = buildInvoiceHTML({
    invNo, teacherName, issued: data.issued,
    student: { ...student, ratePerHour: currentRate.ratePerHour },
    isMonthly: data.isMonthly,
    periodLabel: data.periodLabel, sessionCount: data.sessionCount,
    totalHoursLabel: data.totalHoursLabel,
    charges: data.charges, previousBalance: data.previousBalance, amountDueNow,
    sessionRows: data.sessionRows, fmt, adjustments, isDraft,
  })

  return { html, total, amountDueNow }
}

/** Renders a draft to HTML for on-screen review. Watermarked, unnumbered, never stored. */
export function previewDraftInvoice(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  teacherName: string,
  draft: DraftInput,
  breaks: Break[] = [],
  invoices: Invoice[] = [],
): void {
  const adjustments = draft.adjustments ?? []
  const data = computeInvoiceData(
    student, sessions, payments, draft.periodFrom, draft.periodTo, breaks, invoices,
  )
  const { html } = render(student, teacherName, data, adjustments, 'DRAFT', true)

  const safeName = student.name.replace(/[^a-zA-Z0-9]/g, '-')
  openPDFWindow(html, `DRAFT_Invoice_${safeName}`)
}

/**
 * Finalises a draft: works out what's still unbilled, assigns the next number
 * in sequence, and freezes both the coverage claim and the rendered HTML so a
 * reprint years later reproduces exactly what was sent.
 */
export function finalizeInvoice(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  teacherName: string,
  draft: DraftInput,
  breaks: Break[],
  invoiceNumber: string,
  invoices: Invoice[] = [],
): Pick<Invoice,
  'status' | 'invoiceNumber' | 'issuedDate' | 'periodLabel' | 'coverage'
  | 'charges' | 'total' | 'previousBalance' | 'amountDueNow' | 'html'
> {
  const adjustments = draft.adjustments ?? []
  const data = computeInvoiceData(
    student, sessions, payments, draft.periodFrom, draft.periodTo, breaks, invoices,
  )
  const { html, total, amountDueNow } =
    render(student, teacherName, data, adjustments, invoiceNumber, false)

  return {
    status: 'issued',
    invoiceNumber,
    issuedDate: todayISO(),
    periodLabel: data.periodLabel,
    coverage: data.coverage,
    charges: data.charges,
    total,
    previousBalance: data.previousBalance,
    amountDueNow,
    html,
  }
}

/** Reprints an already-issued invoice from its frozen record — no recomputation. */
export function reprintInvoice(invoice: Invoice, studentName: string): void {
  const safeName = studentName.replace(/[^a-zA-Z0-9]/g, '-')
  openPDFWindow(invoice.html, `Invoice_${safeName}_${invoice.invoiceNumber}`)
}

/** True once some issued document has reversed this one. */
export function isCredited(invoice: Invoice, invoices: Invoice[]): boolean {
  return invoices.some((i) => i.creditsInvoiceId === invoice.id && i.status === 'issued')
}

/** Credit notes are numbered in their own sequence, e.g. CN-2026-0003. */
export function nextCreditNoteNumber(invoices: Invoice[], today: string = todayISO()): string {
  const prefix = `CN-${today.slice(0, 4)}-`
  const highest = invoices
    .filter((i) => i.invoiceNumber?.startsWith(prefix))
    .reduce((max, i) => Math.max(max, parseInt(i.invoiceNumber.slice(prefix.length), 10) || 0), 0)
  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

/**
 * Reverses an issued invoice with a counter-document, the way real ledgers
 * undo a bill that has already been sent — the original stays reprintable
 * and numbered, and the two totals cancel out.
 *
 * Every sign is flipped, coverage included, so the work it claimed becomes
 * billable again and can be re-invoiced correctly.
 */
export function buildCreditNote(
  student: Student,
  original: Invoice,
  teacherName: string,
  payments: Payment[],
  invoices: Invoice[],
  creditNoteNumber: string,
): Omit<Invoice, 'id' | 'createdAt'> {
  const currency = student.currency ?? DEFAULT_CURRENCY
  const fmt      = (n: number) => formatCurrency(n, currency)
  const todayIso = todayISO()
  const currentRate = getRateAt(student, todayIso)

  const coverage    = (original.coverage ?? []).map((c) => ({ ...c, amount: round2(-c.amount) }))
  const adjustments = (original.adjustments ?? []).map((a) => ({ ...a, amount: round2(-a.amount) }))
  const charges     = round2(-original.charges)
  const total       = round2(-original.total)
  const previousBalance = previousBalanceFor(student, payments, invoices)
  const amountDueNow    = round2(previousBalance + total)

  const rows = `<tr class="fee-row">
      <td colspan="2"><strong>Reversal of ${original.invoiceNumber}</strong> <span style="font-weight:400">(${original.periodLabel})</span></td>
      <td class="c">—</td>
      <td class="r muted">—</td>
      <td class="r"><strong>-${fmt(Math.abs(charges))}</strong></td>
    </tr>`

  const html = buildInvoiceHTML({
    invNo: creditNoteNumber, teacherName, issued: formatDayMonth(todayIso),
    student: { ...student, ratePerHour: currentRate.ratePerHour },
    isMonthly: currentRate.rateType === 'monthly',
    periodLabel: original.periodLabel, sessionCount: 0, totalHoursLabel: formatDuration(0),
    charges, previousBalance, amountDueNow,
    sessionRows: rows, fmt, adjustments, isDraft: false, isCreditNote: true,
  })

  return {
    studentId: student.id,
    status: 'issued',
    invoiceNumber: creditNoteNumber,
    issuedDate: todayIso,
    periodFrom: original.periodFrom,
    periodTo: original.periodTo,
    periodLabel: original.periodLabel,
    coverage,
    charges,
    adjustments,
    total,
    previousBalance,
    amountDueNow,
    html,
    creditsInvoiceId: original.id,
  }
}
