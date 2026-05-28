import { useState, useEffect, useRef } from 'react'
import { Bell, Save, X, Moon, Upload, Download } from 'lucide-react'
import Header from '@components/shared/Header'
import Modal from '@components/shared/Modal'
import Logo from '@components/shared/Logo'
import useStore from '@store/useStore'
import { requestNotificationPermission, showNotification } from '@utils/notifications'
import { exportAllData } from '@utils/storage'
import { exportBackupJSON, parseBackupJSON } from '@utils/storage'
import type { ParsedBackup } from '@utils/storage'
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
  const settings        = useStore((s) => s.settings)
  const updateSettings  = useStore((s) => s.updateSettings)
  const restoreBackup   = useStore((s) => s.restoreBackup)
  const { showToast }   = useToast()

  const [local, setLocal] = useState<Settings>({ ...settings })
  const [notifStatus, setNotifStatus] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  )
  const [pendingImport, setPendingImport] = useState<ParsedBackup | null>(null)
  const [importError,   setImportError]   = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''   // reset so same file can be picked again
    if (!file) return
    setImportError(null)
    try {
      const parsed = await parseBackupJSON(file)
      setPendingImport(parsed)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Invalid backup file.')
    }
  }

  function handleConfirmImport() {
    if (!pendingImport) return
    restoreBackup(pendingImport.students, pendingImport.sessions, pendingImport.payments)
    setPendingImport(null)
    showToast('Data restored from backup', 'success')
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
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Your profile</h2>
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
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Appearance</h2>
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
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Daily reminder</h2>
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
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Data</h2>

          {/* Export Excel */}
          <button
            onClick={() => exportAllData().catch(console.error)}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Download size={15} /> Export report (Excel)
          </button>

          {/* Export JSON backup */}
          <button
            onClick={exportBackupJSON}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Download size={15} /> Export backup (JSON)
          </button>

          {/* Import JSON backup */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Upload size={15} /> Import backup (JSON)
          </button>

          {importError && (
            <p className="text-xs text-red-500">{importError}</p>
          )}

          <p className="text-xs text-gray-400">
            Export backup regularly and store it in Google Drive or WhatsApp Saved Messages.
            Import it to fully restore your data on any device.
          </p>
        </div>

        {/* Install PWA hint */}
        <div className="card bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800">
          <h2 className="text-sm font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Install on home screen</h2>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            Android: tap ⋮ → "Add to Home Screen"<br />
            iPhone: tap Share → "Add to Home Screen"
          </p>
        </div>

        <div className="flex flex-col items-center gap-1 pb-2">
          <Logo size={24} withName />
          <p className="text-xs text-gray-300">v1.0.0 · Built for teachers</p>
        </div>
      </div>

      {/* Import confirmation modal */}
      <Modal
        isOpen={!!pendingImport}
        onClose={() => setPendingImport(null)}
        title="Restore from backup?"
      >
        {pendingImport && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              This will <strong>replace all current data</strong> with the backup. This cannot be undone.
            </div>
            <div className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
              <p>Found in backup:</p>
              <ul className="ml-4 list-disc text-gray-600 dark:text-gray-300 space-y-0.5">
                <li>{pendingImport.students.length} student{pendingImport.students.length !== 1 ? 's' : ''}</li>
                <li>{pendingImport.sessions.length} session{pendingImport.sessions.length !== 1 ? 's' : ''}</li>
                <li>{pendingImport.payments.length} payment{pendingImport.payments.length !== 1 ? 's' : ''}</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPendingImport(null)} className="btn-secondary flex-1">
                Cancel
              </button>
              <button onClick={handleConfirmImport} className="btn-primary flex-1">
                Restore
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
