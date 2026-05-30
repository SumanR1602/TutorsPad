import { useState, useRef, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import { CITY_TO_TIMEZONE } from '@utils/timezone'

interface CityEntry {
  city: string
  label: string
  timezone: string
}

const CITY_LIST: CityEntry[] = Object.entries(CITY_TO_TIMEZONE).map(([city, timezone]) => ({
  city,
  label: city.replace(/\b\w/g, (c) => c.toUpperCase()),
  timezone,
}))

interface CityInputProps {
  value: string
  onChange: (city: string) => void
  onTimezoneDetected: (timezone: string) => void
}

export default function CityInput({ value, onChange, onTimezoneDetected }: CityInputProps) {
  const [open, setOpen] = useState(false)
  const wrapRef         = useRef<HTMLDivElement>(null)

  const suggestions = value.trim().length >= 1
    ? CITY_LIST.filter((c) => c.city.includes(value.trim().toLowerCase())).slice(0, 6)
    : []

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  function handleSelect(item: CityEntry) {
    onChange(item.label)
    onTimezoneDetected(item.timezone)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          className="input pr-8"
          placeholder="e.g. Hyderabad, London, Dubai"
          value={value}
          autoComplete="off"
          onChange={(e) => { onChange(e.target.value); setOpen(true) }}
          onFocus={() => { if (suggestions.length > 0) setOpen(true) }}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
        />
        <MapPin className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 pointer-events-none" />
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-xl overflow-hidden">
          {suggestions.map((suggestion) => (
            <li key={suggestion.city}>
              <button
                type="button"
                onMouseDown={() => handleSelect(suggestion)}
                className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-indigo-50 transition-colors"
              >
                <span className="text-sm text-gray-800">{suggestion.label}</span>
                <span className="text-[11px] text-indigo-400 font-medium shrink-0">{suggestion.timezone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
