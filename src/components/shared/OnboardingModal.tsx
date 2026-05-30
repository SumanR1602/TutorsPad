import { useState, useEffect, useRef } from 'react'
import useAppStore from '@store/useStore'
import Logo from './Logo'
import { validateName } from '@utils/validators'

export default function OnboardingModal() {
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  // Trap focus inside the modal and focus the name input on mount
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])',
    )
    focusable[0]?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab' || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])


  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    const err = validateName(trimmed)
    if (err) { setError(err); return }
    updateSettings({ teacherName: trimmed, onboardingCompleted: true })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div ref={panelRef} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-500 px-6 py-7 text-center">
          <div className="flex justify-center mb-3">
            <Logo size={56} />
          </div>
          <h1 id="onboarding-title" className="text-white text-xl font-bold tracking-tight">Welcome to TutorsPad</h1>
          <p className="text-indigo-100 text-sm mt-1">Everything a tutor needs, in one place.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          <div>
            <p className="text-gray-700 text-sm font-medium mb-3">
              What should we call you? This name appears throughout the app.
            </p>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder="e.g. Shri Ram"
              autoFocus
              maxLength={50}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
            />
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors"
          >
            Get Started
          </button>

          <p className="text-center text-xs text-gray-400">
            You can change this anytime in Settings.
          </p>
        </form>
      </div>
    </div>
  )
}
