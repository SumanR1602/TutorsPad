import { useState } from 'react'
import { X, CheckCircle } from 'lucide-react'
import useStore from '@store/useStore'
import Modal from './Modal'
import SessionForm from '../sessions/SessionForm'

export default function PendingSessionBanner() {
  const pendingReminders       = useStore((s) => s.pendingReminders)
  const students               = useStore((s) => s.students)
  const dismissPendingReminder = useStore((s) => s.dismissPendingReminder)

  const [logFor, setLogFor] = useState<string | null>(null)

  if (pendingReminders.length === 0) return null

  return (
    <>
      <div className="space-y-2">
        {pendingReminders.map((studentId) => {
          const student = students.find((s) => s.id === studentId)
          if (!student) return null

          return (
            <div
              key={studentId}
              className="flex items-center gap-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl px-4 py-3"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                style={{ backgroundColor: student.color ?? '#6366f1' }}
              >
                {student.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 truncate">
                  Time to teach {student.name}!
                </p>
                <p className="text-xs text-indigo-500">Log today's session?</p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setLogFor(studentId)}
                  className="flex items-center gap-1 bg-primary-600 text-white text-xs font-medium px-3 py-1.5 rounded-xl active:scale-95 transition-transform"
                >
                  <CheckCircle size={12} />
                  Log
                </button>
                <button
                  onClick={() => dismissPendingReminder(studentId)}
                  aria-label="Dismiss reminder"
                  className="p-1.5 rounded-xl text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 active:scale-95 transition-transform"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {logFor && (
        <Modal isOpen={true} onClose={() => setLogFor(null)} title="Log session">
        <SessionForm
            students={students}
            preselectedStudentId={logFor ?? undefined}
            onClose={() => {
              if (logFor) dismissPendingReminder(logFor)
              setLogFor(null)
              // SessionForm already shows a toast — no second toast here
            }}
          />
        </Modal>
      )}
    </>
  )
}
