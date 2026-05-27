import { Trash2 } from 'lucide-react'
import Modal from './Modal'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm delete',
  message,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <p className="text-sm text-gray-600 mb-6">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Trash2 size={14} />
          Delete
        </button>
      </div>
    </Modal>
  )
}
