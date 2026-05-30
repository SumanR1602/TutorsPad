/** "YYYY-MM" → "May 2026" */
export function formatMonthLong(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(+y, +m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}

/** "YYYY-MM" → "May '26" */
export function formatMonthShort(ym: string): string {
  const [y, m] = ym.split('-')
  return new Date(parseInt(y), parseInt(m) - 1).toLocaleString('en-IN', { month: 'short', year: '2-digit' })
}
