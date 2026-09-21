import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Student, Session, Payment, Break, Settings, StudentLedger, Invoice, InvoiceAdjustment, Receipt } from '@/types'
import { STORE_NAME, DEFAULT_CURRENCY } from '@constants'
import { getStudentLedger } from '@utils/billingCore'
import { migrateStudent, migrateStudents, migrateInvoices } from '@utils/migrate'
import { todayISO } from '@utils/date'

/** Bump when the persisted shape changes; `migrate` below backfills. */
const STORE_VERSION = 5

/** Exactly what `partialize` writes to storage. */
interface PersistedState {
  students: Student[]
  sessions: Session[]
  payments: Payment[]
  breaks: Break[]
  settings: Settings
  invoices: Invoice[]
  receipts: Receipt[]
}

const DEFAULT_SETTINGS: Settings = {
  teacherName: 'Teacher',
  teacherTimezone: 'Asia/Kolkata',
  dailyReminderTime: '20:00',
  reminderEnabled: false,
  currency: DEFAULT_CURRENCY,
  onboardingCompleted: false,
}

interface StoreState {
  // ── State ────────────────────────────────────────────────────────────────
  students: Student[]
  sessions: Session[]
  payments: Payment[]
  breaks: Break[]
  invoices: Invoice[]
  receipts: Receipt[]
  pendingReminders: string[]  // studentIds — NOT persisted, in-memory only
  settings: Settings

  // ── Student actions ──────────────────────────────────────────────────────
  addStudent: (student: Omit<Student, 'id' | 'createdAt' | 'rateHistory'>) => void
  /**
   * `rateEffectiveFrom` overrides the default "effective today" when a rate
   * or rate-type change is included in `updates` — lets the caller schedule
   * a change for a specific date instead of always applying it immediately.
   */
  updateStudent: (id: string, updates: Partial<Student>, rateEffectiveFrom?: string) => void
  deleteStudent: (id: string) => void

  // ── Session actions ──────────────────────────────────────────────────────
  addSession: (session: Omit<Session, 'id' | 'createdAt'>) => void
  updateSession: (id: string, updates: Partial<Session>) => void
  deleteSession: (id: string) => void

  // ── Payment actions ──────────────────────────────────────────────────────
  addPayment: (payment: Omit<Payment, 'id' | 'createdAt'>) => void
  updatePayment: (id: string, updates: Partial<Payment>) => void
  deletePayment: (id: string) => void

  // ── Break actions ────────────────────────────────────────────────────────
  addBreak: (brk: Omit<Break, 'id' | 'createdAt'>) => void
  updateBreak: (id: string, updates: Partial<Break>) => void
  deleteBreak: (id: string) => void
  getBreaksByStudent: (studentId: string) => Break[]

  // ── Settings ─────────────────────────────────────────────────────────────
  updateSettings: (updates: Partial<Settings>) => void

  // ── Invoice actions ──────────────────────────────────────────────────────
  /** Starts an editable, unnumbered draft that carries no weight on the ledger. */
  createDraftInvoice: (
    studentId: string, periodFrom: string, periodTo: string, adjustments?: InvoiceAdjustment[],
  ) => Invoice
  updateDraftInvoice: (id: string, updates: Partial<Pick<Invoice, 'periodFrom' | 'periodTo' | 'adjustments'>>) => void
  deleteDraftInvoice: (id: string) => void
  /** Freezes a draft into an issued document. `frozen` comes from finalizeInvoice(). */
  finalizeDraftInvoice: (
    id: string,
    frozen: Pick<Invoice,
      'status' | 'invoiceNumber' | 'issuedDate' | 'periodLabel' | 'coverage'
      | 'charges' | 'total' | 'previousBalance' | 'amountDueNow' | 'html'>,
  ) => void
  voidInvoice: (id: string) => void
  /** Records a frozen credit note reversing an issued invoice. */
  issueCreditNote: (record: Omit<Invoice, 'id' | 'createdAt'>) => Invoice
  getInvoicesByStudent: (studentId: string) => Invoice[]

