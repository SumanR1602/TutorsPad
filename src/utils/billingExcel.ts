/**
 * billingExcel.ts
 * Excel export helpers (per-student and all-students summary).
 * Uses ExcelJS for full style support.
 */
import ExcelJS from 'exceljs'
import { formatDate, getMonthlyBreakdown } from './billing'
import { DEFAULT_CURRENCY } from '@constants'
import { applyBoldStyle, addSheetHeader } from './excel'
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
  const isMonthly  = (student.rateType ?? 'hourly') === 'monthly'
  const monthly   = getMonthlyBreakdown(sessions, payments, student.ratePerHour, student.rateType)
  const totalHours  = sessions.reduce((sum, s) => sum + s.hours, 0)
  const totalEarned = monthly.reduce((sum, m) => sum + m.amount, 0)
  const totalPaid   = payments.reduce((sum, p) => sum + p.amount, 0)
  const balance     = totalEarned - totalPaid

  const wb = new ExcelJS.Workbook()
  wb.creator = 'TutorsPad'
  wb.created = new Date()

  // ── Sessions sheet ──────────────────────────────────────────
  const sessionsSheet = wb.addWorksheet('Sessions')
  sessionsSheet.columns = [
    { key: 'date',   width: 14 },
    { key: 'type',   width: 12 },
    { key: 'hours',  width: 8  },
    { key: 'amount', width: 16 },
  ]
  addSheetHeader(sessionsSheet, 'SESSIONS', 4)
  applyBoldStyle(sessionsSheet.addRow({ date: 'Date', type: 'Type', hours: 'Hours', amount: `Amount (${currency})` }))
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
    { key: 'date',   width: 14 },
    { key: 'amount', width: 16 },
  ]
  addSheetHeader(paymentsSheet, 'PAYMENTS', 2)
  applyBoldStyle(paymentsSheet.addRow({ date: 'Date', amount: `Amount (${currency})` }))
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
  addSheetHeader(summarySheet, 'SUMMARY', 2)
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
  wb.creator = 'TutorsPad'
  wb.created = new Date()

  // ── Overview sheet ───────────────────────────────────────────
  const overviewSheet = wb.addWorksheet('Summary')
  overviewSheet.columns = [
    { key: 'student',  width: 18 },
    { key: 'month',    width: 18 },
    { key: 'hours',    width: 14 },
    { key: 'rate',     width: 12 },
    { key: 'earned',   width: 14 },
    { key: 'paid',     width: 14 },
    { key: 'balance',  width: 14 },
    { key: 'currency', width: 10 },
  ]

  // Title row
  overviewSheet.addRow(['TUTORSPAD', '', '', '', '', '', '', ''])
  overviewSheet.mergeCells('A1:H1')
  const overviewTitle = overviewSheet.getCell('A1')
  overviewTitle.value = 'TUTORSPAD'
  overviewTitle.font = { bold: true, size: 16 }
  overviewTitle.alignment = { horizontal: 'center', vertical: 'middle' }
  overviewSheet.getRow(1).height = 32

  // Header row
  const overviewHeader = overviewSheet.addRow({
    student: 'Student', month: 'Month', hours: 'Hours Taught',
    rate: 'Rate', earned: 'Earned', paid: 'Paid', balance: 'Balance', currency: 'Currency',
  })
  applyBoldStyle(overviewHeader)

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
      { key: 'date',   width: 14 },
      { key: 'type',   width: 12 },
      { key: 'hours',  width: 8  },
      { key: 'amount', width: 16 },
    ]

    // App title row
    sheet.addRow(['TUTORSPAD', '', '', ''])
    sheet.mergeCells(`A1:D1`)
    const appTitleCell = sheet.getCell('A1')
    appTitleCell.value = 'TUTORSPAD'
    appTitleCell.font = { bold: true, size: 16 }
    appTitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(1).height = 32

    // Student name row
    sheet.addRow([student.name, '', '', ''])
    sheet.mergeCells(`A2:D2`)
    const nameTitleCell = sheet.getCell('A2')
    nameTitleCell.value = student.name
    nameTitleCell.font = { bold: true, size: 13 }
    nameTitleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(2).height = 24

    sheet.addRow({})

    // Header row
    const studentHeader = sheet.addRow({ date: 'Date', type: 'Type', hours: 'Hours', amount: `Amount (${currency})` })
    applyBoldStyle(studentHeader)
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

  await downloadWorkbook(wb, `tutorspad-summary-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
