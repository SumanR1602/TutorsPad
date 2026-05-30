// ─── Core domain types ────────────────────────────────────────────────────────

export interface Student {
  id: string
  name: string
  city: string
  timezone: string        // IANA e.g. "America/Detroit"
  ratePerHour: number
  rateType: 'hourly' | 'monthly'
  currency: string        // "INR" | "USD" | "GBP" etc.
  color: string           // hex e.g. "#6366f1"
  scheduledTime?: string  // "HH:mm" in IST, optional
  label?: string           // optional batch/subject tag e.g. "Math", "Batch A"
  createdAt: string       // ISO date string
}

export interface Session {
  id: string
  studentId: string
  date: string            // "YYYY-MM-DD"
  hours: number
  type: 'regular' | 'extra'
  note: string
  createdAt: string
}

export interface Payment {
  id: string
  studentId: string
  date: string            // "YYYY-MM-DD"
  amount: number
  note: string
  createdAt: string
}

export interface Settings {
  teacherName: string
  teacherTimezone: string
  dailyReminderTime: string  // "HH:mm"
  reminderEnabled: boolean
  currency: string
  onboardingCompleted: boolean
}

// ─── Billing types ────────────────────────────────────────────────────────────

export interface MonthlyBreakdown {
  key: string    // "YYYY-MM"
  month: string  // "May 2026"
  hours: number
  amount: number
  paid: number
  balance: number
}

// ─── Timezone types ───────────────────────────────────────────────────────────

export interface TimezoneOption {
  label: string
  value: string
}

export interface ConvertedTime {
  time: string  // "10:30 AM"
  date: string  // "Mon, 23 May"
}

// ─── Toast types ─────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

export interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}
