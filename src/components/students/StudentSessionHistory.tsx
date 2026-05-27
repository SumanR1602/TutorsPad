import useStore from '@store/useStore'
import { formatCurrency, formatDate } from '@utils/billing'
import { Trash2, BookOpen } from 'lucide-react'
import { useToast } from '@hooks/useToast'
import type { Student } from '@/types'

interface StudentSessionHistoryProps {
  student: Student
}

export default function StudentSessionHistory({ student }: StudentSessionHistoryProps) {
  const getSessionsByStudent = useStore((s) => s.getSessionsByStudent)
  const deleteSession        = useStore((s) => s.deleteSession)
  const getTotalHours        = useStore((s) => s.getTotalHours)
  const getTotalDue          = useStore((s) => s.getTotalDue)
  const { showToast }        = useToast()

  const sessions    = getSessionsByStudent(student.id)
  const totalHours  = getTotalHours(student.id)
  const totalEarned = getTotalDue(student.id)

  function handleDelete(sessionId: string, sessionDate: string) {
    deleteSession(sessionId)
    showToast(`Session on ${sessionDate} removed`, 'info')
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <BookOpen size={36} className="mb-3 opacity-40" />
        <p className="text-sm">No sessions logged yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-indigo-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-indigo-700">{totalHours.toFixed(1)}h</p>
          <p className="text-[10px] text-indigo-400 mt-0.5">Total hours</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-emerald-700">
            {formatCurrency(totalEarned, student.currency ?? 'INR')}
          </p>
          <p className="text-[10px] text-emerald-400 mt-0.5">Total earned</p>
        </div>
      </div>

      <div className="space-y-2 max-h-[55vh] overflow-y-auto -mx-1 px-1">
        {sessions.map((session) => (
          <div key={session.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">{session.hours}h</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  session.type === 'extra'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-indigo-100 text-indigo-700'
                }`}>
                  {session.type}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{formatDate(session.date)}</p>
              {session.note && <p className="text-xs text-gray-500 truncate mt-0.5">{session.note}</p>}
            </div>
            <button
              onClick={() => handleDelete(session.id, session.date)}
              aria-label="Delete session"
              className="p-1.5 ml-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-400 transition-colors shrink-0"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
