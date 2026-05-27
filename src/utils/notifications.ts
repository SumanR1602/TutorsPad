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

export function showNotification(title: string, body: string): Notification | undefined {
  if (Notification.permission === 'granted') {
    return new Notification(title, { body, icon: '/icon-192.png' })
  }
}

/**
 * Starts a daily reminder scheduler.
 * Returns a cleanup function to cancel the scheduler.
 */
export function startReminderScheduler(timeStr: string, message: string): () => void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return () => {}

  const [targetH, targetM] = timeStr.split(':').map(Number)
  let lastFiredDate: string | null = null

  function checkAndFire() {
    const now = new Date()
    const todayKey = now.toDateString()
    const h = now.getHours()
    const m = now.getMinutes()

    if (h === targetH && m === targetM && lastFiredDate !== todayKey) {
      lastFiredDate = todayKey
      showNotification('TutorDesk – Daily Reminder', message)
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') checkAndFire()
  }

  const interval = setInterval(checkAndFire, 30000)
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

      if (h === targetH && m === targetM && !sessionStorage.getItem(storageKey)) {
        sessionStorage.setItem(storageKey, '1')
        onReminder(student.id)
        if (Notification.permission === 'granted') {
          showNotification(
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

  const interval = setInterval(checkAndFire, 30000)
  document.addEventListener('visibilitychange', onVisible)
  checkAndFire()

  return () => {
    clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
