import { useState } from 'react'
import useAppStore from '@store/useStore'
import { formatCurrency } from '@utils/billing'
import { useToast } from '@hooks/useToast'

interface PaymentEntryProps {
  onClose: () => void
}

export default function PaymentEntry({ onClose }: PaymentEntryProps) {
  const students   = useAppStore((s) => s.students)
  const getBalance = useAppStore((s) => s.getBalance)
  const addPayment = useAppStore((s) => s.addPayment)
  const { showToast } = useToast()

  const [form, setForm] = useState({
    studentId: students[0]?.id ?? '',
    date:      new Date().toISOString().slice(0, 10),
    amount:    '',
    note:      '',
  })

  const selectedStudent = students.find((s) => s.id === form.studentId)
  const balance = selectedStudent ? getBalance(form.studentId) : 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.studentId || !form.amount) return
    addPayment({ ...form, amount: parseFloat(form.amount), note: form.note })
    const studentName = students.find((s) => s.id === form.studentId)?.name ?? ''
    showToast(
      `Payment of ${formatCurrency(parseFloat(form.amount), selectedStudent?.currency)} from ${studentName} recorded`,
      'success',
    )
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Student *</label>
        <select
          className="input"
          value={form.studentId}
          onChange={(e) => setForm({ ...form, studentId: e.target.value })}
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        {selectedStudent && (
          <p className="text-xs text-red-500 mt-1">
            Pending: {formatCurrency(balance, selectedStudent.currency)}
          </p>
        )}
      </div>

      <div>
        <label className="label">Date</label>
        <input
          type="date"
          className="input"
          value={form.date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Amount received *</label>
        <input
          type="number"
          className="input"
          placeholder="0"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          required
          min="0"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="label mb-0">Note (optional)</label>
          <span className={`text-xs ${form.note.length > 130 ? 'text-amber-500' : 'text-gray-400'}`}>
            {form.note.length}/150
          </span>
        </div>
        <input
          className="input"
          placeholder="e.g. UPI, Cash"
          value={form.note}
          maxLength={150}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" className="btn-primary flex-1">Record payment</button>
      </div>
    </form>
  )
}
