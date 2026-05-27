/**
 * StudentForm.tsx
 * Unified add / edit form for a Student.
 *
 * Add mode  — no `student` prop. Calls addStudent() and shows "Add student".
 * Edit mode — pass a `student` prop. Calls updateStudent() and shows "Save changes".
 */
import { useState } from 'react'
import useStore from '@store/useStore'
import { TIMEZONE_OPTIONS } from '@utils/timezone'
import CityInput from '../shared/CityInput'
import TimePicker12h from '../shared/TimePicker12h'
import { useToast } from '@hooks/useToast'
import { COLORS, CURRENCIES, DEFAULT_TIMEZONE, DEFAULT_CURRENCY, DEFAULT_RATE_TYPE } from '@constants'
import type { Student } from '@/types'

interface StudentFormState {
  name: string
  city: string
  timezone: string
  rateType: 'hourly' | 'monthly'
  ratePerHour: string
  currency: string
  color: string
  scheduledTime: string
}

const defaultForm: StudentFormState = {
  name: '', city: '', timezone: DEFAULT_TIMEZONE,
  rateType: DEFAULT_RATE_TYPE, ratePerHour: '', currency: DEFAULT_CURRENCY,
  color: COLORS[0], scheduledTime: '',
}

interface StudentFormProps {
  student?: Student   // omit for add mode, provide for edit mode
  onClose: () => void
}

export default function StudentForm({ student, onClose }: StudentFormProps) {
  const addStudent    = useStore((s) => s.addStudent)
  const updateStudent = useStore((s) => s.updateStudent)
  const { showToast } = useToast()

  const isEdit = !!student

  const [form, setForm] = useState<StudentFormState>(
    isEdit
      ? {
          name:          student.name,
          city:          student.city ?? '',
          timezone:      student.timezone,
          rateType:      (student.rateType ?? 'hourly') as 'hourly' | 'monthly',
          ratePerHour:   String(student.ratePerHour),
          currency:      student.currency ?? DEFAULT_CURRENCY,
          color:         student.color ?? COLORS[0],
          scheduledTime: student.scheduledTime ?? '',
        }
      : defaultForm,
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.ratePerHour) return
    const data = { ...form, ratePerHour: parseFloat(form.ratePerHour) }
    if (isEdit) {
      updateStudent(student.id, data)
      showToast(`${form.name} updated`, 'success')
    } else {
      addStudent(data)
      showToast(`${form.name.trim()} added`, 'success')
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div>
        <label className="label">Student name *</label>
        <input
          className="input"
          placeholder="e.g. Shri Ram"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>

      {/* City (with autocomplete + timezone detection) */}
      <div>
        <label className="label">City</label>
        <CityInput
          value={form.city}
          onChange={(city) => setForm((f) => ({ ...f, city }))}
          onTimezoneDetected={(tz) => setForm((f) => ({ ...f, timezone: tz }))}
        />
      </div>

      {/* Timezone */}
      <div>
        <label className="label">Timezone *</label>
        <select
          className="input"
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
        >
          {TIMEZONE_OPTIONS.map((tz) => (
            <option key={tz.value} value={tz.value}>{tz.label}</option>
          ))}
        </select>
      </div>

      {/* Rate type toggle + rate + currency */}
      <div>
        <label className="label">Rate type *</label>
        <div className="flex rounded-xl overflow-hidden border border-gray-200 mb-3">
          {(['hourly', 'monthly'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm({ ...form, rateType: t })}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                form.rateType === t
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300'
              }`}
            >
              {t === 'hourly' ? 'Per Hour' : 'Per Month'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">
              {form.rateType === 'monthly' ? 'Monthly rate *' : 'Rate per hour *'}
            </label>
            <input
              className="input"
              type="number"
              placeholder={form.rateType === 'monthly' ? '5000' : '500'}
              value={form.ratePerHour}
              onChange={(e) => setForm({ ...form, ratePerHour: e.target.value })}
              required
              min="0"
            />
          </div>
          <div>
            <label className="label">Currency</label>
            <select
              className="input"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Scheduled time */}
      <div>
        <label className="label">Scheduled class time (IST) — optional</label>
        <TimePicker12h
          value={form.scheduledTime}
          onChange={(v) => setForm({ ...form, scheduledTime: v })}
        />
        <p className="text-xs text-gray-400 mt-1">
          You'll get a reminder at this time each day to log a session.
        </p>
      </div>

      {/* Color picker */}
      <div>
        <label className="label">Color</label>
        <div className="flex gap-2 flex-wrap">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, color: c })}
              aria-label={`Select color ${c}`}
              className={`w-8 h-8 rounded-full transition-transform active:scale-95 ${
                form.color === c
                  ? 'ring-2 ring-offset-2 ring-primary-500 scale-110'
                  : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2 pb-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          Cancel
        </button>
        <button type="submit" className="btn-primary flex-1">
          {isEdit ? 'Save changes' : 'Add student'}
        </button>
      </div>
    </form>
  )
}
