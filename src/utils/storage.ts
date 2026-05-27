/**
 * storage.ts
 * Helpers for export/import of app data.
 * Uses useStore.getState() directly instead of receiving store as parameter.
 */
import ExcelJS from 'exceljs'
import useStore from '@store/useStore'
import { applyBoldStyle } from './excelUtils'
import type { Student, Session, Payment, Settings } from '@/types'

export async function exportAllData(): Promise<void> {
  const { students, sessions, payments, settings } = useStore.getState()
  const studentMap: Record<string, string> = Object.fromEntries(
    students.map((s) => [s.id, s.name]),
  )

  const wb = new ExcelJS.Workbook()
  wb.creator = 'TutorDesk'
  wb.created = new Date()

  // Students sheet
  const studentsSheet = wb.addWorksheet('Students')
  studentsSheet.columns = [
    { header: 'Name',           key: 'name',      width: 18 },
    { header: 'City',           key: 'city',      width: 16 },
    { header: 'Timezone',       key: 'tz',        width: 22 },
    { header: 'Rate',           key: 'rate',      width: 10 },
    { header: 'Rate Type',      key: 'rateType',  width: 12 },
    { header: 'Currency',       key: 'currency',  width: 10 },
    { header: 'Scheduled Time', key: 'scheduled', width: 16 },
    { header: 'Added On',       key: 'added',     width: 14 },
  ]
  applyBoldStyle(studentsSheet.getRow(1))
  students.forEach((s: Student) =>
    studentsSheet.addRow({
      name: s.name, city: s.city ?? '', tz: s.timezone ?? '',
      rate: s.ratePerHour, rateType: s.rateType ?? 'hourly',
      currency: s.currency ?? 'INR', scheduled: s.scheduledTime ?? '',
      added: s.createdAt ? s.createdAt.slice(0, 10) : '',
    }),
  )

  // Sessions sheet
  const sessionsSheet = wb.addWorksheet('Sessions')
  sessionsSheet.columns = [
    { header: 'Student', key: 'student', width: 18 },
    { header: 'Date',    key: 'date',    width: 14 },
    { header: 'Hours',   key: 'hours',   width: 8  },
    { header: 'Type',    key: 'type',    width: 10 },
    { header: 'Note',    key: 'note',    width: 30 },
  ]
  applyBoldStyle(sessionsSheet.getRow(1))
  sessions
    .slice()
    .sort((a: Session, b: Session) => b.date.localeCompare(a.date))
    .forEach((s: Session) =>
      sessionsSheet.addRow({
        student: studentMap[s.studentId] ?? '',
        date: s.date,
        hours: s.hours,
        type: s.type,
        note: s.note ?? '',
      }),
    )

  // Payments sheet
  const paymentsSheet = wb.addWorksheet('Payments')
  paymentsSheet.columns = [
    { header: 'Student', key: 'student', width: 18 },
    { header: 'Date',    key: 'date',    width: 14 },
    { header: 'Amount',  key: 'amount',  width: 14 },
    { header: 'Note',    key: 'note',    width: 30 },
  ]
  applyBoldStyle(paymentsSheet.getRow(1))
  payments
    .slice()
    .sort((a: Payment, b: Payment) => b.date.localeCompare(a.date))
    .forEach((p: Payment) =>
      paymentsSheet.addRow({
        student: studentMap[p.studentId] ?? '',
        date: p.date,
        amount: p.amount,
        note: p.note ?? '',
      }),
    )

  // Settings sheet
  const settingsSheet = wb.addWorksheet('Settings')
  settingsSheet.columns = [
    { header: 'Key',   key: 'k', width: 22 },
    { header: 'Value', key: 'v', width: 30 },
  ]
  applyBoldStyle(settingsSheet.getRow(1))
  const s: Settings = settings
  settingsSheet.addRow({ k: 'Teacher Name',        v: s.teacherName ?? '' })
  settingsSheet.addRow({ k: 'Daily Reminder Time', v: s.dailyReminderTime ?? '' })
  settingsSheet.addRow({ k: 'Theme',               v: s.theme ?? 'system' })
  settingsSheet.addRow({ k: 'Exported At',         v: new Date().toISOString() })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob(
    [buffer],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tutordesk-backup-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
