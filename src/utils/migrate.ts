/**
 * migrate.ts
 * Backfills records written before billing cycles existed (store v1 → v2).
 *
 * Kept out of the store so it can be tested without a browser, and so the
 * rules for "where does an existing student's anchor come from" live in one
 * readable place.
 */
import type { Student, Session, RateChange, Invoice } from '@/types'
import { DEFAULT_RATE_TYPE, DEFAULT_CURRENCY } from '@constants'
import { todayISO } from './date'

/**
 * Bring an invoice up to the coverage-tracking shape (store v4 → v5).
 *
 * Invoices written earlier never recorded what they billed, and their `total`
 * meant "amount due including arrears" rather than this invoice's own value.
 * There's no way to reconstruct either faithfully, so an issued one is given
 * `legacyCoveredThrough` — everything on or before that date counts as
 * already billed — which stops its work being itemised a second time.
 */
export function migrateInvoice(raw: Invoice): Invoice {
  if (Array.isArray(raw.coverage)) return raw

  const status = raw.status ?? (raw.voidedAt ? 'void' : 'issued')
  const total = raw.total ?? 0
  const base: Invoice = {
    ...raw,
    status,
    coverage: [],
    adjustments: raw.adjustments ?? [],
    charges: raw.charges ?? total,
    total,
    previousBalance: raw.previousBalance ?? 0,
    amountDueNow: raw.amountDueNow ?? total,
  }

  if (status !== 'issued') return base
  return { ...base, legacyCoveredThrough: raw.periodTo || raw.issuedDate || '' }
}

export function migrateInvoices(invoices: Invoice[]): Invoice[] {
  return invoices.map(migrateInvoice)
}

/**
 * Give a v1 student a billing anchor and a rate timeline.
 *
 * The anchor is the earlier of the join date and their first logged session:
 * sessions are sometimes back-dated past the day the record was created, and
 * billing must not start after teaching did.
 */
export function migrateStudent(raw: Student, sessions: Session[], today = todayISO()): Student {
  const joined = (raw.createdAt ?? '').slice(0, 10) || today
  const firstSession = sessions
    .filter((s) => s.studentId === raw.id)
    .map((s) => s.date)
    .sort()[0]

  const anchor = raw.billingAnchorDate
    ?? (firstSession && firstSession < joined ? firstSession : joined)

  const rateType = raw.rateType ?? DEFAULT_RATE_TYPE
  const ratePerHour = raw.ratePerHour ?? 0

  const rateHistory: RateChange[] = raw.rateHistory?.length
    ? [...raw.rateHistory].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    : [{ effectiveFrom: anchor, ratePerHour, rateType }]

  return {
    ...raw,
    currency: raw.currency ?? DEFAULT_CURRENCY,
    rateType,
    ratePerHour,
    billingAnchorDate: anchor,
    rateHistory,
  }
}

/** Apply {@link migrateStudent} across a whole roster. */
export function migrateStudents(
  students: Student[], sessions: Session[], today = todayISO(),
): Student[] {
  return students.map((s) => migrateStudent(s, sessions, today))
}
