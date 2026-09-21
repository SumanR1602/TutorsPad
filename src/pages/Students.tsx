import { useState, useMemo } from 'react'
import { Plus, Search, ChevronDown, ChevronRight, UserX } from 'lucide-react'
import Header from '@components/shared/Header'
import Modal from '@components/shared/Modal'
import StudentCard from '@components/students/StudentCard'
import StudentForm from '@components/students/StudentForm'
import useAppStore from '@store/useStore'
import { hasLeft } from '@utils/billingCore'
import { todayISO } from '@utils/date'

export default function Students() {
  const students = useAppStore((s) => s.students)
  const [showAdd, setShowAdd] = useState(false)
  const [showLeft, setShowLeft] = useState(false)
  const [query,   setQuery]   = useState('')

  const today = todayISO()

  const filtered = query.trim()
    ? students.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          (s.city ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : students

  // Students who've left sit in their own section so the main list stays
  // focused on who's actively being taught — they're still one tap away.
  const activeStudents = useMemo(() => filtered.filter((s) => !hasLeft(s, today)), [filtered, today])
  const leftStudents   = useMemo(() => filtered.filter((s) => hasLeft(s, today)), [filtered, today])
  const leftCount      = useMemo(() => students.filter((s) => hasLeft(s, today)).length, [students, today])

  return (
    <div>
      <Header
        title="Students"
        subtitle={
          leftCount > 0
            ? `${students.length - leftCount} active · ${leftCount} left`
            : `${students.length} enrolled`
        }
        action={
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={16} /> Add
          </button>
        }
      />

      {students.length > 0 && (
        <div className="px-4 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              className="input pl-8"
              placeholder="Search by name or city…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="px-4 space-y-3 pb-3">
        {students.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">👨‍🎓</p>
            <p className="text-sm">No students yet</p>
            <p className="text-xs mt-1">Tap Add to get started</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">No students match "{query}"</p>
          </div>
        ) : activeStudents.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <p className="text-sm">No active students{query ? ' match your search' : ''}.</p>
          </div>
        ) : (
          activeStudents.map((s) => <StudentCard key={s.id} student={s} />)
        )}
      </div>

      {leftStudents.length > 0 && (
        <div className="px-4 pb-6">
          <button
            onClick={() => setShowLeft((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <span className="flex items-center gap-2">
              <UserX size={14} /> Left ({leftStudents.length})
            </span>
            {showLeft ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {showLeft && (
            <div className="space-y-3 mt-3">
              {leftStudents.map((s) => <StudentCard key={s.id} student={s} />)}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add student">
        <StudentForm onClose={() => setShowAdd(false)} />
      </Modal>
    </div>
  )
}
