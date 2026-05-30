const HOURS   = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

function to12h(time24: string): { hour: number; minute: number; period: 'AM' | 'PM' } {
  if (!time24) return { hour: 12, minute: 0, period: 'AM' }
  const [h, m] = time24.split(':').map(Number)
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: m, period: h < 12 ? 'AM' : 'PM' }
}

function to24h(hour: number | string, minute: number | string, period: string): string {
  let h = Number(hour)
  if (period === 'AM' && h === 12) h = 0
  else if (period === 'PM' && h !== 12) h += 12
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const selectCls =
  'bg-transparent border-none outline-none text-center text-base font-semibold text-gray-800 py-2.5 cursor-pointer appearance-none [-webkit-appearance:none]'

interface TimePicker12hProps {
  value: string
  onChange: (value: string) => void
}

export default function TimePicker12h({ value, onChange }: TimePicker12hProps) {
  const { hour, minute, period } = to12h(value)

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden">
        <select
          value={hour}
          onChange={(e) => onChange(to24h(e.target.value, minute, period))}
          className={`${selectCls} flex-1`}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>{String(h).padStart(2, '0')}</option>
          ))}
        </select>

        <span className="text-gray-300 font-bold text-lg select-none pointer-events-none">:</span>

        <select
          value={minute}
          onChange={(e) => onChange(to24h(hour, e.target.value, period))}
          className={`${selectCls} flex-1`}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
          ))}
        </select>
      </div>

      <div className="flex rounded-xl border border-gray-200 overflow-hidden shrink-0">
        {(['AM', 'PM'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(to24h(hour, minute, p))}
            className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
              period === p
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-400 hover:bg-gray-50'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}
