import type { ReactNode } from 'react'
import Logo from './Logo'

interface HeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
  hideLogo?: boolean
}

export default function Header({ title, subtitle, action, hideLogo = false }: HeaderProps) {
  return (
    <div className="px-4 pt-10 pb-4">
      {!hideLogo && (
        <div className="mb-2">
          <Logo size={26} withName />
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 truncate">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
