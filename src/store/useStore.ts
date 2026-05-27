import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Student, Session, Payment, Settings } from '@/types'
import { STORE_NAME, DEFAULT_RATE_TYPE } from '@constants'

interface StoreState {
  // ── State ────────────────────────────────────────────────────────────────
  students: Student[]
  sessions: Session[]
  payments: Payment[]
  pendingReminders: string[]  // studentIds — NOT persisted, in-memory only
  settings: Settings

  // ── Student actions ──────────────────────────────────────────────────────
  addStudent: (student: Omit<Student, 'id' | 'createdAt'>) => void
  updateStudent: (id: string, updates: Partial<Student>) => void
  deleteStudent: (id: string) => void

  // ── Session actions ──────────────────────────────────────────────────────
  addSession: (session: Omit<Session, 'id' | 'createdAt'>) => void
  updateSession: (id: string, updates: Partial<Session>) => void
  deleteSession: (id: string) => void

  // ── Payment actions ──────────────────────────────────────────────────────
  addPayment: (payment: Omit<Payment, 'id' | 'createdAt'>) => void
  updatePayment: (id: string, updates: Partial<Payment>) => void
  deletePayment: (id: string) => void

  // ── Settings ─────────────────────────────────────────────────────────────
  updateSettings: (updates: Partial<Settings>) => void

  // ── Selectors (computed) ─────────────────────────────────────────────────
  getStudentById: (id: string) => Student | undefined
  getSessionsByStudent: (studentId: string) => Session[]
  getPaymentsByStudent: (studentId: string) => Payment[]
  getTotalHours: (studentId: string) => number
  getTotalDue: (studentId: string) => number
  getTotalPaid: (studentId: string) => number
  getBalance: (studentId: string) => number

  // ── Pending reminder actions ─────────────────────────────────────────────
  addPendingReminder: (studentId: string) => void
  dismissPendingReminder: (studentId: string) => void

  // ── Backup restore ───────────────────────────────────────────────────────
  restoreBackup: (students: Student[], sessions: Session[], payments: Payment[]) => void
}

const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // ── Initial state ─────────────────────────────────────────────────────
      students: [],
      sessions: [],
      payments: [],
      pendingReminders: [], // intentionally not persisted — in-memory only, reset on page reload
      settings: {
        teacherName: 'Teacher',
        teacherTimezone: 'Asia/Kolkata',
        dailyReminderTime: '20:00',
        reminderEnabled: false,
        currency: 'INR',
        theme: 'system',
        onboardingCompleted: false,
      },

      // ── Student actions ───────────────────────────────────────────────────
      addStudent: (student) =>
        set((state) => ({
          students: [
            ...state.students,
            { ...student, id: crypto.randomUUID(), createdAt: new Date().toISOString() },
          ],
        })),

      updateStudent: (id, updates) =>
        set((state) => ({
          students: state.students.map((s) => (s.id === id ? { ...s, ...updates } : s)),
        })),

      deleteStudent: (id) =>
        set((state) => ({
          students: state.students.filter((s) => s.id !== id),
          sessions: state.sessions.filter((s) => s.studentId !== id),
          payments: state.payments.filter((p) => p.studentId !== id),
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
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
        })),

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
        })),

      // ── Backup restore ────────────────────────────────────────────────────
      restoreBackup: (students, sessions, payments) =>
        set({ students, sessions, payments }),

      // ── Settings ──────────────────────────────────────────────────────────
      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),

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

      getTotalDue: (studentId) => {
        const student = get().getStudentById(studentId)
        if (!student) return 0
        // Fix: use nullish coalescing to guard missing rateType
        const rateType = student.rateType ?? DEFAULT_RATE_TYPE
        if (rateType === 'monthly') {
          const studentSessions = get().sessions.filter((s) => s.studentId === studentId)
          const months = new Set(studentSessions.map((s) => s.date.slice(0, 7)))
          return months.size * student.ratePerHour
        }
        const hours = get().getTotalHours(studentId)
        return hours * student.ratePerHour
      },

      getTotalPaid: (studentId) =>
        get()
          .payments.filter((p) => p.studentId === studentId)
          .reduce((sum, p) => sum + p.amount, 0),

      getBalance: (studentId) => get().getTotalDue(studentId) - get().getTotalPaid(studentId),

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
      name: STORE_NAME,  // Fix: was 'classmate-pro-store', now 'tutordesk-store'
      partialize: (state) => ({
        students: state.students,
        sessions: state.sessions,
        payments: state.payments,
        settings: state.settings,
      }),
    },
  ),
)

export default useStore
