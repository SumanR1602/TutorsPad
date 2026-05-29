/**
 * storage.ts
 * Helpers for export/import of app data.
 * Uses useStore.getState() directly instead of receiving store as parameter.
 */
import ExcelJS from 'exceljs'
import useStore from '@store/useStore'
import { applyBoldStyle } from './excelUtils'
import { DEFAULT_CURRENCY } from '@constants'
import { TIMEZONE_OPTIONS } from './timezone'
import type { Student, Session, Payment, Settings } from '@/types'

function tzLabel(ianaValue: string): string {
  return TIMEZONE_OPTIONS.find((o) => o.value === ianaValue)?.label ?? ianaValue
}

function addSheetHeader(
  sheet: ExcelJS.Worksheet,
  sectionLabel: string,
  colCount: number,
): void {
  const lastCol = String.fromCharCode(64 + colCount) // A=1, B=2, ...

  sheet.addRow(Array(colCount).fill(''))
  sheet.mergeCells(`A1:${lastCol}1`)
  const titleCell = sheet.getCell('A1')
  titleCell.value = 'TUTORSPAD'
  titleCell.font = { bold: true, size: 16 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(1).height = 32

  sheet.addRow(Array(colCount).fill(''))
  sheet.mergeCells(`A2:${lastCol}2`)
  const sectionCell = sheet.getCell('A2')
  sectionCell.value = sectionLabel
  sectionCell.font = { bold: true, size: 13 }
  sectionCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(2).height = 24

  sheet.addRow([])
}

// ── JSON backup ───────────────────────────────────────────────────────────────

interface BackupFile {
  version: number
  exportedAt: string
  students: Student[]
  sessions: Session[]
  payments: Payment[]
}

export function exportBackupJSON(): void {
  const { students, sessions, payments } = useStore.getState()
  const backup: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    students,
    sessions,
    payments,
  }
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `tutorspad-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export interface ParsedBackup {
  students: Student[]
  sessions: Session[]
  payments: Payment[]
}

/** Reads and validates a .json backup file. Throws a descriptive error if invalid. */
export async function parseBackupJSON(file: File): Promise<ParsedBackup> {
  const text = await file.text()
  let data: BackupFile
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON.')
  }
  if (!Array.isArray(data.students)) throw new Error('Missing or invalid "students" array.')
  if (!Array.isArray(data.sessions)) throw new Error('Missing or invalid "sessions" array.')
  if (!Array.isArray(data.payments)) throw new Error('Missing or invalid "payments" array.')

  // Basic field validation
  data.students.forEach((s, i) => {
    if (!s.id || !s.name || s.ratePerHour == null)
      throw new Error(`Student at index ${i} is missing required fields (id, name, ratePerHour).`)
  })
  const studentIds = new Set(data.students.map((s) => s.id))
  data.sessions.forEach((s, i) => {
    if (!s.id || !s.studentId || !s.date || s.hours == null)
      throw new Error(`Session at index ${i} is missing required fields.`)
    if (!studentIds.has(s.studentId))
      throw new Error(`Session at index ${i} references unknown student.`)
  })
  data.payments.forEach((p, i) => {
    if (!p.id || !p.studentId || !p.date || p.amount == null)
      throw new Error(`Payment at index ${i} is missing required fields.`)
    if (!studentIds.has(p.studentId))
      throw new Error(`Payment at index ${i} references unknown student.`)
  })

  return { students: data.students, sessions: data.sessions, payments: data.payments }
}

export async function exportAllData(): Promise<void> {
  const { students, sessions, payments, settings } = useStore.getState()
  const studentMap: Record<string, string> = Object.fromEntries(
    students.map((s) => [s.id, s.name]),
  )

  const wb = new ExcelJS.Workbook()
  wb.creator = 'TutorsPad'
  wb.created = new Date()

  // ── Students sheet ──────────────────────────────────────────
  const studentsSheet = wb.addWorksheet('Students')
  studentsSheet.columns = [
    { key: 'name',      width: 18 },
    { key: 'city',      width: 16 },
    { key: 'tz',        width: 30 },
    { key: 'rate',      width: 10 },
    { key: 'rateType',  width: 12 },
    { key: 'currency',  width: 10 },
    { key: 'scheduled', width: 16 },
    { key: 'added',     width: 14 },
  ]
  addSheetHeader(studentsSheet, 'STUDENTS', 8)
  applyBoldStyle(studentsSheet.addRow({
    name: 'Name', city: 'City', tz: 'Timezone',
    rate: 'Rate', rateType: 'Rate Type', currency: 'Currency',
    scheduled: 'Scheduled Time', added: 'Enrolled Since',
  }))
  students.forEach((s: Student) =>
    studentsSheet.addRow({
      name: s.name, city: s.city ?? '', tz: tzLabel(s.timezone ?? ''),
      rate: s.ratePerHour, rateType: s.rateType ?? 'hourly',
      currency: s.currency ?? DEFAULT_CURRENCY, scheduled: s.scheduledTime ?? '',
      added: s.createdAt ? s.createdAt.slice(0, 10) : '',
    }),
  )

  // ── Sessions sheet ──────────────────────────────────────────
  const sessionsSheet = wb.addWorksheet('Sessions')
  sessionsSheet.columns = [
    { key: 'student', width: 18 },
    { key: 'date',    width: 14 },
    { key: 'hours',   width: 8  },
    { key: 'type',    width: 10 },
    { key: 'note',    width: 30 },
  ]
  addSheetHeader(sessionsSheet, 'SESSIONS', 5)
  applyBoldStyle(sessionsSheet.addRow({
    student: 'Student', date: 'Date', hours: 'Hours', type: 'Type', note: 'Note',
  }))
  sessions
    .slice()
    .sort((a: Session, b: Session) => b.date.localeCompare(a.date))
    .forEach((s: Session) =>
      sessionsSheet.addRow({
        student: studentMap[s.studentId] ?? '',
        date: s.date, hours: s.hours, type: s.type, note: s.note ?? '',
      }),
    )

  // ── Payments sheet ──────────────────────────────────────────
  const paymentsSheet = wb.addWorksheet('Payments')
  paymentsSheet.columns = [
    { key: 'student', width: 18 },
    { key: 'date',    width: 14 },
    { key: 'amount',  width: 14 },
    { key: 'note',    width: 30 },
  ]
  addSheetHeader(paymentsSheet, 'PAYMENTS', 4)
  applyBoldStyle(paymentsSheet.addRow({
    student: 'Student', date: 'Date', amount: 'Amount', note: 'Note',
  }))
  payments
    .slice()
    .sort((a: Payment, b: Payment) => b.date.localeCompare(a.date))
    .forEach((p: Payment) =>
      paymentsSheet.addRow({
        student: studentMap[p.studentId] ?? '',
        date: p.date, amount: p.amount, note: p.note ?? '',
      }),
    )

  // ── Settings sheet ──────────────────────────────────────────
  const settingsSheet = wb.addWorksheet('Settings')
  settingsSheet.columns = [
    { key: 'k', width: 22 },
    { key: 'v', width: 30 },
  ]
  addSheetHeader(settingsSheet, 'SETTINGS', 2)
  applyBoldStyle(settingsSheet.addRow({ k: 'Key', v: 'Value' }))
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
  a.download = `tutorspad-backup-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
