import { useState, useMemo } from 'react'
import {
  Plus, Download, ChevronDown, ChevronUp, ChevronRight, FileText, FileSpreadsheet,
  Calendar, Receipt as ReceiptIcon, PauseCircle, AlertTriangle, UserX, X, History, Eye, Undo2, Trash2,
} from 'lucide-react'
import Header from '@components/shared/Header'
import Modal from '@components/shared/Modal'
import PaymentEntry from '@components/billing/PaymentEntry'
import StudentAvatar from '@components/shared/StudentAvatar'
import useAppStore from '@store/useStore'
import { useToast } from '@hooks/useToast'
import { formatCurrency } from '@utils/billing'
import { getStudentLedger, hasLeft } from '@utils/billingCore'
import { todayISO, formatDayMonth, formatDuration } from '@utils/date'
import { exportToExcel, exportAllStudentsSummaryExcel } from '@utils/billingExcel'
import {
  previewInvoiceTotals, previewDraftInvoice, finalizeInvoice, reprintInvoice, nextInvoiceNumber,
  buildCreditNote, nextCreditNoteNumber, isCredited,
} from '@utils/billingInvoice'
import { issueReceipt, reprintReceipt, nextReceiptNumber } from '@utils/billingReceipt'
import type { Student, Payment, InvoiceAdjustment, Invoice } from '@/types'

/** The draft being edited: `id` is null until it's saved as a stored draft. */
interface InvModal {
  student: Student
  draftId: string | null
  dateFrom: string
  dateTo: string
  adjustments: InvoiceAdjustment[]
}
interface RcptModal { student: Student }
interface HistModal { student: Student }

