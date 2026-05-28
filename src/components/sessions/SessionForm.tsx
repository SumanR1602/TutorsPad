/**
 * SessionForm.tsx
 * Unified log / edit form for a Session.
 *
 * Log mode  — no `session` prop. Shows student selector, calls addSession().
 * Edit mode — pass a `session` prop. Shows student name (read-only), calls updateSession().
 */
import { useState, useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import useStore from '@store/useStore'
import { useToast } from '@hooks/useToast'
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
  const addSession    = useStore((s) => s.addSession)
  const updateSession = useStore((s) => s.updateSession)
  const payments      = useStore((s) => s.payments)
  const { showToast } = useToast()

  const isEdit = !!session
  const today  = new Date().toISOString().slice(0, 10)

  // Check if the session's month already has a payment recorded (billed month guard)
  const isAlreadyBilled = useMemo(() => {
    if (!isEdit) return false
    const sessionMonth = session.date.slice(0, 7)        // "YYYY-MM"
    return payments.some(
      (p) => p.studentId === session.studentId && p.date.slice(0, 7) === sessionMonth,
    )
  }, [isEdit, session, payments])

  const [form, setForm] = useState({
    studentId: isEdit
      ? session.studentId
      : (preselectedStudentId ?? students[0]?.id ?? ''),
    date:  isEdit ? session.date  : today,
    hours: isEdit ? session.hours : 1,
    type:  isEdit ? session.type  : ('regular' as 'regular' | 'extra'),
    note:  isEdit ? (session.note ?? '') : '',
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.studentId) return
    const hours = parseFloat(String(form.hours))
    if (isEdit) {
      updateSession(session.id, { date: form.date, hours, type: form.type, note: form.note })
      showToast('Session updated', 'success')
    } else {
      addSession({ ...form, hours })
      const studentName = students.find((s) => s.id === form.studentId)?.name ?? 'Session'
      showToast(`${studentName} – ${hours}h logged`, 'success')
    }
    onClose()
  }

  const studentName = students.find((s) => s.id === form.studentId)?.name ?? 'Unknown'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Billed-month warning — edit mode only */}
      {isEdit && isAlreadyBilled && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-snug">
            This session has already been billed — editing it will affect your payment records.
          </p>
        </div>
      )}

      {/* Student — selector in log mode, read-only in edit mode */}
      <div>
        <label className="label">Student *</label>
        {isEdit ? (
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{studentName}</p>
        ) : (
          <select
            className="input"
            value={form.studentId}
            onChange={(e) => setForm({ ...form, studentId: e.target.value, note: '' })}
            required
          >
            {students.map((s) => (
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
          className="input"
          value={form.date}
          max={today}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
      </div>

      {/* Duration */}
      <div>
        <label className="label">Duration</label>
        <div className="flex gap-2 flex-wrap">
          {HOUR_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setForm({ ...form, hours: h })}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                form.hours === h
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
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
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

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
        <button type="submit" className="btn-primary flex-1">
          {isEdit ? 'Save changes' : 'Log session'}
        </button>
      </div>
    </form>
  )
}
