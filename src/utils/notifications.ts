/**
 * notifications.ts
 * Web Notifications API wrapper for daily class reminders
 */

import type { Student } from '@/types'

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

export async function showNotification(title: string, body: string): Promise<void> {
  if (Notification.permission !== 'granted') return
  // Prefer SW notification (works when app is backgrounded on Android PWA)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      await reg.showNotification(title, { body, icon: '/icon-192.png' })
      return
    } catch {
      // fall through to page-level notification
    }
  }
  new Notification(title, { body, icon: '/icon-192.png' })
}

/**
 * Starts a daily reminder scheduler.
 * Returns a cleanup function to cancel the scheduler.
 */
export function startReminderScheduler(timeStr: string, message: string): () => void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return () => {}

  const [targetH, targetM] = timeStr.split(':').map(Number)

  function checkAndFire() {
    const now = new Date()
    const todayKey = now.toDateString()
    const storageKey = `daily-reminder-${todayKey}`
    if (sessionStorage.getItem(storageKey)) return

    const totalNow    = now.getHours() * 60 + now.getMinutes()
    const totalTarget = targetH * 60 + targetM
    // fire only at or after target, within a 2-minute catch-up window
    if (totalNow >= totalTarget && totalNow <= totalTarget + 2) {
      sessionStorage.setItem(storageKey, '1')
      void showNotification('TutorDesk – Daily Reminder', message)
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') checkAndFire()
  }

  const interval = setInterval(checkAndFire, 15000)
  document.addEventListener('visibilitychange', onVisible)
  checkAndFire()

  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/**
 * Starts per-student reminder schedulers.
 * The in-app banner (onReminder) fires regardless of notification permission.
 * Browser notification only fires if permission is granted.
 */
export function startPerStudentReminders(
  students: Student[],
  onReminder: (studentId: string) => void,
): () => void {
  const scheduled = students.filter((s) => s.scheduledTime)
  if (scheduled.length === 0) return () => {}

  function checkAndFire() {
    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()
    const todayKey = now.toDateString()

    scheduled.forEach((student) => {
      if (!student.scheduledTime) return
      const [targetH, targetM] = student.scheduledTime.split(':').map(Number)
      const storageKey = `reminder-${student.id}-${todayKey}`

      const totalNow    = h * 60 + m
      const totalTarget = targetH * 60 + targetM
      // fire only at or after target, within a 2-minute catch-up window
      if (totalNow >= totalTarget && totalNow <= totalTarget + 2 && !sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, '1')
        onReminder(student.id)
        if (Notification.permission === 'granted') {
          void showNotification(
            `TutorDesk – Class Reminder`,
            `Time for ${student.name}'s class!`,
          )
        }
      }
    })
  }

  function onVisible() {
    if (document.visibilityState === 'visible') checkAndFire()
  }

  const interval = setInterval(checkAndFire, 15000)
  document.addEventListener('visibilitychange', onVisible)
  checkAndFire()

  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
