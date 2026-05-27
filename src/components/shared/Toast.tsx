import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import type { Toast, ToastType } from '@/types'

const ICONS: Record<ToastType, JSX.Element> = {
  success: <CheckCircle size={16} className="text-green-400 shrink-0" />,
  error:   <XCircle    size={16} className="text-red-400 shrink-0" />,
  info:    <Info       size={16} className="text-blue-400 shrink-0" />,
}

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 left-0 right-0 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="w-full max-w-sm bg-gray-900 text-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-xl pointer-events-auto toast-enter"
        >
          {ICONS[toast.type] ?? ICONS.info}
          <span className="text-sm flex-1 leading-snug">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            className="p-1 rounded-full hover:bg-white/10 active:scale-95 transition-transform shrink-0"
          >
            <X size={13} className="text-gray-400" />
          </button>
        </div>
      ))}
    </div>
  )
}