  // ── Receipt actions ─────────────────────────────────────────────────────
  /** Records a frozen receipt. `record` comes from issueReceipt(). */
  addReceipt: (record: Pick<Receipt, 'studentId' | 'paymentId' | 'receiptNumber' | 'issuedDate' | 'amount' | 'html'>) => Receipt
  voidReceipt: (id: string, reason?: string) => void
  getReceiptForPayment: (paymentId: string) => Receipt | undefined

  // ── Selectors (computed) ─────────────────────────────────────────────────
  getStudentById: (id: string) => Student | undefined
  getSessionsByStudent: (studentId: string) => Session[]
  getPaymentsByStudent: (studentId: string) => Payment[]
  getTotalHours: (studentId: string) => number
  getLedger: (studentId: string) => StudentLedger
  getTotalDue: (studentId: string) => number
  getTotalPaid: (studentId: string) => number
  getBalance: (studentId: string) => number
  getCredit: (studentId: string) => number

  // ── Pending reminder actions ─────────────────────────────────────────────
  addPendingReminder: (studentId: string) => void
  dismissPendingReminder: (studentId: string) => void

  // ── Backup restore ───────────────────────────────────────────────────────
  restoreBackup: (
    students: Student[], sessions: Session[], payments: Payment[], breaks?: Break[],
    invoices?: Invoice[], receipts?: Receipt[],
  ) => void
}

const EMPTY_LEDGER: StudentLedger = {
  cycles: [], totalDue: 0, totalPaid: 0, balance: 0, credit: 0, unbilled: [],
}

const useAppStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // ── Initial state ─────────────────────────────────────────────────────
      students: [],
      sessions: [],
      payments: [],
      breaks: [],
      invoices: [],
      receipts: [],
      pendingReminders: [], // intentionally not persisted — resets on reload
      settings: DEFAULT_SETTINGS,

      // ── Student actions ───────────────────────────────────────────────────
      addStudent: (student) =>
        set((state) => {
          const anchor = student.billingAnchorDate || todayISO()
          return {
            students: [
              ...state.students,
              {
                ...student,
                billingAnchorDate: anchor,
                rateHistory: [{
                  effectiveFrom: anchor,
                  ratePerHour: student.ratePerHour,
                  rateType: student.rateType,
                }],
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
              },
            ],
          }
        }),

      /**
       * A rate change appends to the timeline instead of overwriting it, so
       * past cycles keep the price they were actually billed at. It defaults
       * to taking effect today (the cycle in progress is unaffected, since
       * cycles are priced on their start date, and the next one picks it up),
       * but the caller can pass `rateEffectiveFrom` to schedule it for a
       * different date — a future date queues it up in advance, or a date
       * inside the still-open current cycle applies it sooner.
       */
      updateStudent: (id, updates, rateEffectiveFrom) =>
        set((state) => ({
          students: state.students.map((s) => {
            if (s.id !== id) return s

            const next = { ...s, ...updates }
            const rateChanged =
              (updates.ratePerHour !== undefined && updates.ratePerHour !== s.ratePerHour) ||
              (updates.rateType !== undefined && updates.rateType !== s.rateType)

            if (!rateChanged) return next

            const today = todayISO()
            const effectiveFrom = rateEffectiveFrom || today
            const history = [...(s.rateHistory ?? [])].filter(
              (r) => r.effectiveFrom !== effectiveFrom,
            )
            history.push({
              effectiveFrom,
              ratePerHour: next.ratePerHour,
              rateType: next.rateType,
            })
            history.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))

            // The record's own rate fields mean "the plan in force now", so a
            // change dated ahead only lands on the timeline until that day.
            return effectiveFrom > today
              ? { ...next, ratePerHour: s.ratePerHour, rateType: s.rateType, rateHistory: history }
              : { ...next, rateHistory: history }
          }),
        })),

      deleteStudent: (id) =>
        set((state) => ({
          students: state.students.filter((s) => s.id !== id),
          sessions: state.sessions.filter((s) => s.studentId !== id),
          payments: state.payments.filter((p) => p.studentId !== id),
          breaks:   state.breaks.filter((b) => b.studentId !== id),
          invoices: state.invoices.filter((i) => i.studentId !== id),
          receipts: state.receipts.filter((r) => r.studentId !== id),
        })),

      // ── Session actions ───────────────────────────────────────────────────
      addSession: (session) =>
        set((state) => ({
          sessions: [
            ...state.sessions,
            { ...session, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
          ],
        })),

      updateSession: (id, updates) =>
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),

      deleteSession: (id) =>
        set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),

      // ── Payment actions ───────────────────────────────────────────────────
      addPayment: (payment) =>
        set((state) => ({
          payments: [
            ...state.payments,
            { ...payment, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
          ],
        })),

      updatePayment: (id, updates) =>
        set((state) => ({
          payments: state.payments.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),

      deletePayment: (id) =>
        set((state) => ({
          payments: state.payments.filter((p) => p.id !== id),
          // A receipt is evidence, so it survives its payment being removed —
          // voided rather than deleted, leaving the number sequence intact.
          receipts: state.receipts.map((r) =>
            r.paymentId === id && !r.voided
              ? { ...r, voided: true, voidedAt: new Date().toISOString(), voidReason: 'Payment deleted' }
              : r,
          ),
        })),

      // ── Break actions ─────────────────────────────────────────────────────
      addBreak: (brk) =>
        set((state) => ({
          breaks: [
            ...state.breaks,
            { ...brk, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
          ],
        })),

      updateBreak: (id, updates) =>
        set((state) => ({
          breaks: state.breaks.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        })),

      deleteBreak: (id) =>
        set((state) => ({ breaks: state.breaks.filter((b) => b.id !== id) })),

      getBreaksByStudent: (studentId) =>
        get()
          .breaks.filter((b) => b.studentId === studentId)
          .sort((a, b) => b.startDate.localeCompare(a.startDate)),

      // ── Backup restore ────────────────────────────────────────────────────
      restoreBackup: (students, sessions, payments, breaks = [], invoices = [], receipts = []) =>
        set({
          students: migrateStudents(students, sessions),
          sessions,
          payments,
          breaks,
          invoices,
          receipts,
        }),

      // ── Settings ──────────────────────────────────────────────────────────
      updateSettings: (updates) =>
        set((state) => ({ settings: { ...state.settings, ...updates } })),

      // ── Invoice actions ───────────────────────────────────────────────────
      createDraftInvoice: (studentId, periodFrom, periodTo, adjustments = []) => {
        const draft: Invoice = {
          id: crypto.randomUUID(),
          studentId,
          status: 'draft',
          invoiceNumber: '',
          issuedDate: '',
          periodFrom,
          periodTo,
          periodLabel: '',
          coverage: [],
          charges: 0,
          adjustments,
          total: 0,
          previousBalance: 0,
          amountDueNow: 0,
          html: '',
          createdAt: new Date().toISOString(),
        }
        set((state) => ({ invoices: [...state.invoices, draft] }))
        return draft
      },

      updateDraftInvoice: (id, updates) =>
        set((state) => ({
          invoices: state.invoices.map((i) =>
            i.id === id && i.status === 'draft' ? { ...i, ...updates } : i,
          ),
        })),

      deleteDraftInvoice: (id) =>
        set((state) => ({
          invoices: state.invoices.filter((i) => !(i.id === id && i.status === 'draft')),
        })),

      finalizeDraftInvoice: (id, frozen) =>
        set((state) => ({
          invoices: state.invoices.map((i) =>
            i.id === id && i.status === 'draft' ? { ...i, ...frozen } : i,
          ),
        })),

      voidInvoice: (id) =>
        set((state) => ({
          invoices: state.invoices.map((i) =>
            i.id === id && i.status === 'issued'
              // Coverage stays on the record but stops counting, so the work
              // it claimed becomes billable again on the next invoice.
              ? { ...i, status: 'void' as const, voidedAt: new Date().toISOString() }
              : i,
          ),
        })),

      issueCreditNote: (record) => {
        const full: Invoice = {
          ...record, id: crypto.randomUUID(), createdAt: new Date().toISOString(),
        }
        set((state) => ({ invoices: [...state.invoices, full] }))
        return full
      },

      getInvoicesByStudent: (studentId) =>
        get()
          .invoices.filter((i) => i.studentId === studentId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      // ── Receipt actions ───────────────────────────────────────────────────
      addReceipt: (record) => {
        const full: Receipt = {
          ...record, id: crypto.randomUUID(), createdAt: new Date().toISOString(),
        }
        set((state) => ({ receipts: [...state.receipts, full] }))
        return full
      },

      voidReceipt: (id, reason) =>
        set((state) => ({
          receipts: state.receipts.map((r) =>
            r.id === id
              ? { ...r, voided: true, voidedAt: new Date().toISOString(), voidReason: reason }
              : r,
          ),
        })),

      getReceiptForPayment: (paymentId) =>
        get().receipts.find((r) => r.paymentId === paymentId && !r.voided),

      // ── Selectors ─────────────────────────────────────────────────────────
      getStudentById: (id) => get().students.find((s) => s.id === id),

      getSessionsByStudent: (studentId) =>
        get()
          .sessions.filter((s) => s.studentId === studentId)
          .sort((a, b) => b.date.localeCompare(a.date)),

      getPaymentsByStudent: (studentId) =>
        get()
          .payments.filter((p) => p.studentId === studentId)
          .sort((a, b) => b.date.localeCompare(a.date)),

      getTotalHours: (studentId) =>
        get()
          .sessions.filter((s) => s.studentId === studentId)
          .reduce((sum, s) => sum + s.hours, 0),

      /** Single computed source of truth — every billing figure comes from here. */
      getLedger: (studentId) => {
        const { students, sessions, payments, breaks, invoices } = get()
        const student = students.find((s) => s.id === studentId)
        if (!student) return EMPTY_LEDGER
        return getStudentLedger(student, sessions, payments, breaks, todayISO(), invoices)
      },

      getTotalDue:  (studentId) => get().getLedger(studentId).totalDue,
      getTotalPaid: (studentId) => get().getLedger(studentId).totalPaid,
      getBalance:   (studentId) => get().getLedger(studentId).balance,
      getCredit:    (studentId) => get().getLedger(studentId).credit,

      // ── Pending reminders ─────────────────────────────────────────────────
      addPendingReminder: (studentId) =>
        set((state) => ({
          pendingReminders: state.pendingReminders.includes(studentId)
            ? state.pendingReminders
            : [...state.pendingReminders, studentId],
        })),

      dismissPendingReminder: (studentId) =>
        set((state) => ({
          pendingReminders: state.pendingReminders.filter((id) => id !== studentId),
        })),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      partialize: (state) => ({
        students: state.students,
        sessions: state.sessions,
        payments: state.payments,
        breaks: state.breaks,
        settings: state.settings,
        invoices: state.invoices,
        receipts: state.receipts,
      }),
      /**
       * v1 → v2: adds billing anchors, rate history and the breaks list.
       * v2 → v3: adds the invoices list.
       * v3 → v4: invoices gain a draft/issued/void status; adds receipts.
       * v4 → v5: invoices gain coverage tracking; `total` becomes the
       *           invoice's own value rather than including arrears.
       * Backfills in place; no data is dropped or reset.
       */
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<PersistedState>
        const sessions = state.sessions ?? []
        const students = state.students ?? []
        return {
          students: version < 2 ? migrateStudents(students, sessions) : students,
          sessions,
          payments: state.payments ?? [],
          breaks: state.breaks ?? [],
          settings: state.settings ?? DEFAULT_SETTINGS,
          invoices: migrateInvoices(state.invoices ?? []),
          receipts: state.receipts ?? [],
        }
      },
      /** Belt and braces: heal any record that slipped through half-formed. */
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.breaks ??= []
        state.receipts ??= []
        state.invoices = migrateInvoices(state.invoices ?? [])
        state.students = state.students.map((s) => migrateStudent(s, state.sessions ?? []))
      },
    },
  ),
)

export default useAppStore
