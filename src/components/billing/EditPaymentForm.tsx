import { useState } from 'react'
import type { Payment, Student } from '@/types'
import { DEFAULT_CURRENCY } from '@constants'

interface EditPaymentFormProps {
  payment: Payment
  student: Student
  onSave: (updates: Partial<Payment>) => void
  onClose: () => void
}

export default function EditPaymentForm({ payment, student, onSave, onClose }: EditPaymentFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    date:   payment.date,
    amount: payment.amount,
    note:   payment.note ?? '',
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(form) }} className="space-y-4">
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
      <div>
        <label className="label">Amount ({student.currency ?? DEFAULT_CURRENCY})</label>
        <input
          type="number"
          className="input"
          min="1"
          step="1"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) })}
          required
        />
      </div>
      <div>
        <label className="label">Note (optional)</label>
        <input
          className="input"
          placeholder="e.g. UPI, Cash"
          value={form.note}
          onChange={(e) => setForm({ ...form, note: e.target.value })}
        />
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        <button type="submit" className="btn-primary flex-1">Save changes</button>
      </div>
    </form>
  )
}
