/**
 * billingReceipt.ts
 * Orchestrator — computes the receipt data for a specific payment,
 * then delegates HTML rendering to receiptTemplate.ts.
 */
import { formatDate, formatCurrency, openPDFWindow } from './billing'
import { buildReceiptHTML } from './templates/receiptTemplate'
import type { Student, Session, Payment } from '@/types'

export function openReceiptPDF(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  payment: Payment,
  teacherName: string = 'Teacher',
): void {
  const currency     = student.currency ?? 'INR'
  const isMonthly    = (student.rateType ?? 'hourly') === 'monthly'
  const formatValue  = (n: number) => formatCurrency(n, currency)
  const today        = new Date()
  const issued       = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const recNo        = `REC-${payment.date.replace(/-/g, '')}-${student.name.slice(0, 3).toUpperCase()}`

  // ── 1. Find the previous payment to determine the period start ────
  const sortedPayments = [...payments].sort((a, b) =>
    a.date !== b.date
      ? a.date.localeCompare(b.date)
      : (a.createdAt ?? '').localeCompare(b.createdAt ?? ''),
  )
  const currentIdx  = sortedPayments.findIndex((p) => p.id === payment.id)
  const prevPayment = currentIdx > 0 ? sortedPayments[currentIdx - 1] : null
  const periodStart = prevPayment ? prevPayment.date : null

  // ── 2. Sessions for this period only ─────────────────────────────
  const sessionsPeriod = sessions
    .filter((s) => s.date <= payment.date && (!periodStart || s.date > periodStart))
    .sort((a, b) => a.date.localeCompare(b.date))

  // ── 3-4. Cumulative totals ────────────────────────────────────────
  const paymentsUpTo  = payments.filter((p) => p.date <= payment.date)
  const totalPaidUpTo = paymentsUpTo.reduce((sum, p) => sum + p.amount, 0)

  // ── 5. Carry-forward balance ──────────────────────────────────────
  const prevPaymentsTotal = sortedPayments
    .slice(0, currentIdx)
    .reduce((sum, p) => sum + p.amount, 0)

  const sessionsBeforePeriod = sessions.filter(
    (s) => (periodStart ? s.date <= periodStart : false),
  )
  const costBeforePeriod = isMonthly
    ? new Set(sessionsBeforePeriod.map((s) => s.date.slice(0, 7))).size * student.ratePerHour
    : sessionsBeforePeriod.reduce((sum, s) => sum + s.hours * student.ratePerHour, 0)

  const carryForward = prevPaymentsTotal - costBeforePeriod

  // ── 6. Period due ─────────────────────────────────────────────────
  const periodDue = isMonthly
    ? new Set(sessionsPeriod.map((s) => s.date.slice(0, 7))).size * student.ratePerHour
    : sessionsPeriod.reduce((sum, s) => sum + s.hours * student.ratePerHour, 0)

  const totalHours    = sessionsPeriod.reduce((sum, s) => sum + s.hours, 0)
  const creditBalance = carryForward + payment.amount - periodDue
  const creditHours   = isMonthly ? null : creditBalance / student.ratePerHour
  const sessionCount  = sessionsPeriod.length

  const dayAfter = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  const periodLabel = periodStart
    ? `${dayAfter(periodStart)} → ${payment.date}`
    : `up to ${payment.date}`

  // Suppress unused variable warning — used for cumulative display in template
  void totalPaidUpTo

  // ── 7. Build session rows HTML ─────────────────────────────────────
  let sessionRows = ''

  if (isMonthly) {
    const monthKeys = [...new Set(sessionsPeriod.map((s) => s.date.slice(0, 7)))].sort()
    monthKeys.forEach((key) => {
      const monthSessions = sessionsPeriod.filter((s) => s.date.startsWith(key))
      const monthHours    = monthSessions.reduce((sum, s) => sum + s.hours, 0)
      monthSessions.forEach((s) => {
        sessionRows += `<tr>
            <td>${formatDate(s.date)}</td>
            <td><span class="badge badge-${s.type}">${s.type === 'extra' ? 'Extra' : 'Regular'}</span></td>
            <td class="c">${s.hours}h</td>
            <td class="r muted">—</td>
            <td class="r muted">—</td>
          </tr>`
      })
      sessionRows += `<tr style="background:#f0fdf4">
          <td colspan="2" style="color:#15803d;font-weight:600">${new Date(key + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' })} — Monthly Fee</td>
          <td class="c" style="color:#15803d;font-weight:600">${monthHours.toFixed(1)}h</td>
          <td class="r" style="color:#15803d">${formatValue(student.ratePerHour)}/mo</td>
          <td class="r" style="color:#15803d;font-weight:600">${formatValue(student.ratePerHour)}</td>
        </tr>`
    })
  } else {
    sessionsPeriod.forEach((s) => {
      sessionRows += `<tr>
          <td>${formatDate(s.date)}</td>
          <td><span class="badge badge-${s.type}">${s.type === 'extra' ? 'Extra' : 'Regular'}</span></td>
          <td class="c">${s.hours}h</td>
          <td class="r">${formatValue(student.ratePerHour)}/hr</td>
          <td class="r">${formatValue(s.hours * student.ratePerHour)}</td>
        </tr>`
    })
  }

  // ── 8. Render HTML ─────────────────────────────────────────────────
  const html = buildReceiptHTML({
    recNo, teacherName, issued, student, isMonthly,
    payment, periodLabel, sessionRows, sessionCount, totalHours,
    carryForward, periodDue, creditBalance, creditHours, fmt: formatValue,
  })

  // ── 9. Open tab + auto-download ──────────────────────────────────────
  const safeName = student.name.replace(/[^a-zA-Z0-9]/g, '-')
  const filename = `Receipt_${safeName}_${payment.date}_${recNo}`
  openPDFWindow(html, filename)
}
