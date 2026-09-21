/**
 * billingCore.ts
 * The single source of truth for what a student owes.
 *
 * Everything here is derived from stored facts (sessions, payments, breaks,
 * rate history) and nothing is persisted. Editing a break or back-dating a
 * session re-flows the whole timeline rather than leaving stale charges behind.
 *
 * Monthly students
 *   Cycle 1 starts on `billingAnchorDate` and nominally runs to the day before
 *   the same day-of-month next month (15 Jul → 14 Aug). Any break days inside
 *   the cycle push its end date forward, so a fee always buys a full month of
 *   real teaching — the billing day drifts, by design. Cycle N+1 begins the day
 *   after cycle N ends.
 *
 * Hourly students
 *   Calendar months, hours × rate.
 *
 * Rate changes — value or type (monthly ↔ hourly)
 *   Both live on `rateHistory`, keyed by the date they took effect. A change
 *   takes effect from today onward and never rewrites the past: cycles are
 *   generated per `rateHistory` segment (see `getRateTypeSegments`), so a
 *   switch from monthly to hourly closes out the current monthly cycle at
 *   the switch date and bills it in full for its agreed rate — even though
 *   it ends a few days early, that period was already committed to at that
 *   price — and hourly billing starts clean from the switch date.
 *   Already-billed cycles keep their original type, rate and amount.
 *
 * Leaving vs. switching
 *   A student who *leaves* mid-cycle (`endDate`) is different: there's no
 *   reason to charge for days that will never be taught, so that final
 *   cycle *is* pro-rated down to the fraction of days actually used
 *   (see `prorateOnCut` in `buildMonthlyCycles`).
 */

import type {
  Student, Session, Payment, Break, RateChange, RateType,
  BillingCycle, StudentLedger, Invoice,
} from '@/types'
import {
  todayISO, addDays, addMonthsClamped, daysInclusive, overlapDays,
  formatDayMonth, formatMonthLong, minIso, maxIso,
} from './date'
import { DEFAULT_RATE_TYPE } from '@constants'

/** Guards against a pathological break set spinning the extension loop. */
const MAX_EXTENSION_PASSES = 400
/** Stops runaway cycle generation if an anchor is absurdly far in the past. */
const MAX_CYCLES = 600

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

// ─── Rate resolution ──────────────────────────────────────────────────────

/**
 * Build a usable rate timeline even for records written before rateHistory
 * existed, so callers never have to null-check.
 */
export function getRateHistory(student: Student): RateChange[] {
  const fallback: RateChange = {
    effectiveFrom: student.billingAnchorDate ?? (student.createdAt ?? '1970-01-01').slice(0, 10),
    ratePerHour: student.ratePerHour ?? 0,
    rateType: student.rateType ?? DEFAULT_RATE_TYPE,
  }
  if (!student.rateHistory?.length) return [fallback]
  return [...student.rateHistory].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
}

/** The rate in force on `date` — the latest entry at or before it. */
export function getRateAt(student: Student, date: string): RateChange {
  const history = getRateHistory(student)
  let active = history[0]
  for (const entry of history) {
    if (entry.effectiveFrom <= date) active = entry
    else break
  }
  return active
}

/** Last day this student is billable at all: their leave date, or forever. */
function billableUntil(student: Student, today: string): string {
  return student.endDate ? minIso(student.endDate, today) : today
}

/** True once a student's last day has come and gone. */
export function hasLeft(student: Student, today: string = todayISO()): boolean {
  return !!student.endDate && student.endDate <= today
}

export interface RateTypeSegment {
  start: string
  end: string
  rateType: RateType
}

/**
 * Splits [from, to] into contiguous stretches of a single rate *type*, so a
 * monthly → hourly (or hourly → monthly) switch mid-lifetime can be billed
 * with the right cycle shape on each side instead of one type winning
 * retroactively over the whole history.
 *
 * A rate-*value*-only change doesn't split anything here — `getRateAt` still
 * picks the right value per cycle inside a segment, exactly as before.
 */