export default function Billing() {
  const students = useAppStore((s) => s.students)
  const sessions = useAppStore((s) => s.sessions)
  const payments = useAppStore((s) => s.payments)
  const breaks   = useAppStore((s) => s.breaks)
  const invoices = useAppStore((s) => s.invoices)
  const receipts = useAppStore((s) => s.receipts)
  const settings = useAppStore((s) => s.settings)
  const createDraftInvoice   = useAppStore((s) => s.createDraftInvoice)
  const updateDraftInvoice   = useAppStore((s) => s.updateDraftInvoice)
  const deleteDraftInvoice   = useAppStore((s) => s.deleteDraftInvoice)
  const finalizeDraftInvoice = useAppStore((s) => s.finalizeDraftInvoice)
  const issueCreditNote      = useAppStore((s) => s.issueCreditNote)
  const addReceipt           = useAppStore((s) => s.addReceipt)
  const { showToast } = useToast()

  const [showPayment,    setShowPayment]    = useState(false)
  const [expandedCycles, setExpandedCycles] = useState<Record<string, boolean>>({})
  const [invModal,       setInvModal]       = useState<InvModal | null>(null)
  const [rcptModal,      setRcptModal]      = useState<RcptModal | null>(null)
  const [histModal,      setHistModal]      = useState<HistModal | null>(null)
  const [showLeft,       setShowLeft]       = useState(false)

  const today = todayISO()

  /** One ledger per student, recomputed only when the underlying data moves. */
  const ledgers = useMemo(
    () => new Map(
      students.map((s) => [s.id, getStudentLedger(s, sessions, payments, breaks, today, invoices)]),
    ),
    [students, sessions, payments, breaks, invoices, today],
  )

  // Left students keep their full billing history but sit in their own
  // section so the main list stays focused on who's still being taught.
  const activeStudents = useMemo(() => students.filter((s) => !hasLeft(s, today)), [students, today])
  const leftStudents   = useMemo(() => students.filter((s) => hasLeft(s, today)), [students, today])

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

  function toggleCycles(studentId: string) {
    setExpandedCycles((prev) => ({ ...prev, [studentId]: !prev[studentId] }))
  }

  async function handleExportExcel(student: Student) {
    const ss = sessions.filter((s) => s.studentId === student.id)
    const ps = payments.filter((p) => p.studentId === student.id)
    try {
      await exportToExcel(student, ss, ps, breaks, invoices)
    } catch {
      showToast('Could not build that Excel file', 'error')
    }
  }

  /** Live preview total shown in the draft editor, including any manual adjustments. */
  const invPreview = useMemo(() => {
    if (!invModal) return null
    const { student, dateFrom, dateTo, adjustments } = invModal
    return previewInvoiceTotals(
      student, sessions, payments, dateFrom, dateTo, breaks, adjustments, invoices,
    )
  }, [invModal, sessions, payments, breaks, invoices])

  function addAdjustmentRow() {
    if (!invModal) return
    setInvModal({ ...invModal, adjustments: [...invModal.adjustments, { description: '', amount: 0 }] })
  }

  function updateAdjustmentRow(index: number, patch: Partial<InvoiceAdjustment>) {
    if (!invModal) return
    const adjustments = invModal.adjustments.map((a, i) => (i === index ? { ...a, ...patch } : a))
    setInvModal({ ...invModal, adjustments })
  }

  function removeAdjustmentRow(index: number) {
    if (!invModal) return
    setInvModal({ ...invModal, adjustments: invModal.adjustments.filter((_, i) => i !== index) })
  }

  /** Blank descriptions or zero amounts would print as noise on the document. */
  function cleanAdjustments(adjustments: InvoiceAdjustment[]): InvoiceAdjustment[] {
    return adjustments.filter((a) => a.description.trim() && a.amount !== 0)
  }

  function handlePreviewDraft() {
    if (!invModal) return
    const { student, dateFrom, dateTo, adjustments } = invModal
    try {
      previewDraftInvoice(student, sessions, payments, settings.teacherName, {
        periodFrom: dateFrom, periodTo: dateTo, adjustments: cleanAdjustments(adjustments),
      }, breaks, invoices)
    } catch {
      showToast('Could not build that preview', 'error')
    }
  }

  /** Keeps the draft for later without issuing it. */
  function handleSaveDraft() {
    if (!invModal) return
    const { student, draftId, dateFrom, dateTo, adjustments } = invModal
    const payload = { periodFrom: dateFrom, periodTo: dateTo, adjustments }
    if (draftId) updateDraftInvoice(draftId, payload)
    else createDraftInvoice(student.id, dateFrom, dateTo, adjustments)
    setInvModal(null)
    showToast('Draft saved', 'success')
  }

  function handleFinalize() {
    if (!invModal) return
    const { student, draftId, dateFrom, dateTo, adjustments } = invModal
    const clean = cleanAdjustments(adjustments)
    if (invPreview && invPreview.charges === 0 && clean.length === 0) {
      showToast('Nothing left to bill — add an adjustment or log new sessions', 'info')
      return
    }
    try {
      const frozen = finalizeInvoice(
        student, sessions, payments, settings.teacherName,
        { periodFrom: dateFrom, periodTo: dateTo, adjustments: clean },
        breaks,
        nextInvoiceNumber(invoices, today),
        invoices,
      )
      // Finalising always goes through a stored draft, so an invoice never
      // exists in the list without having been a draft first.
      const id = draftId ?? createDraftInvoice(student.id, dateFrom, dateTo, clean).id
      if (draftId) updateDraftInvoice(draftId, { adjustments: clean })
      finalizeDraftInvoice(id, frozen)
      reprintInvoice({
        ...frozen, id, studentId: student.id,
        periodFrom: dateFrom, periodTo: dateTo,
        adjustments: clean, createdAt: new Date().toISOString(),
      }, student.name)
      setInvModal(null)
      showToast(`Invoice ${frozen.invoiceNumber} issued`, 'success')
    } catch {
      showToast('Could not issue that invoice', 'error')
    }
  }

  /** Receipts are issued once; afterwards the stored copy is replayed verbatim. */  function generateReceipt(payment: Payment) {
    if (!rcptModal) return
    const student = rcptModal.student
    const existing = receipts.find((r) => r.paymentId === payment.id && !r.voided)
    if (existing) {
      reprintReceipt(existing, student.name)
      setRcptModal(null)
      return
    }
    try {
      const record = issueReceipt(
        student, sessions, payments, payment, settings.teacherName, breaks,
        nextReceiptNumber(receipts, today), invoices,
      )
      if (!record) {
        showToast('That payment is no longer on file', 'error')
        return
      }
      const saved = addReceipt(record)
      reprintReceipt(saved, student.name)
      setRcptModal(null)
    } catch {
      showToast('Could not build that receipt', 'error')
    }
  }

  async function handleSummaryExcel() {
    try {
      await exportAllStudentsSummaryExcel(students, sessions, payments, breaks, invoices)
    } catch {
      showToast('Could not build the summary file', 'error')
    }
  }

  /** Reverses a sent invoice with a counter-document rather than erasing it. */
  function handleCreditNote(inv: Invoice, student: Student) {
    try {
      const record = buildCreditNote(
        student, inv, settings.teacherName, payments, invoices,
        nextCreditNoteNumber(invoices, today),
      )
      const saved = issueCreditNote(record)
      reprintInvoice(saved, student.name)
      showToast(`Credit note ${saved.invoiceNumber} issued`, 'success')
    } catch {
      showToast('Could not issue that credit note', 'error')
    }
  }

  function renderStudentBilling(student: Student) {
    const ledger   = ledgers.get(student.id)!
    const currency = student.currency
    const cycles   = ledger.cycles.slice().reverse()   // newest first
    const expanded = expandedCycles[student.id]

    return (
      <div key={student.id} className="card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <StudentAvatar name={student.name} color={student.color ?? '#6366f1'} size="sm" />
            <div>
              <span className="font-semibold text-gray-900 text-sm">{student.name}</span>
              {student.endDate && (
                <span className="ml-1.5 text-[10px] text-gray-400">
                  left {formatDayMonth(student.endDate)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInvModal({ student, draftId: null, dateFrom: '', dateTo: '', adjustments: [] })}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-600 transition-colors"
              title="Draft an invoice"
            >
              <FileText size={13} /> Invoice
            </button>
            <span className="text-gray-200 select-none">|</span>
            <button
              onClick={() => setHistModal({ student })}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-purple-600 transition-colors"
              title="Drafts and issued invoices"
            >
              <History size={13} />
            </button>
            <span className="text-gray-200 select-none">|</span>
            <button
              onClick={() => setRcptModal({ student })}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-green-600 transition-colors"
              title="Generate payment receipt"
            >
              <ReceiptIcon size={13} /> Receipt
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

        {/* Totals */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400">Billed</p>
            <p className="text-xs font-semibold text-gray-800">
              {formatCurrency(ledger.totalDue, currency)}
            </p>
            <p className="text-[9px] text-gray-300 mt-0.5">
              {ledger.cycles.length} cycle{ledger.cycles.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="bg-green-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400">Received</p>
            <p className="text-xs font-semibold text-green-700">
              {formatCurrency(ledger.totalPaid, currency)}
            </p>
            <p className="text-[9px] text-gray-300 mt-0.5">all time</p>
          </div>
          {ledger.balance > 0 ? (
            <div className="rounded-xl p-2.5 text-center bg-red-50">
              <p className="text-[10px] text-gray-400">Pending</p>
              <p className="text-xs font-semibold text-red-600">
                {formatCurrency(ledger.balance, currency)}
              </p>
              <p className="text-[9px] text-gray-300 mt-0.5">due now</p>
            </div>
          ) : ledger.credit > 0 ? (
            <div className="rounded-xl p-2.5 text-center bg-indigo-50">
              <p className="text-[10px] text-gray-400">Credit</p>
              <p className="text-xs font-semibold text-indigo-600">
                {formatCurrency(ledger.credit, currency)}
              </p>
              <p className="text-[9px] text-gray-300 mt-0.5">paid ahead</p>
            </div>
          ) : (
            <div className="rounded-xl p-2.5 text-center bg-green-50">
              <p className="text-[10px] text-gray-400">Pending</p>
              <p className="text-xs font-semibold text-green-600">
                {formatCurrency(0, currency)}
              </p>
              <p className="text-[9px] text-gray-300 mt-0.5">settled</p>
            </div>
          )}
        </div>

        {/* Sessions that fall in no cycle contribute nothing — surface them */}
        {ledger.unbilled.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
            <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 leading-snug">
              {ledger.unbilled.length} session{ledger.unbilled.length !== 1 ? 's' : ''} outside
              the billing period ({ledger.unbilled.map((s) => formatDayMonth(s.date)).join(', ')})
              {' '}— not charged. Move the billing start date back under Students, or delete them.
            </p>
          </div>
        )}

        {/* Cycles */}
        {cycles.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-400 font-medium mb-2">
              Billing cycles
            </p>
            <div className="space-y-1.5">
              {(expanded ? cycles : cycles.slice(0, 3)).map((c) => (
                <div key={c.key} className="flex items-start justify-between text-xs gap-2">
                  <div className="min-w-0">
                    <span className="text-gray-600">{c.label}</span>
                    {c.breakDays > 0 && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                        <PauseCircle size={9} />
                        +{c.breakDays}d
                      </span>
                    )}
                    {c.proRated && (
                      <span className="ml-1.5 text-[10px] text-gray-400">pro-rated</span>
                    )}
                    {c.extraAmount > 0 && (
                      <span className="ml-1.5 text-[10px] text-amber-600">
                        +{formatCurrency(c.extraAmount, currency)} extra
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-gray-400">{formatDuration(c.hours)}</span>
                    {c.balance > 0 ? (
                      <span className="text-red-500 font-medium">
                        {formatCurrency(c.balance, currency)} due
                      </span>
                    ) : (
                      <span className="text-green-600">Paid</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {cycles.length > 3 && (
              <button
                onClick={() => toggleCycles(student.id)}
                className="mt-2 flex items-center gap-1 text-[11px] text-indigo-600 font-medium"
              >
                {expanded
                  ? <><ChevronUp size={12} /> Show less</>
                  : <><ChevronDown size={12} /> Show all {cycles.length} cycles</>}
              </button>
            )}
          </div>
        )}
      </div>
    )
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

      <div className="px-4 space-y-4 pb-4">
        {students.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">💰</p>
            <p className="text-sm">Add students first to track billing</p>
          </div>
        ) : activeStudents.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">No active students.</p>
          </div>
        ) : (
          activeStudents.map((student) => renderStudentBilling(student))
        )}
      </div>

      {leftStudents.length > 0 && (
        <div className="px-4 pb-6">
          <button
            onClick={() => setShowLeft((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              <UserX size={14} /> Left ({leftStudents.length})
            </span>
            {showLeft ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {showLeft && (
            <div className="space-y-4 mt-3">
              {leftStudents.map((student) => renderStudentBilling(student))}
            </div>
          )}
        </div>
      )}

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
              <p className="text-xs text-gray-500">
                Select a payment. A receipt is issued once and never changes — picking one that
                already has a receipt reprints the original.
              </p>
              {studentPayments.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-3xl mb-2">💸</p>
                  <p className="text-sm">No payments recorded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {studentPayments.map((p) => {
                    const issued = receipts.find((r) => r.paymentId === p.id && !r.voided)
                    return (
                    <button
                      key={p.id}
                      onClick={() => generateReceipt(p)}
                      className="w-full flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 hover:bg-green-50 hover:border-green-200 px-4 py-3 transition-colors text-left group"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-800 group-hover:text-green-700">
                          {formatCurrency(p.amount, rcptModal.student.currency)}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDayMonth(p.date)}</p>
                        {issued && (
                          <p className="text-[11px] text-green-600 mt-0.5">{issued.receiptNumber} · reprint</p>
                        )}
                        {p.note && <p className="text-xs text-gray-400 italic mt-0.5">{p.note}</p>}
                      </div>
                      <ReceiptIcon size={15} className="text-gray-300 group-hover:text-green-500 shrink-0" />
                    </button>
                    )
                  })}
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
              Leave both dates blank to invoice everything still outstanding. Set a range to
              invoice the cycles it covers instead.
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
              invModal.dateFrom || invModal.dateTo
                ? 'bg-indigo-50 text-indigo-700'
                : 'bg-gray-50 text-gray-500'
            }`}>
              <Calendar size={14} />
              {invModal.dateFrom || invModal.dateTo
                ? `${invSessionCount} session${invSessionCount !== 1 ? 's' : ''} in selected range`
                : (() => {
                    const l = ledgers.get(invModal.student.id)
                    const owing = l?.cycles.filter((c) => c.balance > 0).length ?? 0
                    return owing > 0
                      ? `${owing} unpaid cycle${owing !== 1 ? 's' : ''} · ${formatCurrency(l!.balance, invModal.student.currency)} due`
                      : 'Nothing outstanding — invoice will be empty'
                  })()
              }
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="label !mb-0">Adjustments (discount, waiver, extra charge)</label>
                <button type="button" onClick={addAdjustmentRow} className="text-[11px] text-indigo-600 font-medium">
                  + Add line
                </button>
              </div>
              {invModal.adjustments.length === 0 ? (
                <p className="text-[11px] text-gray-400">
                  None — invoice will show the computed amount as-is. Add a line to settle for a different figure.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {invModal.adjustments.map((a, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        className="input flex-1 !py-1.5 text-xs"
                        placeholder="e.g. Agreed settlement"
                        value={a.description}
                        onChange={(e) => updateAdjustmentRow(i, { description: e.target.value })}
                      />
                      <input
                        type="number"
                        className="input w-24 !py-1.5 text-xs"
                        placeholder="-500"
                        value={a.amount || ''}
                        onChange={(e) => updateAdjustmentRow(i, { amount: parseFloat(e.target.value) || 0 })}
                      />
                      <button
                        type="button"
                        onClick={() => removeAdjustmentRow(i)}
                        className="text-gray-300 hover:text-red-500 shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <p className="text-[10px] text-gray-400">Negative reduces the total, positive adds to it.</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-3 py-2.5">
              <span className="text-xs text-indigo-700">Amount this invoice will show</span>
              <span className="text-sm font-semibold text-indigo-900">
                {invPreview ? formatCurrency(invPreview.total, invModal.student.currency) : '—'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handlePreviewDraft}
                className="btn-secondary flex items-center justify-center gap-1.5"
              >
                <Eye size={14} /> Preview
              </button>
              <button type="button" onClick={handleSaveDraft} className="btn-secondary">
                Save draft
              </button>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setInvModal(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                className="btn-primary flex-1 flex items-center justify-center gap-1.5"
              >
                <FileText size={14} /> Issue Invoice
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center">
              Preview opens a watermarked copy without saving. Issuing assigns a number and
              freezes the document permanently.
            </p>
          </div>
        )}
      </Modal>

      {/* Invoice history modal */}
      <Modal
        isOpen={!!histModal}
        onClose={() => setHistModal(null)}
        title={histModal ? `Invoices — ${histModal.student.name}` : ''}
      >
        {histModal && (() => {
          const studentInvoices = invoices
            .filter((i) => i.studentId === histModal.student.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          return (
            <div className="space-y-2">
              {studentInvoices.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-3xl mb-2">🧾</p>
                  <p className="text-sm">No invoices yet</p>
                </div>
              ) : (
                studentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                      inv.status === 'void'
                        ? 'border-gray-100 bg-gray-50 opacity-60'
                        : 'border-gray-100 bg-gray-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">
                        {inv.status === 'draft'
                          ? formatCurrency(
                              previewInvoiceTotals(
                                histModal.student, sessions, payments,
                                inv.periodFrom, inv.periodTo, breaks, inv.adjustments, invoices,
                              ).total,
                              histModal.student.currency,
                            )
                          : formatCurrency(inv.total, histModal.student.currency)}
                        {inv.status === 'draft' && (
                          <span className="ml-1.5 text-[10px] font-medium text-amber-600">draft</span>
                        )}
                        {inv.creditsInvoiceId && (
                          <span className="ml-1.5 text-[10px] font-medium text-indigo-600">credit note</span>
                        )}
                        {inv.status === 'void' && (
                          <span className="ml-1.5 text-[10px] text-gray-400">voided</span>
                        )}
                        {inv.status === 'issued' && !inv.creditsInvoiceId && isCredited(inv, invoices) && (
                          <span className="ml-1.5 text-[10px] text-gray-400">credited</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {inv.status === 'draft'
                          ? `Started ${formatDayMonth(inv.createdAt.slice(0, 10))}`
                          : `${inv.invoiceNumber} · ${formatDayMonth(inv.issuedDate)}`}
                      </p>
                      {inv.periodLabel && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{inv.periodLabel}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {inv.status === 'draft' ? (
                        <>
                          <button
                            onClick={() => {
                              setHistModal(null)
                              setInvModal({
                                student: histModal.student, draftId: inv.id,
                                dateFrom: inv.periodFrom, dateTo: inv.periodTo,
                                adjustments: inv.adjustments,
                              })
                            }}
                            className="p-1.5 text-gray-400 hover:text-indigo-600"
                            title="Edit draft"
                          >
                            <FileText size={15} />
                          </button>
                          <button
                            onClick={() => deleteDraftInvoice(inv.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500"
                            title="Discard draft"
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => reprintInvoice(inv, histModal.student.name)}
                            className="p-1.5 text-gray-400 hover:text-purple-600"
                            title="Reprint"
                          >
                            <FileText size={15} />
                          </button>
                          {inv.status === 'issued' && !inv.creditsInvoiceId && !isCredited(inv, invoices) && (
                            <button
                              onClick={() => handleCreditNote(inv, histModal.student)}
                              className="p-1.5 text-gray-400 hover:text-indigo-600"
                              title="Issue a credit note reversing this invoice"
                            >
                              <Undo2 size={15} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
              <button type="button" onClick={() => setHistModal(null)} className="btn-secondary w-full">
                Close
              </button>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
