import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, BookOpen, CreditCard, Settings, type LucideIcon } from 'lucide-react'

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
}

const navItems: NavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/students',  icon: Users,           label: 'Students' },
  { to: '/sessions',  icon: BookOpen,         label: 'Sessions' },
  { to: '/billing',   icon: CreditCard,       label: 'Billing' },
  { to: '/settings',  icon: Settings,         label: 'Settings' },
]

export default function BottomNav() {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-100 flex items-center justify-around px-2 py-2 z-50 dark:bg-gray-800 dark:border-gray-700"
    >
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          aria-label={label}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl transition-colors ${
              isActive ? 'text-primary-600' : 'text-gray-400'
            }`
          }
        >
          <Icon size={22} strokeWidth={1.8} />
          <span className="text-[10px] font-medium">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
