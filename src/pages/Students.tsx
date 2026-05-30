import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import Header from '@components/shared/Header'
import Modal from '@components/shared/Modal'
import StudentCard from '@components/students/StudentCard'
import StudentForm from '@components/students/StudentForm'
import useAppStore from '@store/useStore'

export default function Students() {
  const students = useAppStore((s) => s.students)
  const [showAdd, setShowAdd] = useState(false)
  const [query,   setQuery]   = useState('')

  const filtered = query.trim()
    ? students.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          (s.city ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : students

  return (
    <div>
      <Header
        title="Students"
        subtitle={`${students.length} enrolled`}
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

      <div className="px-4 space-y-3 pb-6">
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
        ) : (
          filtered.map((s) => <StudentCard key={s.id} student={s} />)
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Add student">
        <StudentForm onClose={() => setShowAdd(false)} />
      </Modal>
    </div>
  )
}
