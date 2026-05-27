/**
 * billingInvoice.ts
 * Orchestrator — filters sessions, computes values, builds rows,
 * then delegates HTML rendering to billingInvoiceTemplate.ts.
 */
import { formatDate, getMonthlyBreakdown, formatCurrency, openPDFWindow } from './billing'
import { buildInvoiceHTML } from './templates/billingInvoiceTemplate'
import type { Student, Session, Payment } from '@/types'

export function openInvoicePDF(
  student: Student,
  sessions: Session[],
  _payments: Payment[],
  teacherName: string = 'Teacher',
  dateFrom: string = '',
  dateTo: string = '',
): void {
  // ── 1. Filter sessions to requested date range ─────────────────────
  const filtered = sessions.filter(
    (s) => (!dateFrom || s.date >= dateFrom) && (!dateTo || s.date <= dateTo),
  )

  // ── 2. Derived values ──────────────────────────────────────────────
  const currency  = student.currency ?? 'INR'
  const isMonthly = (student.rateType ?? 'hourly') === 'monthly'
  const formatValue = (n: number) => formatCurrency(n, currency)
  const today     = new Date()
  const issued    = today.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
  const invNo     = `INV-${today.toISOString().slice(0, 10).replace(/-/g, '')}-${student.name.slice(0, 3).toUpperCase()}`

  const totalHours  = filtered.reduce((sum, s) => sum + s.hours, 0)
  const monthly     = getMonthlyBreakdown(filtered, [], student.ratePerHour, student.rateType)
  const totalEarned = monthly.reduce((sum, m) => sum + m.amount, 0)

  // ── 3. Period label ────────────────────────────────────────────────
  let periodLabel: string
  if (dateFrom && dateTo)      periodLabel = `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
  else if (dateFrom)           periodLabel = `From ${formatDate(dateFrom)}`
  else if (dateTo)             periodLabel = `Until ${formatDate(dateTo)}`
  else if (monthly.length > 0) periodLabel = [...new Set(monthly.map((m) => m.month))].sort().join(', ')
  else                         periodLabel = '—'

  // ── 4. Build session rows HTML ─────────────────────────────────────
  let sessionRows = ''
  if (isMonthly) {
    const monthKeys = [...new Set(filtered.map((s) => s.date.slice(0, 7)))].sort()
    monthKeys.forEach((key) => {
      const monthSessions = filtered.filter((s) => s.date.startsWith(key)).sort((a, b) => a.date.localeCompare(b.date))
      const monthData     = monthly.find((m) => m.key === key)
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
          <td colspan="2"><strong>${monthData ? monthData.month : key} — Monthly Tuition Fee</strong></td>
          <td class="c"><strong>${monthHours.toFixed(1)}h</strong></td>
          <td class="r">${formatValue(student.ratePerHour)}/mo</td>
          <td class="r"><strong>${monthData ? formatValue(monthData.amount) : '—'}</strong></td>
        </tr>`
    })
  } else {
    filtered.slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => {
      sessionRows += `<tr class="data-row">
          <td>${formatDate(s.date)}</td>
          <td><span class="badge badge-${s.type}">${s.type === 'extra' ? 'Extra' : 'Regular'}</span></td>
          <td class="c">${s.hours}h</td>
          <td class="r">${formatValue(student.ratePerHour)}/hr</td>
          <td class="r">${formatValue(s.hours * student.ratePerHour)}</td>
        </tr>`
    })
  }

  // ── 5. Render HTML via template ────────────────────────────────────
  const html = buildInvoiceHTML({
    invNo, teacherName, issued, student, isMonthly,
    periodLabel, filtered, totalHours, totalEarned,
    sessionRows, fmt: formatValue,
  })

  // ── 6. Open tab + inject auto-download script ──────────────────────
  const safeName = student.name.replace(/[^a-zA-Z0-9]/g, '-')
  const dateTag  = dateFrom && dateTo
    ? `_${dateFrom}_to_${dateTo}`
    : dateFrom ? `_from_${dateFrom}` : dateTo ? `_until_${dateTo}` : ''
  const filename = `Invoice_${safeName}${dateTag}_${invNo}`
  openPDFWindow(html, filename)
}
