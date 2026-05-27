import type { Session, Student } from '@/types'

interface FilterValues {
  studentId: string
  dateFrom: string
  dateTo: string
}

interface FilterPanelProps {
  students: Student[]
  sessions: Session[]
  filters: FilterValues
  onChange: (filters: FilterValues) => void
  onClear: () => void
}

export default function FilterPanel({ students, sessions, filters, onChange, onClear }: FilterPanelProps) {
  const hasFilters = filters.studentId !== 'all' || !!filters.dateFrom || !!filters.dateTo

  return (
    <div className="mx-4 mb-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3 shadow-sm">
      {students.length > 1 && (
        <div>
          <label className="label mb-1">Student</label>
          <select
            className="input text-sm"
            value={filters.studentId}
            onChange={(e) => onChange({ ...filters, studentId: e.target.value })}
          >
            <option value="all">All students</option>
            {students.map((s) => {
              const count = sessions.filter((x) => x.studentId === s.id).length
              return <option key={s.id} value={s.id}>{s.name} ({count})</option>
            })}
          </select>
        </div>
      )}

      <div>
        <label className="label mb-1">Date range</label>
        <div className="flex gap-2 items-center">
          <input
            type="date"
            className="input text-sm flex-1"
            value={filters.dateFrom}
            onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })}
          />
          <span className="text-gray-400 text-xs shrink-0">to</span>
          <input
            type="date"
            className="input text-sm flex-1"
            value={filters.dateTo}
            onChange={(e) => onChange({ ...filters, dateTo: e.target.value })}
          />
        </div>
      </div>

      {hasFilters && (
        <button
          onClick={onClear}
          className="w-full py-2 text-xs font-medium text-red-500 border border-red-200 dark:border-red-800 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
