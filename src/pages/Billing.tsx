import { useState, useMemo } from 'react'
import { Plus, Download, ChevronDown, ChevronUp, FileText, FileSpreadsheet, Calendar, Receipt } from 'lucide-react'
import Header from '@components/shared/Header'
import Modal from '@components/shared/Modal'
import PaymentEntry from '@components/billing/PaymentEntry'
import StudentAvatar from '@components/shared/StudentAvatar'
import useAppStore from '@store/useStore'
import { formatCurrency, getMonthlyBreakdown } from '@utils/billing'
import { exportToExcel, exportAllStudentsSummaryExcel } from '@utils/billingExcel'
import { openInvoicePDF } from '@utils/billingInvoice'
import { openReceiptPDF } from '@utils/billingReceipt'
import type { Student, Payment } from '@/types'

interface InvModal { student: Student; dateFrom: string; dateTo: string }
interface RcptModal { student: Student }

export default function Billing() {
  const students    = useAppStore((s) => s.students)
  const sessions    = useAppStore((s) => s.sessions)
  const payments    = useAppStore((s) => s.payments)
  const settings    = useAppStore((s) => s.settings)
  const getTotalDue = useAppStore((s) => s.getTotalDue)
  const getTotalPaid= useAppStore((s) => s.getTotalPaid)
  const getBalance  = useAppStore((s) => s.getBalance)

  const [showPayment,     setShowPayment]     = useState(false)
  const [expandedMonths,  setExpandedMonths]  = useState<Record<string, boolean>>({})
  const [invModal,        setInvModal]        = useState<InvModal | null>(null)
  const [rcptModal,       setRcptModal]       = useState<RcptModal | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const invSessionCount = useMemo(() => {
    if (!invModal) return 0
    const { student, dateFrom, dateTo } = invModal
    return sessions.filter(
      (s) =>
        s.studentId === student.id &&
        (!dateFrom || s.date >= dateFrom) &&
        (!dateTo   || s.date <= dateTo),
    ).length
  }, [invModal, sessions])

  function toggleMonths(studentId: string) {
    setExpandedMonths((prev) => ({ ...prev, [studentId]: !prev[studentId] }))
  }

  async function handleExportExcel(student: Student) {
    const ss = sessions.filter((s) => s.studentId === student.id)
    const ps = payments.filter((p) => p.studentId === student.id)
    await exportToExcel(student, ss, ps)
  }

  function generateInvoice() {
    if (!invModal) return
    const { student, dateFrom, dateTo } = invModal
    const ss = sessions.filter((s) => s.studentId === student.id)
    const ps = payments.filter((p) => p.studentId === student.id)
    openInvoicePDF(student, ss, ps, settings.teacherName, dateFrom, dateTo)
    setInvModal(null)
  }

  function generateReceipt(payment: Payment) {
    if (!rcptModal) return
    const { student } = rcptModal
    const ss = sessions.filter((s) => s.studentId === student.id)
    const ps = payments.filter((p) => p.studentId === student.id)
    openReceiptPDF(student, ss, ps, payment, settings.teacherName)
    setRcptModal(null)
  }

  async function handleSummaryExcel() {
    await exportAllStudentsSummaryExcel(students, sessions, payments)
  }

  return (
    <div>
      <Header
        title="Billing"
        action={
          <div className="flex items-center gap-2">
            {students.length > 0 && (
              <button
                onClick={handleSummaryExcel}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-xl px-2.5 py-2 transition-colors"
                title="Export all students summary as Excel"
              >
                <FileSpreadsheet size={14} /> All Excel
              </button>
            )}
            <button onClick={() => setShowPayment(true)} className="btn-primary flex items-center gap-1.5">
              <Plus size={16} /> Payment
            </button>
          </div>
        }
      />

      <div className="px-4 space-y-4 pb-6">
        {students.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">💰</p>
            <p className="text-sm">Add students first to track billing</p>
          </div>
        ) : (
          students.map((student) => {
            const due     = getTotalDue(student.id)
            const paid    = getTotalPaid(student.id)
            const balance = getBalance(student.id)
            const studentSessions = sessions.filter((s) => s.studentId === student.id)
            const studentPayments  = payments.filter((p) => p.studentId === student.id)
            const monthly = getMonthlyBreakdown(studentSessions, studentPayments, student.ratePerHour, student.rateType ?? 'hourly')

            return (
              <div key={student.id} className="card space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <StudentAvatar name={student.name} color={student.color ?? '#6366f1'} size="sm" />
                    <span className="font-semibold text-gray-900 text-sm">{student.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const studentPayments = payments
                          .filter((p) => p.studentId === student.id)
                          .sort((a, b) => b.date.localeCompare(a.date))
                        const last = studentPayments[0]
                        let prefillFrom = ''
                        if (last) {
                          const d = new Date(last.date + 'T00:00:00')
                          d.setDate(d.getDate() + 1)
                          prefillFrom = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
                        }
                        setInvModal({ student, dateFrom: prefillFrom, dateTo: today })
                      }}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-600 transition-colors"
                      title="Open printable invoice (PDF)"
                    >
                      <FileText size={13} /> Invoice
                    </button>
                    <span className="text-gray-200 select-none">|</span>
                    <button
                      onClick={() => setRcptModal({ student })}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 transition-colors"
                      title="Generate payment receipt"
                    >
                      <Receipt size={13} /> Receipt
                    </button>
                    <span className="text-gray-200 select-none">|</span>
                    <button
                      onClick={() => handleExportExcel(student)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                      title="Download Excel"
                    >
                      <Download size={13} /> Excel
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <p className="text-[10px] text-gray-400">Total due</p>
                    <p className="text-xs font-semibold text-gray-800">{formatCurrency(due, student.currency)}</p>
                    <p className="text-[9px] text-gray-300 mt-0.5">all time</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-2.5 text-center">
                    <p className="text-[10px] text-gray-400">Received</p>
                    <p className="text-xs font-semibold text-green-700">{formatCurrency(paid, student.currency)}</p>
                    <p className="text-[9px] text-gray-300 mt-0.5">all time</p>
                  </div>
                  <div className={`rounded-xl p-2.5 text-center ${balance > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                    <p className="text-[10px] text-gray-400">Pending</p>
                    <p className={`text-xs font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(balance, student.currency)}
                    </p>
                    <p className="text-[9px] text-gray-300 mt-0.5">all time</p>
                  </div>
                </div>

                {monthly.length > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400 font-medium mb-2">Monthly</p>
                    <div className="space-y-1.5">
                      {(expandedMonths[student.id] ? monthly : monthly.slice(0, 3)).map((m) => (
                        <div key={m.key} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{m.month}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400">{m.hours}h</span>
                            <span className={m.balance > 0 ? 'text-red-500' : 'text-green-600'}>
                              {m.balance > 0 ? `-${formatCurrency(m.balance, student.currency)}` : 'Paid'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {monthly.length > 3 && (
                      <button
                        onClick={() => toggleMonths(student.id)}
                        className="mt-2 flex items-center gap-1 text-[11px] text-indigo-600 font-medium"
                      >
                        {expandedMonths[student.id]
                          ? <><ChevronUp size={12} /> Show less</>
                          : <><ChevronDown size={12} /> Show all {monthly.length} months</>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="Record payment">
        <PaymentEntry onClose={() => setShowPayment(false)} />
      </Modal>

      {/* Receipt payment-picker modal */}
      <Modal
        isOpen={!!rcptModal}
        onClose={() => setRcptModal(null)}
        title={rcptModal ? `Receipt — ${rcptModal.student.name}` : ''}
      >
        {rcptModal && (() => {
          const studentPayments = payments
            .filter((p) => p.studentId === rcptModal.student.id)
            .sort((a, b) =>
              b.date !== a.date
                ? b.date.localeCompare(a.date)
                : (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
            )
          return (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">Select a payment to generate a receipt for:</p>
              {studentPayments.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-3xl mb-2">💸</p>
                  <p className="text-sm">No payments recorded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {studentPayments.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => generateReceipt(p)}
                      className="w-full flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 hover:bg-green-50 hover:border-green-200 px-4 py-3 transition-colors text-left group"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-green-700">
                          {formatCurrency(p.amount, rcptModal.student.currency)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{p.date}</p>
                        {p.note && <p className="text-xs text-gray-400 italic mt-0.5">{p.note}</p>}
                      </div>
                      <Receipt size={15} className="text-gray-300 group-hover:text-green-500 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setRcptModal(null)} className="btn-secondary w-full">
                Cancel
              </button>
            </div>
          )
        })()}
      </Modal>

      {/* Invoice date-range modal */}
      <Modal
        isOpen={!!invModal}
        onClose={() => setInvModal(null)}
        title={invModal ? `Invoice — ${invModal.student.name}` : ''}
      >
        {invModal && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Choose a date range to include in the invoice. Leave both blank to include all sessions.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">From</label>
                <input
                  type="date"
                  className="input"
                  value={invModal.dateFrom}
                  max={today}
                  onChange={(e) => setInvModal({ ...invModal, dateFrom: e.target.value })}
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  type="date"
                  className="input"
                  value={invModal.dateTo}
                  max={today}
                  onChange={(e) => setInvModal({ ...invModal, dateTo: e.target.value })}
                />
              </div>
            </div>

            <div className={`flex items-center gap-2 text-sm rounded-xl px-3 py-2.5 ${
              invSessionCount > 0 ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-50 text-gray-400'
            }`}>
              <Calendar size={14} />
              {invModal.dateFrom || invModal.dateTo
                ? `${invSessionCount} session${invSessionCount !== 1 ? 's' : ''} in selected range`
                : `${sessions.filter((s) => s.studentId === invModal.student.id).length} sessions total (all time)`
              }
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setInvModal(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={generateInvoice}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                <FileText size={14} /> Generate Invoice
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
