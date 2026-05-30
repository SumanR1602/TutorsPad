import Header from '@components/shared/Header'
import TimezoneConverter from '@components/timezone/TimezoneConverter'
import PendingSessionBanner from '@components/shared/PendingSessionBanner'
import StatsChart from '@components/shared/StatsChart'
import useAppStore from '@store/useStore'
import { formatCurrency } from '@utils/billing'
import { calcStreak } from '@utils/stats'
import { DEFAULT_CURRENCY } from '@constants'

export default function Dashboard() {
  const students   = useAppStore((s) => s.students)
  const sessions   = useAppStore((s) => s.sessions)
  const getBalance = useAppStore((s) => s.getBalance)
  const settings   = useAppStore((s) => s.settings)

  const totalBalance  = students.reduce((sum, s) => sum + getBalance(s.id), 0)
  const today         = new Date().toISOString().slice(0, 10)
  const todaySessions = sessions.filter((s) => s.date === today)
  const streak        = calcStreak(sessions)

  const currentMonth  = new Date().toISOString().slice(0, 7)
  const monthSessions = sessions.filter((s) => s.date.startsWith(currentMonth))
  const monthHours    = parseFloat(monthSessions.reduce((sum, s) => sum + s.hours, 0).toFixed(1))
  const monthEarnings = students.reduce((total, student) => {
    const ss = monthSessions.filter((s) => s.studentId === student.id)
    if (!ss.length) return total
    if ((student.rateType ?? 'hourly') === 'monthly') return total + student.ratePerHour
    return total + ss.reduce((acc, x) => acc + x.hours, 0) * student.ratePerHour
  }, 0)
  const monthLabel = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div>
      <Header
        title={`Hello, ${settings.teacherName} 👋`}
        subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
      />

      <div className="px-4 space-y-4 pb-6">
        <PendingSessionBanner />

        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center py-3">
            <p className="text-2xl font-bold text-indigo-600">{students.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Students</p>
          </div>
          <div className="card text-center py-3">
            <p className="text-2xl font-bold text-gray-800">{todaySessions.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">Today</p>
          </div>
          <div className={`card text-center py-3 ${totalBalance > 0 ? 'border-red-100' : ''}`}>
            <p className={`text-lg font-bold ${totalBalance > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {formatCurrency(totalBalance, DEFAULT_CURRENCY)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Pending</p>
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
          <div className="card flex items-center justify-between py-3">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">{monthLabel}</p>
              <p className="text-sm font-semibold text-gray-800">{monthHours}h taught</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-0.5">Earned</p>
              <p className="text-base font-bold text-indigo-600">{formatCurrency(monthEarnings)}</p>
            </div>
          </div>
        )}

        <TimezoneConverter />
        <StatsChart />
      </div>
    </div>
  )
}
