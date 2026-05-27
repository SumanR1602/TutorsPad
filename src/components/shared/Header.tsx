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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action && <div>{action}</div>}
      </div>
    </div>
  )
}