export function getRateTypeSegments(student: Student, from: string, to: string): RateTypeSegment[] {
  const switchPoints = getRateHistory(student)
    .map((r) => r.effectiveFrom)
    .filter((d) => d > from && d <= to)
    .sort()

  const raw: RateTypeSegment[] = []
  let segStart = from
  for (const point of switchPoints) {
    const segEnd = addDays(point, -1)
    if (segEnd >= segStart) {
      raw.push({ start: segStart, end: segEnd, rateType: getRateAt(student, segStart).rateType })
      segStart = point
    }
  }
  raw.push({ start: segStart, end: to, rateType: getRateAt(student, segStart).rateType })

  // Merge back-to-back segments left the same type by a rate-value-only change.
  const merged: RateTypeSegment[] = []
  for (const seg of raw) {
    const last = merged[merged.length - 1]
    if (last && last.rateType === seg.rateType) last.end = seg.end
    else merged.push({ ...seg })
  }
  return merged
}

// ─── Cycle boundaries ─────────────────────────────────────────────────────

/**
 * End date of a cycle starting at `start`, extended past `nominalEnd` by any
 * break days inside it.
 *
 * Extending can pull further break days into range, which extends it again, so
 * this iterates to a fixed point. It converges because `end` only ever grows
 * and is bounded by the total break span.
 */
function resolveCycleEnd(
  start: string,
  nominalEnd: string,
  breaks: Break[],
): { end: string; breakDays: number } {
  let end = nominalEnd
  let breakDays = 0

  for (let pass = 0; pass < MAX_EXTENSION_PASSES; pass++) {
    let days = 0
    for (const b of breaks) days += overlapDays(b.startDate, b.endDate, start, end)
    if (days === breakDays) break
    breakDays = days
    end = addDays(nominalEnd, breakDays)
  }

  return { end, breakDays }
}

/**
 * Merge overlapping and adjacent breaks so a day covered twice is only counted
 * once — otherwise a duplicate entry would silently double the extension.
 */
