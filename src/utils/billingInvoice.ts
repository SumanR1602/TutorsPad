/**
 * billingInvoice.ts
 * Orchestrator — mirrors billingReceipt.ts logic but for invoices (pre-payment).
 * Auto-determines billing period from last payment date.
 */
import { formatDate, formatCurrency, openPDFWindow } from './billing'
import { buildInvoiceHTML } from './templates/billingInvoiceTemplate'
import type { Student, Session, Payment } from '@/types'

export function openInvoicePDF(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  teacherName: string = 'Teacher',
  dateFrom: string = '',
  dateTo: string = '',
): void {
  const currency    = student.currency ?? 'INR'
  const isMonthly   = (student.rateType ?? 'hourly') === 'monthly'
  const formatValue = (n: number) => formatCurrency(n, currency)
  const today       = new Date()
  const todayIso    = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const issued      = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const invNo       = `INV-${todayIso.replace(/-/g,'')}-${student.name.slice(0,3).toUpperCase()}`

  const dayAfter = (iso: string) => {
    const d = new Date(iso + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  // ── 1. Determine period from last payment ──────────────────────────
  const sortedPayments = [...payments].sort((a, b) => a.date.localeCompare(b.date))
  const lastPayment    = sortedPayments[sortedPayments.length - 1] ?? null
  const periodStart    = lastPayment ? lastPayment.date : null

  const effectiveDateFrom = dateFrom || (periodStart ? dayAfter(periodStart) : '')
  const effectiveDateTo   = dateTo   || todayIso

  // ── 2. Sessions for this billing period ───────────────────────────
  const filtered = sessions
    .filter((s) => (!effectiveDateFrom || s.date >= effectiveDateFrom) && s.date <= effectiveDateTo)
    .sort((a, b) => a.date.localeCompare(b.date))

  const totalHours = filtered.reduce((sum, s) => sum + s.hours, 0)
  const sessionCount = filtered.length

  // ── 3. Period due ──────────────────────────────────────────────────
  const periodDue = isMonthly
    ? new Set(filtered.map((s) => s.date.slice(0,7))).size * student.ratePerHour
    : filtered.reduce((sum, s) => sum + s.hours * student.ratePerHour, 0)

  // ── 4. Carry-forward (same logic as receipt) ───────────────────────
  const sessionsBeforePeriod = sessions.filter((s) => periodStart ? s.date <= periodStart : false)
  const costBeforePeriod = isMonthly
    ? new Set(sessionsBeforePeriod.map((s) => s.date.slice(0,7))).size * student.ratePerHour
    : sessionsBeforePeriod.reduce((sum, s) => sum + s.hours * student.ratePerHour, 0)

  const totalPaid    = payments.reduce((sum, p) => sum + p.amount, 0)
  const carryForward = totalPaid - costBeforePeriod   // +ve = credit, -ve = debit

  // ── 5. Amount due now ──────────────────────────────────────────────
  const amountDueNow = periodDue - carryForward  // credit reduces; previous debit increases

  // ── 6. Period label ────────────────────────────────────────────────
  const periodLabel = effectiveDateFrom
    ? `${effectiveDateFrom} → ${effectiveDateTo}`
    : `up to ${effectiveDateTo}`

  // ── 7. Build session rows HTML ─────────────────────────────────────
  let sessionRows = ''
  if (isMonthly) {
    const monthKeys = [...new Set(filtered.map((s) => s.date.slice(0,7)))].sort()
    monthKeys.forEach((key) => {
      const monthSessions = filtered.filter((s) => s.date.startsWith(key))
      const monthHours    = monthSessions.reduce((sum, s) => sum + s.hours, 0)
      monthSessions.forEach((s) => {
        sessionRows += `<tr class="data-row">
            <td>${formatDate(s.date)}</td>
            <td><span class="badge badge-${s.type}">${s.type === 'extra' ? 'Extra' : 'Regular'}</span></td>
            <td class="c">${s.hours}h</td>
            <td class="r muted">—</td>
            <td class="r muted">—</td>
          </tr>`
      })
      sessionRows += `<tr class="fee-row">
          <td colspan="2"><strong>${new Date(key+'-01').toLocaleString('en-IN',{month:'long',year:'numeric'})} — Monthly Tuition Fee</strong></td>
          <td class="c"><strong>${monthHours.toFixed(1)}h</strong></td>
          <td class="r">${formatValue(student.ratePerHour)}/mo</td>
          <td class="r"><strong>${formatValue(student.ratePerHour)}</strong></td>
        </tr>`
    })
  } else {
    filtered.forEach((s) => {
      sessionRows += `<tr class="data-row">
          <td>${formatDate(s.date)}</td>
          <td><span class="badge badge-${s.type}">${s.type === 'extra' ? 'Extra' : 'Regular'}</span></td>
          <td class="c">${s.hours}h</td>
          <td class="r">${formatValue(student.ratePerHour)}/hr</td>
          <td class="r">${formatValue(s.hours * student.ratePerHour)}</td>
        </tr>`
    })
  }

  // ── 8. Render ──────────────────────────────────────────────────────
  const html = buildInvoiceHTML({
    invNo, teacherName, issued, student, isMonthly,
    periodLabel, sessionCount, totalHours, periodDue, carryForward, amountDueNow,
    sessionRows, fmt: formatValue,
  })

  const safeName = student.name.replace(/[^a-zA-Z0-9]/g, '-')
  openPDFWindow(html, `Invoice_${safeName}_${invNo}`)
}
