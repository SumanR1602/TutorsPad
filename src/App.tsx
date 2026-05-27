import { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import BottomNav from '@components/shared/BottomNav'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import Sessions from './pages/Sessions'
import Billing from './pages/Billing'
import Settings from './pages/Settings'
import useStore from '@store/useStore'
import { startReminderScheduler, startPerStudentReminders } from '@utils/notifications'
import { ToastProvider } from '@hooks/useToast'
import OnboardingModal from '@components/shared/OnboardingModal'

export default function App() {
  const settings           = useStore((s) => s.settings)
  const students           = useStore((s) => s.students)
  const addPendingReminder = useStore((s) => s.addPendingReminder)

  const globalCleanupRef:     React.MutableRefObject<(() => void) | null> = useRef(null)
  const perStudentCleanupRef: React.MutableRefObject<(() => void) | null> = useRef(null)

  // Dark mode
  useEffect(() => {
    const html  = document.documentElement
    const theme = settings.theme ?? 'system'
    if (theme === 'dark') { html.classList.add('dark'); return }
    if (theme === 'light') { html.classList.remove('dark'); return }
    const mq    = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) html.classList.add('dark')
      else html.classList.remove('dark')
    }
    apply(mq)
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])

  // Global daily reminder
  useEffect(() => {
    globalCleanupRef.current?.()
    globalCleanupRef.current = null
    if (settings.reminderEnabled && settings.dailyReminderTime) {
      globalCleanupRef.current = startReminderScheduler(
        settings.dailyReminderTime,
        "Don't forget to log today's sessions! 📚",
      )
    }
    return () => { globalCleanupRef.current?.() }
  }, [settings.reminderEnabled, settings.dailyReminderTime])

  // Per-student class reminders
  useEffect(() => {
    perStudentCleanupRef.current?.()
    perStudentCleanupRef.current = startPerStudentReminders(students, addPendingReminder)
    return () => { perStudentCleanupRef.current?.() }
  }, [students, addPendingReminder])

  const isNewUser = !settings.onboardingCompleted

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="flex flex-col h-full max-w-md mx-auto bg-surface relative">
          <main className="flex-1 overflow-y-auto pb-20">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/students"  element={<Students />} />
              <Route path="/sessions"  element={<Sessions />} />
              <Route path="/billing"   element={<Billing />} />
              <Route path="/settings"  element={<Settings />} />
            </Routes>
          </main>
          <BottomNav />
        </div>
        {isNewUser && <OnboardingModal />}
      </BrowserRouter>
    </ToastProvider>
  )
}
