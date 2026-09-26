import { useMemo } from 'react'
import Header from '@components/shared/Header'
import TimezoneConverter from '@components/timezone/TimezoneConverter'
import PendingSessionBanner from '@components/shared/PendingSessionBanner'
import StatsChart from '@components/shared/StatsChart'
import useAppStore from '@store/useStore'
import { formatCurrency } from '@utils/billing'
import { getStudentLedger, earningsForMonthFromCycles } from '@utils/billingCore'
import { calcStreak } from '@utils/stats'
import { todayISO, currentYM, formatMonthLong, formatDuration } from '@utils/date'
import { DEFAULT_CURRENCY } from '@constants'

export default function Dashboard() {
  const students = useAppStore((s) => s.students)
  const sessions = useAppStore((s) => s.sessions)
  const payments = useAppStore((s) => s.payments)
  const breaks   = useAppStore((s) => s.breaks)
  const invoices = useAppStore((s) => s.invoices)
  const settings = useAppStore((s) => s.settings)

  const today         = todayISO()
  const todaySessions = sessions.filter((s) => s.date === today)
  const streak        = calcStreak(sessions)
  const currentMonth  = currentYM()

  const monthSessions = sessions.filter((s) => s.date.startsWith(currentMonth))
  const monthHours    = parseFloat(monthSessions.reduce((sum, s) => sum + s.hours, 0).toFixed(1))

  // Build each student's cycles once, then read both figures off them —
  // rebuilding per student per metric was the expensive part.
  const { totalBalance, monthEarnings } = useMemo(() => {
    let balance = 0
    let earnings = 0
    for (const s of students) {
      const ledger = getStudentLedger(s, sessions, payments, breaks, today, invoices)
      balance += ledger.balance
      // A cycle is recognised in the month it starts — a 15 Jul → 14 Aug cycle
      // is July revenue, rather than being split across two months.
      earnings += earningsForMonthFromCycles(ledger.cycles, currentMonth)
    }
    return { totalBalance: balance, monthEarnings: earnings }
  }, [students, sessions, payments, breaks, invoices, today, currentMonth])

  const monthLabel = formatMonthLong(currentMonth)

  // Mixing currencies into one total would be a lie; only label it when every
  // student shares one.
  const currencies    = new Set(students.map((s) => s.currency ?? DEFAULT_CURRENCY))
  const oneCurrency   = currencies.size <= 1
  const totalCurrency = oneCurrency ? [...currencies][0] ?? DEFAULT_CURRENCY : DEFAULT_CURRENCY

  // The pending card is only a third of a phone screen wide, so step the type
  // down as the amount grows rather than letting it spill out of the card.
  const balanceText = formatCurrency(totalBalance, totalCurrency)
  const balanceSize =
    balanceText.length > 12 ? 'text-[11px]'
    : balanceText.length > 9 ? 'text-xs'
    : balanceText.length > 6 ? 'text-sm'
    : 'text-lg'

  return (
    <div>
      <Header
        title={`Hello, ${settings.teacherName} 👋`}
        subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      />

      <div className="px-4 space-y-4 pb-6">
        <PendingSessionBanner />

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="card text-center py-3 px-2 min-w-0">
            <div className="h-7 sm:h-8 flex items-center justify-center">
              <p className="text-lg font-bold text-indigo-600">{students.length}</p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Students</p>
          </div>
          <div className="card text-center py-3 px-2 min-w-0">
            <div className="h-7 sm:h-8 flex items-center justify-center">
              <p className="text-lg font-bold text-gray-800">{todaySessions.length}</p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Today</p>
          </div>
          <div className={`card text-center py-3 px-2 min-w-0 ${totalBalance > 0 ? 'border-red-100' : ''}`}>
            <div className="h-7 sm:h-8 flex items-center justify-center">
              <p
                title={balanceText}
                className={`${balanceSize} font-bold tabular-nums leading-tight max-w-full inline-block truncate ${totalBalance > 0 ? 'text-red-500' : 'text-green-500'}`}
              >
                {balanceText}
              </p>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              Pending{!oneCurrency && <span className="text-gray-300"> (mixed)</span>}
            </p>
          </div>
        </div>

        {streak > 0 && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-base">🔥</span>
            <span className="text-sm font-semibold text-gray-800">{streak}-day streak</span>
            <span className="text-xs text-gray-400">Keep it up!</span>
          </div>
        )}

        {monthHours > 0 && (
          <div className="card flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-400 mb-0.5 truncate">{monthLabel}</p>
              <p className="text-sm font-semibold text-gray-800 truncate">{formatDuration(monthHours)} taught</p>
            </div>
            <div className="text-right min-w-0">
              <p className="text-xs text-gray-400 mb-0.5">Billed</p>
              <p className="text-base font-bold text-indigo-600 tabular-nums truncate">
                {formatCurrency(monthEarnings, totalCurrency)}
              </p>
            </div>
          </div>
        )}

        <TimezoneConverter />
        <StatsChart />
      </div>
    </div>
  )
}