export function normalizeBreaks(breaks: Break[]): Break[] {
  const sorted = [...breaks]
    .filter((b) => b.startDate && b.endDate && b.startDate <= b.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  const merged: Break[] = []
  for (const b of sorted) {
    const last = merged[merged.length - 1]
    if (last && b.startDate <= addDays(last.endDate, 1)) {
      if (b.endDate > last.endDate) merged[merged.length - 1] = { ...last, endDate: b.endDate }
    } else {
      merged.push({ ...b })
    }
  }
  return merged
}

// ─── Cycle generation ─────────────────────────────────────────────────────

interface SegmentArgs {
  student: Student
  sessions: Session[]        // already filtered to this student
  breaks: Break[]            // already filtered + normalized
  segment: { start: string; end: string }
  /** Stop generating once a cycle reaches this date. */
  genUntil: string
  /** If set and inside a cycle, that cycle ends there and generation stops. */
  terminationDate?: string
  /**
   * Whether hitting `terminationDate` mid-cycle scales the fee down to the
   * fraction of the cycle actually used. True when the student is leaving —
   * there's no reason to charge for days that will never be taught. False
   * when the cutoff is just a rate/type switch: that cycle was already
   * agreed at its rate for its full term, so it's billed in full even though
   * it ends a few days early: the new rate simply starts clean next segment.
   */
  prorateOnCut: boolean
  today: string
  startIndex: number
}

/** Monthly: anchored, break-extended cycles inside one segment. */
function buildMonthlyCycles(args: SegmentArgs): BillingCycle[] {
  const { student, sessions, breaks, segment, genUntil, terminationDate, prorateOnCut, today, startIndex } = args
  const anchor = segment.start
  const cycles: BillingCycle[] = []
  if (anchor > genUntil) return cycles

  // `drift` is the running total of break days already absorbed. Nominal
  // boundaries are always measured from the anchor so its day-of-month survives
  // clamping (a 31st anchor recovers the 31st in long months instead of
  // degrading to the 28th forever), then shifted by drift.
  let drift = 0
  let start = anchor

  for (let i = 0; i < MAX_CYCLES; i++) {
    const nominalEnd = addDays(addDays(addMonthsClamped(anchor, i + 1), -1), drift)
    const { end, breakDays } = resolveCycleEnd(start, nominalEnd, breaks)
    const rate = getRateAt(student, start)

    const cutAt = terminationDate
    const cutHere = !!cutAt && cutAt >= start && cutAt < end

    // A cycle cut short — by the student leaving, or by a switch to hourly —
    // only "contains" sessions up to the cutoff. Sessions after it belong to
    // whatever comes next (the leave means no more sessions exist; a type
    // switch means they're already being billed by the following segment),
    // so counting them here too would double-count hours and, worse, double
    // bill an extra-class charge.
    const inclusionEnd = cutHere ? cutAt! : end
    const inCycle = sessions.filter((s) => s.date >= start && s.date <= inclusionEnd)
    const hours = inCycle.reduce((sum, s) => sum + s.hours, 0)

    // Extras are billed on top of the flat fee, at the amount set per session.
    const extraAmount = inCycle
      .filter((s) => s.type === 'extra')
      .reduce((sum, s) => sum + (s.extraAmount ?? 0), 0)

    // The cycle is charged for the teaching days actually used, but only
    // when the cutoff is a departure — see `prorateOnCut` above. Break days
    // are excluded from both sides so a pause can't dilute the fraction.
    let baseAmount = rate.ratePerHour
    let proRated = false
    if (cutHere && prorateOnCut) {
      const totalDays = daysInclusive(start, end) - breakDays
      const usedBreakDays = breaks.reduce(
        (sum, b) => sum + overlapDays(b.startDate, b.endDate, start, cutAt!), 0,
      )
      const usedDays = daysInclusive(start, cutAt!) - usedBreakDays
      const fraction = totalDays > 0 ? Math.min(1, Math.max(0, usedDays / totalDays)) : 0
      baseAmount = round2(rate.ratePerHour * fraction)
      proRated = true
    }

    const amount = round2(baseAmount + extraAmount)
    const cycleEnd = cutHere ? cutAt! : end

    cycles.push({
      // Keyed by start date, not position: invoice coverage stores this key,
      // and a rate-type switch back-dated later would renumber an index.
      key: `cycle-${start}`,
      index: startIndex + i + 1,
      start,
      end: cycleEnd,
      nominalEnd,
      label: `${formatDayMonth(start)} → ${formatDayMonth(cycleEnd)}`,
      breakDays,
      hours: round2(hours),
      rate: rate.ratePerHour,
      rateType: 'monthly',
      baseAmount,
      extraAmount: round2(extraAmount),
      amount,
      paid: 0,
      balance: amount,
      started: start <= today,
      proRated,
    })

    if (cutHere || end >= genUntil) break
    drift += breakDays
    start = addDays(end, 1)
  }

  return cycles
}

/** Hourly: calendar months clipped to the billable window, hours × the rate that month. */
function buildHourlyCycles(args: SegmentArgs): BillingCycle[] {
  const { student, sessions, segment, genUntil, today, startIndex } = args
  const from = segment.start
  const to = minIso(segment.end, genUntil)
  if (from > to) return []

  const inRange = sessions.filter((s) => s.date >= from && s.date <= to)
  const keys = [...new Set(inRange.map((s) => s.date.slice(0, 7)))].sort()

  return keys.map((key, i) => {
    const monthStart = `${key}-01`
    const monthEnd = addDays(addMonthsClamped(monthStart, 1), -1)
    // Clip to the billable window so the first/last month splits correctly.
    const start = maxIso(monthStart, from)
    const end = minIso(monthEnd, to)

    const inCycle = inRange.filter((s) => s.date >= start && s.date <= end)
    const hours = inCycle.reduce((sum, s) => sum + s.hours, 0)
    const rate = getRateAt(student, start)

    // An 'extra' with an explicit amount overrides the hourly maths; without
    // one it just bills as normal hours.
    let baseAmount = 0
    let extraAmount = 0
    for (const s of inCycle) {
      if (s.type === 'extra' && typeof s.extraAmount === 'number') extraAmount += s.extraAmount
      else baseAmount += s.hours * rate.ratePerHour
    }

    const clipped = start !== monthStart || end !== monthEnd
    const amount = round2(baseAmount + extraAmount)

    return {
      key,
      index: startIndex + i + 1,
      start,
      end,
      nominalEnd: end,
      label: clipped
        ? `${formatDayMonth(start)} → ${formatDayMonth(end)}`
        : formatMonthLong(key),
      breakDays: 0,
      hours: round2(hours),
      rate: rate.ratePerHour,
      rateType: 'hourly' as RateType,
      baseAmount: round2(baseAmount),
      extraAmount: round2(extraAmount),
      amount,
      paid: 0,
      balance: amount,
      started: start <= today,
      proRated: false,
    }
  })
}

/**
 * All billing cycles for a student, oldest first, with nothing allocated yet.
 * Prefer `getStudentLedger` — this is exported for tests and for callers that
 * only need the boundaries.
 */
export function getBillingCycles(
  student: Student,
  sessions: Session[],
  breaks: Break[] = [],
  today: string = todayISO(),
): BillingCycle[] {
  const anchor = student.billingAnchorDate
  const hardEnd = billableUntil(student, today)
  if (!anchor || anchor > hardEnd) return []

  const mine = sessions
    .filter((s) => s.studentId === student.id)
    .sort((a, b) => a.date.localeCompare(b.date))
  const myBreaks = normalizeBreaks(breaks.filter((b) => b.studentId === student.id))

  const leaveDate = hasLeft(student, today) ? student.endDate : undefined
  const segments = getRateTypeSegments(student, anchor, hardEnd)

  const cycles: BillingCycle[] = []
  segments.forEach((seg, i) => {
    const isLastSegment = i === segments.length - 1
    // A segment that ends before the last one didn't end because the student
    // left — it ended because the rate type switched here, so the outgoing
    // cycle closes at the segment boundary but keeps its full agreed fee
    // (see `prorateOnCut`). The last segment closes on the student's actual
    // leave date instead, if any, and that genuinely gets pro-rated.
    const terminationDate = isLastSegment ? leaveDate : seg.end

    const args: SegmentArgs = {
      student, sessions: mine, breaks: myBreaks,
      segment: { start: seg.start, end: seg.end },
      genUntil: seg.end,
      terminationDate,
      prorateOnCut: isLastSegment,
      today,
      startIndex: cycles.length,
    }

    cycles.push(...(seg.rateType === 'monthly' ? buildMonthlyCycles(args) : buildHourlyCycles(args)))
  })

  return cycles
}

/**
 * Sessions that fall inside no billing cycle, so contribute nothing.
 *
 * Normally empty — the forms prevent creating them. They can still arrive via
 * an imported backup, or by moving a student's anchor forward after the fact,
 * and the Billing screen surfaces them rather than letting the charge vanish.
 */
export function getUnbilledSessions(
  student: Student,
  sessions: Session[],
  cycles: BillingCycle[],
): Session[] {
  return sessions
    .filter((s) => s.studentId === student.id)
    .filter((s) => !cycles.some((c) => s.date >= c.start && s.date <= c.end))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Payment allocation ───────────────────────────────────────────────────

/**
 * Spread payments across cycles oldest-first.
 *
 * This is what makes payment *date* irrelevant to what a payment settles:
 * paying on day 1 of a cycle and paying a month after it closed both land on
 * the same cycle. Surplus becomes credit and is picked up by the next cycle
 * the moment it starts.
 */
export function allocatePayments(
  cycles: BillingCycle[],
  payments: Payment[],
): { cycles: BillingCycle[]; credit: number } {
  // Negative amounts would silently inflate what's owed; treat them as zero.
  let pot = payments.reduce((sum, p) => sum + Math.max(0, p.amount || 0), 0)

  const settled = cycles.map((cycle) => {
    // Future cycles aren't charged yet, so money sits as credit instead.
    if (!cycle.started || cycle.amount <= 0) {
      return { ...cycle, paid: 0, balance: round2(Math.max(0, cycle.amount)) }
    }
    const applied = Math.min(pot, cycle.amount)
    pot = round2(pot - applied)
    return {
      ...cycle,
      paid: round2(applied),
      balance: round2(cycle.amount - applied),
    }
  })

  return { cycles: settled, credit: round2(Math.max(0, pot)) }
}

// ─── Public entry point ───────────────────────────────────────────────────

/**
 * Pushes each issued invoice's adjustments down onto the cycles that invoice
 * actually billed, spread in proportion to what was charged for each.
 *
 * Without this a discount would only exist as a lump at the ledger total, and
 * everything reading cycles directly — the per-cycle rows, the month's
 * earnings, the spreadsheet — would still quote the undiscounted figure.
 *
 * `remainder` is whatever couldn't land on a cycle: a discount bigger than
 * the cycle it applies to, or one whose coverage no longer resolves. It's
 * carried separately so the ledger total stays exact either way.
 */
function applyInvoiceAdjustments(
  cycles: BillingCycle[],
  student: Student,
  sessions: Session[],
  invoices: Invoice[],
): { cycles: BillingCycle[]; remainder: number } {
  const issued = invoices.filter((i) => i.studentId === student.id && i.status === 'issued')
  if (!issued.length) return { cycles, remainder: 0 }

  const sessionById = new Map(
    sessions.filter((s) => s.studentId === student.id).map((s) => [s.id, s]),
  )
  const perCycle = new Map<string, number>()
  let remainder = 0

  for (const inv of issued) {
    const adjTotal = round2((inv.adjustments ?? []).reduce((sum, a) => sum + (a.amount || 0), 0))
    if (!adjTotal) continue

    const weights = new Map<string, number>()
    let totalWeight = 0
    for (const cov of inv.coverage ?? []) {
      const key = cov.kind === 'cycle'
        ? cycles.find((c) => c.key === cov.ref)?.key
        : (() => {
            const s = sessionById.get(cov.ref)
            return s ? cycles.find((c) => s.date >= c.start && s.date <= c.end)?.key : undefined
          })()
      if (!key) continue
      const weight = Math.abs(cov.amount) || 0
      weights.set(key, (weights.get(key) ?? 0) + weight)
      totalWeight += weight
    }

    if (totalWeight <= 0) {
      remainder = round2(remainder + adjTotal)
      continue
    }

    // Round every share but the last normally; give the last cycle whatever
    // is left over. That way the shares always add back up to adjTotal
    // exactly, instead of drifting a paisa or two from independent rounding.
    const keys = [...weights.keys()]
    let allocated = 0
    keys.forEach((key, idx) => {
      const share = idx === keys.length - 1
        ? round2(adjTotal - allocated)
        : round2(adjTotal * ((weights.get(key) ?? 0) / totalWeight))
      if (idx !== keys.length - 1) allocated = round2(allocated + share)
      perCycle.set(key, round2((perCycle.get(key) ?? 0) + share))
    })
  }

  const adjusted = cycles.map((c) => {
    const adj = perCycle.get(c.key)
    if (!adj) return c
    const target = round2(c.amount + adj)
    const amount = Math.max(0, target)
    remainder = round2(remainder + (target - amount))
    return {
      ...c,
      baseAmount: round2(Math.max(0, amount - c.extraAmount)),
      amount,
      balance: amount,
    }
  })

  return { cycles: adjusted, remainder: round2(remainder) }
}

/**
 * Everything the UI needs for one student, in a single pass.
 * `sessions`, `payments` and `breaks` may be the full unfiltered arrays.
 *
 * `invoices` contributes the manual adjustment lines — discounts, waivers,
 * extra charges — from invoices that have actually been issued. Drafts and
 * voided invoices are ignored: nothing counts until it's been sent. Each
 * adjustment is attributed to the cycles its invoice covered, so every
 * cycle-level figure inherits it instead of only the grand total.
 */
export function getStudentLedger(
  student: Student,
  sessions: Session[],
  payments: Payment[],
  breaks: Break[] = [],
  today: string = todayISO(),
  invoices: Invoice[] = [],
): StudentLedger {
  const raw = getBillingCycles(student, sessions, breaks, today)
  const myPayments = payments
    .filter((p) => p.studentId === student.id)
    .sort((a, b) => a.date.localeCompare(b.date))

  const { cycles, remainder } = applyInvoiceAdjustments(raw, student, sessions, invoices)
  const { cycles: settled } = allocatePayments(cycles, myPayments)

  const totalDue = round2(
    settled.filter((c) => c.started).reduce((sum, c) => sum + c.amount, 0) + remainder,
  )
  const totalPaid = round2(
    myPayments.reduce((sum, p) => sum + Math.max(0, p.amount || 0), 0),
  )

  return {
    cycles: settled,
    totalDue,
    totalPaid,
    balance: round2(Math.max(0, totalDue - totalPaid)),
    // Discounting past zero doesn't hand back money that was never paid, so
    // credit is capped at what actually came in.
    credit: round2(Math.max(0, totalPaid - Math.max(0, totalDue))),
    unbilled: getUnbilledSessions(student, sessions, settled),
  }
}

/**
 * Revenue recognised in a calendar month.
 * A monthly cycle is recognised in full on the month it *starts*, since a
 * 15 Jul → 14 Aug cycle otherwise has no single honest home.
 */
export function getEarningsForMonth(
  student: Student,
  sessions: Session[],
  breaks: Break[],
  ym: string,
  today: string = todayISO(),
): number {
  return earningsForMonthFromCycles(
    getBillingCycles(student, sessions, breaks, today), ym,
  )
}

/** Same as {@link getEarningsForMonth} but reuses cycles you already have. */
export function earningsForMonthFromCycles(cycles: BillingCycle[], ym: string): number {
  return round2(
    cycles
      .filter((c) => c.started && c.start.startsWith(ym))
      .reduce((sum, c) => sum + c.amount, 0),
  )
}

/** The cycle containing `date`, if any. */
export function findCycleForDate(cycles: BillingCycle[], date: string): BillingCycle | undefined {
  return cycles.find((c) => date >= c.start && date <= c.end)
}

// ─── Pre-flight checks used by the forms ──────────────────────────────────

/** True when `date` falls inside a declared break. */
export function isOnBreak(breaks: Break[], studentId: string, date: string): boolean {
  return breaks.some((b) => b.studentId === studentId && date >= b.startDate && date <= b.endDate)
}

/** The break covering `date`, if any. */
export function findBreakForDate(
  breaks: Break[], studentId: string, date: string,
): Break | undefined {
  return breaks.find(
    (b) => b.studentId === studentId && date >= b.startDate && date <= b.endDate,
  )
}

/**
 * Any existing break for this student that overlaps [start, end].
 * Used to reject a second holiday inside a range that's already covered.
 */
export function findOverlappingBreaks(
  breaks: Break[], studentId: string, start: string, end: string, excludeId?: string,
): Break[] {
  if (!start || !end || start > end) return []
  return breaks
    .filter((b) => b.studentId === studentId && b.id !== excludeId)
    .filter((b) => overlapDays(b.startDate, b.endDate, start, end) > 0)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/** True when [start, end] sits entirely inside an existing break. */
export function isRangeFullyCovered(
  breaks: Break[], studentId: string, start: string, end: string, excludeId?: string,
): boolean {
  return findOverlappingBreaks(breaks, studentId, start, end, excludeId)
    .some((b) => b.startDate <= start && b.endDate >= end)
}

/** The window in which a session may legitimately be logged for this student. */
export function getActiveRange(
  student: Student, today: string = todayISO(),
): { from: string; to: string } {
  const from = student.billingAnchorDate ?? (student.createdAt ?? '').slice(0, 10)
  const to = student.endDate ? minIso(student.endDate, today) : today
  return { from, to }
}

/**
 * Why a session on this date can't be logged, or null when it's fine.
 * Returns a message written for the person using the app.
 */
export function checkSessionDate(
  student: Student, date: string, breaks: Break[], today: string = todayISO(),
): string | null {
  if (!date) return 'Pick a date.'
  const { from, to } = getActiveRange(student, today)

  if (date > today) return 'You can\'t log a session in the future.'
  if (from && date < from) {
    return `${student.name}'s billing starts ${formatDayMonth(from)}. A session before that ` +
      'wouldn\'t be billed — move the billing start date back if they really began earlier.'
  }
  if (student.endDate && date > student.endDate) {
    return `${student.name} left on ${formatDayMonth(student.endDate)}. Clear their last day ` +
      'first if they\'re back.'
  }
  if (date > to) return 'That date is outside this student\'s active period.'

  const brk = findBreakForDate(breaks, student.id, date)
  if (brk) {
    return `${student.name} is on a break from ${formatDayMonth(brk.startDate)} to ` +
      `${formatDayMonth(brk.endDate)}. Shorten that break first if you taught on this day.`
  }
  return null
}
