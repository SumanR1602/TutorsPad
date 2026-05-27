/**
 * stats.ts
 * Pure statistical utility functions for session/billing data.
 */

import type { Session } from '@/types'

/**
 * Calculate the current teaching streak in days.
 * A streak counts consecutive days (ending today or yesterday) with at least one session.
 */
export function calcStreak(sessions: Session[]): number {
  if (!sessions.length) return 0
  const uniqueDates = [...new Set(sessions.map((s) => s.date))].sort((a, b) => b.localeCompare(a))
  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) return 0
  let streak = 1
  for (let i = 1; i < uniqueDates.length; i++) {
    const prev = new Date(uniqueDates[i - 1]).getTime()
    const curr = new Date(uniqueDates[i]).getTime()
    if ((prev - curr) / 86_400_000 === 1) streak++
    else break
  }
  return streak
}
