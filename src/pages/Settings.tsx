import { useState, useEffect } from 'react'
import { Bell, Save, X, Moon } from 'lucide-react'
import Header from '@components/shared/Header'
import Logo from '@components/shared/Logo'
import useStore from '@store/useStore'
import { requestNotificationPermission, showNotification } from '@utils/notifications'
import { exportAllData } from '@utils/storage'
import TimePicker12h from '@components/shared/TimePicker12h'
import { useToast } from '@hooks/useToast'
import type { Settings } from '@/types'

type Theme = 'system' | 'light' | 'dark'
const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light',  label: 'Light'  },
  { value: 'dark',   label: 'Dark'   },
]

export default function Settings() {
  const settings       = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const { showToast }  = useToast()

  const [local, setLocal] = useState<Settings>({ ...settings })
  const [notifStatus, setNotifStatus] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  )

  // Refresh permission status when user returns to the tab (e.g. after changing browser settings)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && typeof Notification !== 'undefined') {
        setNotifStatus(Notification.permission)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const isDirty =
    local.teacherName       !== settings.teacherName ||
    local.dailyReminderTime !== settings.dailyReminderTime

  function handleSave() {
    updateSettings({
      teacherName:       local.teacherName,
      dailyReminderTime: local.dailyReminderTime,
    })
    showToast('Settings saved', 'success')
  }

  function handleCancel() {
    setLocal({ ...settings })
    showToast('Changes discarded', 'info')
  }

  async function handleEnableNotifications() {
    const granted = await requestNotificationPermission()
    setNotifStatus(granted ? 'granted' : 'denied')
    updateSettings({ reminderEnabled: granted })
  }

  return (
    <div>
      <Header title="Settings" />

      <div className="px-4 space-y-4 pb-6">
        {/* Profile */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Your profile</h2>
          <div>
            <label className="label">Your name</label>
            <input
              className="input"
              value={local.teacherName}
              onChange={(e) => setLocal({ ...local, teacherName: e.target.value })}
              placeholder="Your name"
            />
          </div>
        </div>

        {/* Appearance */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Moon size={16} className="text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-700">Appearance</h2>
          </div>
          <div className="flex gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value}
                onClick={() => updateSettings({ theme: t.value })}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  (settings.theme ?? 'system') === t.value
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-indigo-600" />
            <h2 className="text-sm font-semibold text-gray-700">Daily reminder</h2>
          </div>
          <div>
            <label className="label">Reminder time (IST)</label>
            <TimePicker12h
              value={local.dailyReminderTime ?? ''}
              onChange={(v) => setLocal({ ...local, dailyReminderTime: v })}
            />
          </div>
          <div>
            {notifStatus === 'granted' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  Browser notifications enabled
                </div>
                <button
                  onClick={() => showNotification('TutorDesk – Test', 'Reminder is working! 📚')}
                  className="btn-secondary w-full text-sm"
                >
                  Send test notification
                </button>
              </div>
            ) : notifStatus === 'denied' ? (
              <p className="text-xs text-red-500">
                Notifications blocked. Enable them in your browser / phone settings.
              </p>
            ) : (
              <button onClick={handleEnableNotifications} className="btn-primary w-full">
                Enable browser notifications
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400">
            In-app banners always work without permission. Browser notifications require the above.
          </p>
        </div>

        {isDirty && (
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="btn-secondary flex-1 flex items-center justify-center gap-1.5"
            >
              <X size={15} /> Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn-primary flex-1 flex items-center justify-center gap-1.5"
            >
              <Save size={15} /> Save changes
            </button>
          </div>
        )}

        {/* Data */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Data</h2>
          <button
            onClick={() => exportAllData().catch(console.error)}
            className="btn-secondary w-full"
          >
            Export backup (Excel)
          </button>
          <p className="text-xs text-gray-400">
            Downloads an Excel file with all your students, sessions, payments and settings. Export regularly as a backup.
          </p>
        </div>

        {/* Install PWA hint */}
        <div className="card bg-indigo-50 border-indigo-100">
          <h2 className="text-sm font-semibold text-indigo-700 mb-1">Install on home screen</h2>
          <p className="text-xs text-indigo-600">
            Android: tap ⋮ → "Add to Home Screen"<br />
            iPhone: tap Share → "Add to Home Screen"
          </p>
        </div>

        <div className="flex flex-col items-center gap-1 pb-2">
          <Logo size={24} withName />
          <p className="text-xs text-gray-300">v1.0.0 · Built for teachers</p>
        </div>
      </div>
    </div>
  )
}
