/**
 * billingExcel.ts
 * Excel export helpers (per-student and all-students summary).
 * Uses ExcelJS for full style support.
 */
import ExcelJS from 'exceljs'
import { formatDate, getMonthlyBreakdown } from './billing'
import { DEFAULT_CURRENCY } from '@constants'
import { applyBoldStyle } from './excelUtils'
import type { Student, Session, Payment } from '@/types'

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export per-student data as a .xlsx file.
 * Sheets: Sessions · Payments · Summary
 */
export async function exportToExcel(
  student: Student,
  sessions: Session[],
  payments: Payment[],
): Promise<void> {
  const currency  = student.currency ?? DEFAULT_CURRENCY
  const monthly   = getMonthlyBreakdown(sessions, payments, student.ratePerHour, student.rateType)
  const totalHours  = sessions.reduce((sum, s) => sum + s.hours, 0)
  const totalEarned = monthly.reduce((sum, m) => sum + m.amount, 0)
  const totalPaid   = payments.reduce((sum, p) => sum + p.amount, 0)
  const balance     = totalEarned - totalPaid

  const wb = new ExcelJS.Workbook()
  wb.creator = 'TutorDesk'
  wb.created = new Date()

  // ── Sessions sheet ──────────────────────────────────────────
  const sessionsSheet = wb.addWorksheet('Sessions')
  sessionsSheet.columns = [
    { header: 'Date',              key: 'date',   width: 14 },
    { header: 'Type',              key: 'type',   width: 12 },
    { header: 'Hours',             key: 'hours',  width: 8  },
    { header: `Amount (${currency})`, key: 'amount', width: 16 },
  ]
  applyBoldStyle(sessionsSheet.getRow(1))
  sessions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((s) => {
      const amount = isMonthly ? null : parseFloat((s.hours * student.ratePerHour).toFixed(2))
      sessionsSheet.addRow({ date: formatDate(s.date), type: s.type, hours: s.hours, amount })
    })
  if (isMonthly) {
    sessionsSheet.addRow({})
    monthly.slice().sort((a, b) => a.key.localeCompare(b.key)).forEach((m) => {
      const row = sessionsSheet.addRow({
        date: `${m.month} – Monthly Fee`, type: '', hours: m.hours, amount: m.amount,
      })
      row.font = { bold: true }
    })
  }
  sessionsSheet.addRow({})
  applyBoldStyle(
    sessionsSheet.addRow({ date: 'TOTAL', type: '', hours: totalHours, amount: totalEarned }),
  )

  // ── Payments sheet ──────────────────────────────────────────
  const paymentsSheet = wb.addWorksheet('Payments')
  paymentsSheet.columns = [
    { header: 'Date',              key: 'date',   width: 14 },
    { header: `Amount (${currency})`, key: 'amount', width: 16 },
  ]
  applyBoldStyle(paymentsSheet.getRow(1))
  payments
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((p) => paymentsSheet.addRow({ date: formatDate(p.date), amount: p.amount }))
  paymentsSheet.addRow({})
  applyBoldStyle(paymentsSheet.addRow({ date: 'TOTAL PAID',  amount: totalPaid }))
  applyBoldStyle(paymentsSheet.addRow({ date: 'BALANCE DUE', amount: balance   }))

  // ── Summary sheet ────────────────────────────────────────────
  const summarySheet = wb.addWorksheet('Summary')
  summarySheet.columns = [{ key: 'k', width: 20 }, { key: 'v', width: 28 }]
  applyBoldStyle(summarySheet.addRow({ k: 'Field', v: 'Value' }))
  summarySheet.addRow({ k: 'Student',  v: student.name })
  summarySheet.addRow({ k: 'City',     v: student.city ?? '' })
  summarySheet.addRow({ k: 'Rate',     v: `${student.ratePerHour} ${currency}/${isMonthly ? 'month' : 'hr'}` })
  summarySheet.addRow({ k: 'Exported', v: formatDate(new Date().toISOString().slice(0, 10)) })
  summarySheet.addRow({})
  summarySheet.addRow({ k: 'Total Hours',  v: totalHours })
  summarySheet.addRow({ k: 'Total Earned', v: totalEarned })
  summarySheet.addRow({ k: 'Total Paid',   v: totalPaid })
  applyBoldStyle(summarySheet.addRow({ k: 'Balance Due', v: balance }))

  await downloadWorkbook(wb, `${student.name}-billing-${new Date().toISOString().slice(0, 10)}.xlsx`)
}

/**
 * Export ALL students summary as a .xlsx file.
 */
