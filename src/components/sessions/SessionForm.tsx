/**
 * SessionForm.tsx
 * Unified log / edit form for a Session.
 *
 * Log mode  — no `session` prop. Shows student selector, calls addSession().
 * Edit mode — pass a `session` prop. Shows student name (read-only), calls updateSession().
 */
import { useState, useMemo } from 'react'
import { AlertTriangle, Ban } from 'lucide-react'
import useAppStore from '@store/useStore'
import { useToast } from '@hooks/useToast'
import { formatCurrency } from '@utils/billing'
import { getBillingCycles, checkSessionDate, getActiveRange, hasLeft, getRateAt } from '@utils/billingCore'
import { todayISO, formatDayMonth, formatDuration } from '@utils/date'
import { HOUR_OPTIONS } from '@constants'
import type { Session, Student } from '@/types'

interface SessionFormProps {
  session?: Session         // omit for log mode, provide for edit mode
  students: Student[]
  preselectedStudentId?: string
  onClose: () => void
}

export default function SessionForm({
  session,
  students,
  preselectedStudentId,
  onClose,
}: SessionFormProps) {
  const addSession    = useAppStore((s) => s.addSession)
  const updateSession = useAppStore((s) => s.updateSession)
  const allSessions   = useAppStore((s) => s.sessions)
  const breaks        = useAppStore((s) => s.breaks)
  const { showToast } = useToast()

  const isEdit = !!session
  const today  = todayISO()

  // A left student can't take a new session — checkSessionDate refuses any
  // date past their last day anyway — so they're left out of the picker
  // entirely instead of being selectable and then instantly blocked.
  const pickableStudents = useMemo(() => students.filter((s) => !hasLeft(s, today)), [students, today])

  const [form, setForm] = useState({
    studentId: isEdit
      ? session.studentId
      : (preselectedStudentId ?? pickableStudents[0]?.id ?? ''),
    date:  isEdit ? session.date  : today,
    hours: isEdit ? session.hours : 1,
    type:  isEdit ? session.type  : ('regular' as 'regular' | 'extra'),
    note:  isEdit ? (session.note ?? '') : '',
    extraAmount: isEdit && session.extraAmount != null ? String(session.extraAmount) : '',
  })

  // A duration that isn't one of the quick-pick chips (e.g. 1.75h from an
  // edit, or someone who just wants to type it) opens the custom input
  // instead of leaving it looking unselected.
  const [customDuration, setCustomDuration] = useState(
    () => !HOUR_OPTIONS.includes(isEdit ? session.hours : 1),
  )

  const [dateError, setDateError] = useState<string | null>(null)
  const [dupWarning, setDupWarning] = useState(false)

  const selected  = students.find((s) => s.id === form.studentId)
  // How *this* session bills, which is the rate in force on its own date —
  // not the plan the student happens to be on today.
  const isMonthly = selected ? getRateAt(selected, form.date).rateType === 'monthly' : false

  /** The window this student can have sessions in — drives the date input. */
  const range = useMemo(
    () => (selected ? getActiveRange(selected, today) : { from: '', to: today }),
    [selected, today],
  )

  /** Live reason this date is not allowed, or null. Recomputed as you type. */
  const dateProblem = useMemo(
    () => (selected ? checkSessionDate(selected, form.date, breaks, today) : null),
    [selected, form.date, breaks, today],
  )

  /** Which cycle does this date land in? Answers "is this already paid for?" */
  const cycle = useMemo(() => {
    if (!selected) return undefined
    return getBillingCycles(selected, allSessions, breaks, today)
      .find((c) => form.date >= c.start && form.date <= c.end)
  }, [selected, allSessions, breaks, form.date, today])

  /** Another session already logged for this student on this date. */
  const duplicate = useMemo(
    () => allSessions.find(
      (s) => s.studentId === form.studentId && s.date === form.date && s.id !== session?.id,
    ),
    [allSessions, form.studentId, form.date, session?.id],
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.studentId || !selected) return

    // Date must sit inside the student's active, non-break period.
    const problem = checkSessionDate(selected, form.date, breaks, today)
    if (problem) { setDateError(problem); return }
    setDateError(null)

    const hours = parseFloat(String(form.hours))
    if (isNaN(hours) || hours <= 0) {
      showToast('Please enter valid hours (must be > 0)', 'error')
      return
    }

    // Extras are billed on top of the monthly fee, at the amount set here.
    let extraAmount: number | undefined
    if (form.type === 'extra' && form.extraAmount !== '') {
      const parsed = parseFloat(form.extraAmount)
      if (!Number.isFinite(parsed) || parsed < 0) {
        showToast('Enter a valid amount for the extra class', 'error')
        return
      }
      extraAmount = parsed
    }

    // Same student, same day — almost always a double tap. Confirm once.
    if (duplicate && !dupWarning) { setDupWarning(true); return }
    setDupWarning(false)

    if (isEdit) {
      updateSession(session.id, {
        date: form.date, hours, type: form.type, note: form.note, extraAmount,
      })
      showToast('Session updated', 'success')
    } else {
      addSession({
        studentId: form.studentId, date: form.date, hours,
        type: form.type, note: form.note, extraAmount,
      })
      showToast(`${selected.name} – ${formatDuration(hours)} logged`, 'success')
    }
    onClose()
  }

  function setDate(date: string) {
    setForm({ ...form, date })
    setDateError(null)
    setDupWarning(false)
  }

  const studentName = selected?.name ?? 'Unknown'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Why this date can't be used, and what to do about it */}
      {(dateError ?? dateProblem) && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <Ban size={15} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-800 leading-snug">{dateError ?? dateProblem}</p>
        </div>
      )}

      {/* Same student, same day — confirm before adding a second one */}
      {dupWarning && duplicate && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-3 py-2.5">
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-snug">
            {studentName} already has a {formatDuration(duplicate.hours)} session on{' '}
            {formatDayMonth(form.date)}. Submit again to log a second one.
          </p>
        </div>
      )}

      {/* Settled-cycle warning — editing history moves money */}
      {isEdit && cycle && cycle.balance <= 0 && cycle.amount > 0 && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-snug">
            This session sits in a cycle that's already paid up
            ({formatDayMonth(cycle.start)} → {formatDayMonth(cycle.end)}). Editing it will
            change that cycle's total.
          </p>
        </div>
      )}

      {/* Student — selector in log mode, read-only in edit mode */}
      <div>
        <label className="label">Student *</label>
        {isEdit ? (
          <p className="text-sm font-medium text-gray-700">{studentName}</p>
        ) : (
          <select
            className="input"
            value={form.studentId}
            onChange={(e) => {
              setForm({ ...form, studentId: e.target.value, note: '' })
              setDateError(null)
              setDupWarning(false)
            }}
            required
          >
            {pickableStudents.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Date */}
      <div>
        <label className="label">Date</label>
        <input
          type="date"
          className={`input ${dateError ?? dateProblem ? 'border-red-400 focus:ring-red-400' : ''}`}
          value={form.date}
          min={range.from || undefined}
          max={range.to}
          onChange={(e) => setDate(e.target.value)}
        />
        {selected && !(dateError ?? dateProblem) && (
          <p className="text-xs text-gray-400 mt-1">
            {studentName} can be logged from {formatDayMonth(range.from)}
            {selected.endDate ? ` to ${formatDayMonth(range.to)}` : ' onwards'}.
          </p>
        )}
      </div>

      {/* Duration */}
      <div>
        <label className="label">Duration</label>
        <div className="flex gap-2 flex-wrap">
          {HOUR_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => { setForm({ ...form, hours: h }); setCustomDuration(false) }}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                !customDuration && form.hours === h
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {h}h
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomDuration(true)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              customDuration
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            Custom
          </button>
        </div>
        {customDuration && (
          <>
            <div className="relative mt-2">
              <input
                type="number"
                className="input pr-16"
                placeholder="e.g. 20"
                value={form.hours > 0 ? Math.round(form.hours * 60) : ''}
                min="1"
                step="1"
                onChange={(e) => {
                  const mins = parseFloat(e.target.value)
                  setForm({ ...form, hours: Number.isFinite(mins) && mins > 0 ? mins / 60 : 0 })
                }}
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                minutes
              </span>
            </div>
            {form.hours > 0 && (
              <p className="text-xs text-gray-400 mt-1">= {formatDuration(form.hours)}</p>
            )}
          </>
        )}
      </div>

      {/* Type */}
      <div>
        <label className="label">Type</label>
        <div className="flex gap-2">
          {(['regular', 'extra'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm({ ...form, type: t })}
              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                form.type === t
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Extra classes are billed on top — you set the price per class. */}
        {form.type === 'extra' && (
          <div className="mt-3">
            <label className="label">
              Charge for this extra class
              {isMonthly && <span className="text-gray-400 font-normal"> — billed on top of the monthly fee</span>}
            </label>
            <input
              type="number"
              className="input"
              placeholder={isMonthly ? 'e.g. 800' : 'Leave blank to bill as normal hours'}
              value={form.extraAmount}
              min="0"
              step="0.01"
              onChange={(e) => setForm({ ...form, extraAmount: e.target.value })}
            />
            <p className="text-xs text-gray-400 mt-1">
              {isMonthly
                ? form.extraAmount
                  ? `Adds ${formatCurrency(parseFloat(form.extraAmount) || 0, selected?.currency)} to the cycle this class falls in.`
                  : "Leave blank to include this class in the monthly fee at no extra charge."
                : form.extraAmount
                  ? `Bills ${formatCurrency(parseFloat(form.extraAmount) || 0, selected?.currency)} for this class ` +
                    `instead of ${formatDuration(form.hours)} × the hourly rate.`
                  : 'Leave blank to bill this class at the usual hourly rate.'}
            </p>
          </div>
        )}
      </div>

      {/* Which cycle this class lands in */}
      {cycle && isMonthly && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2.5">
          Falls in cycle {formatDayMonth(cycle.start)} → {formatDayMonth(cycle.end)}
          {cycle.breakDays > 0 && (
            <span className="text-amber-600"> (extended {cycle.breakDays}d for breaks)</span>
          )}
          {cycle.balance <= 0
            ? <span className="text-green-600"> · already paid</span>
            : <span className="text-gray-400"> · {formatCurrency(cycle.balance, selected?.currency)} outstanding</span>}
        </div>
      )}

      {/* Note */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">Note (optional)</label>
          <span className={`text-xs ${form.note.length > 130 ? 'text-amber-500' : 'text-gray-400'}`}>
            {form.note.length}/150
          </span>
        </div>
        <input
          className="input"
          placeholder="e.g. Doubt session on arrays"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          maxLength={150}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!!dateProblem}
        >
          {isEdit ? 'Save changes' : 'Log session'}
        </button>
      </div>
    </form>
  )
}