export async function exportAllStudentsSummaryExcel(
  students: Student[],
  sessions: Session[],
  payments: Payment[],
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TutorDesk'
  wb.created = new Date()

  // ── Overview sheet ───────────────────────────────────────────
  const overviewSheet = wb.addWorksheet('Summary')
  overviewSheet.columns = [
    { header: 'Student',      key: 'student',  width: 18 },
    { header: 'Month',        key: 'month',    width: 18 },
    { header: 'Hours Taught', key: 'hours',    width: 14 },
    { header: 'Rate',         key: 'rate',     width: 12 },
    { header: 'Earned',       key: 'earned',   width: 14 },
    { header: 'Paid',         key: 'paid',     width: 14 },
    { header: 'Balance',      key: 'balance',  width: 14 },
    { header: 'Currency',     key: 'currency', width: 10 },
  ]
  applyBoldStyle(overviewSheet.getRow(1))

  students.forEach((student) => {
    const studentSessions = sessions.filter((x) => x.studentId === student.id)
    const studentPayments = payments.filter((x) => x.studentId === student.id)
    const monthly = getMonthlyBreakdown(studentSessions, studentPayments, student.ratePerHour, student.rateType)
    const currency = student.currency ?? DEFAULT_CURRENCY

    if (monthly.length === 0) {
      overviewSheet.addRow({
        student: student.name, month: '—', hours: 0,
        rate: student.ratePerHour, earned: 0, paid: 0, balance: 0, currency,
      })
    } else {
      monthly.forEach((m) =>
        overviewSheet.addRow({
          student: student.name, month: m.month, hours: m.hours,
          rate: student.ratePerHour, earned: m.amount, paid: m.paid, balance: m.balance, currency,
        }),
      )
    }
    const totalHours  = studentSessions.reduce((sum, x) => sum + x.hours, 0)
    const totalEarned = monthly.reduce((sum, m) => sum + m.amount, 0)
    const totalPaid   = studentPayments.reduce((sum, x) => sum + x.amount, 0)
    const totalRow = overviewSheet.addRow({
      student: `${student.name} TOTAL`, month: 'ALL TIME', hours: totalHours,
      rate: '', earned: totalEarned, paid: totalPaid, balance: totalEarned - totalPaid, currency,
    })
    totalRow.font = { bold: true }
    overviewSheet.addRow({})
  })

  // ── One sheet per student ────────────────────────────────────
  students.forEach((student) => {
    const currency        = student.currency ?? DEFAULT_CURRENCY
    const studentSessions = sessions
      .filter((x) => x.studentId === student.id)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
    const studentPayments = payments
      .filter((x) => x.studentId === student.id)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
    const sheetName = student.name.replace(/[\\/:*?[\]]/g, '').slice(0, 31)
    const sheet = wb.addWorksheet(sheetName)
    sheet.columns = [
      { header: 'Date',              key: 'date',   width: 14 },
      { header: 'Type',              key: 'type',   width: 12 },
      { header: 'Hours',             key: 'hours',  width: 8  },
      { header: `Amount (${currency})`, key: 'amount', width: 16 },
    ]
    applyBoldStyle(sheet.getRow(1))
    studentSessions.forEach((s) =>
      sheet.addRow({
        date: formatDate(s.date), type: s.type, hours: s.hours,
        amount: (student.rateType ?? 'hourly') === 'monthly' ? null : s.hours * student.ratePerHour,
      }),
    )
    sheet.addRow({})
    const totalHours  = studentSessions.reduce((sum, s) => sum + s.hours, 0)
    const monthly     = getMonthlyBreakdown(studentSessions, studentPayments, student.ratePerHour, student.rateType)
    const totalEarned = monthly.reduce((sum, m) => sum + m.amount, 0)
    applyBoldStyle(
      sheet.addRow({ date: 'TOTAL SESSIONS', type: '', hours: totalHours, amount: totalEarned }),
    )
    sheet.addRow({})
    const paymentHeader = sheet.addRow({ date: 'PAYMENTS', type: `Amount (${currency})` })
    paymentHeader.font = { bold: true }
    studentPayments.forEach((p) =>
      sheet.addRow({ date: formatDate(p.date), type: '', hours: null, amount: p.amount }),
    )
    const totalPaid = studentPayments.reduce((sum, p) => sum + p.amount, 0)
    applyBoldStyle(sheet.addRow({ date: 'TOTAL PAID',   type: '', hours: null, amount: totalPaid }))
    applyBoldStyle(sheet.addRow({ date: 'BALANCE DUE',  type: '', hours: null, amount: totalEarned - totalPaid }))
  })

  await downloadWorkbook(wb, `tutordesk-summary-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
