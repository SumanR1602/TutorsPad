import { useState } from 'react'
import { Clock, Trash2, Pencil, History, CreditCard } from 'lucide-react'
import useStore from '@store/useStore'
import ConfirmModal from '../shared/ConfirmModal'
import { getCurrentTimeInTZ, format12h, convertISTtoTZ, getUTCOffsetLabel } from '@utils/timezone'
import { formatCurrency } from '@utils/billing'
import { useToast } from '@hooks/useToast'
import Modal from '../shared/Modal'
import StudentForm from './StudentForm'
import StudentSessionHistory from './StudentSessionHistory'
import StudentPaymentHistory from './StudentPaymentHistory'
import type { Student } from '@/types'

interface StudentCardProps {
  student: Student
}

export default function StudentCard({ student }: StudentCardProps) {
  const getTotalHours = useStore((s) => s.getTotalHours)
  const getBalance    = useStore((s) => s.getBalance)
  const deleteStudent = useStore((s) => s.deleteStudent)
  const { showToast } = useToast()

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showEdit,      setShowEdit]      = useState(false)
  const [showHistory,   setShowHistory]   = useState(false)
  const [showPayments,  setShowPayments]  = useState(false)
  // confirmDelete is the modal open state now

  const hours       = getTotalHours(student.id)
  const balance     = getBalance(student.id)
  const currentTime = getCurrentTimeInTZ(student.timezone)
  const tzAbbr      = getUTCOffsetLabel(student.timezone)

  function handleDelete() {
    deleteStudent(student.id)
    showToast(`${student.name} deleted successfully`, 'success')
  }

  return (
    <>
      <div className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
              style={{ backgroundColor: student.color ?? '#6366f1' }}
            >
              {student.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{student.name}</p>
              <p className="text-xs text-gray-400">{student.city}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEdit(true)}
              aria-label="Edit student"
              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-300 hover:text-indigo-500 transition-colors"
            >
              <Pencil size={15} />
            </button>

            <button
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete student"
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-300 hover:text-red-400 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">Local time ({tzAbbr})</p>
            <p className="text-xs font-semibold text-gray-800">{currentTime}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-0.5">Total hrs</p>
            <p className="text-xs font-semibold text-gray-800">{hours.toFixed(1)}h</p>
          </div>
          <div className={`rounded-xl p-2.5 text-center ${balance > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
            <p className="text-[10px] text-gray-400 mb-0.5">{balance > 0 ? 'Pending' : 'Paid up'}</p>
            <p className={`text-xs font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(balance, student.currency ?? 'INR')}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>
            Rate: {formatCurrency(student.ratePerHour, student.currency ?? 'INR')}
            {(student.rateType ?? 'hourly') === 'monthly' ? '/mo' : '/hr'}
          </span>
          {student.scheduledTime && (
            <div className="text-right">
              <span className="flex items-center gap-1 text-indigo-500">
                <Clock size={10} />
                {format12h(student.scheduledTime)} IST
              </span>
              <span className="text-[10px] text-gray-400">
                = {convertISTtoTZ(student.scheduledTime, student.timezone).time} local
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1 border-t border-gray-100">
          <button
            onClick={() => setShowHistory(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <History size={13} /> Sessions
          </button>
          <button
            onClick={() => setShowPayments(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <CreditCard size={13} /> Payments
          </button>
        </div>
      </div>

      <Modal isOpen={showEdit} onClose={() => setShowEdit(false)} title="Edit student">
        <StudentForm student={student} onClose={() => setShowEdit(false)} />
      </Modal>

      <Modal isOpen={showHistory} onClose={() => setShowHistory(false)} title={`${student.name} – Sessions`}>
        <StudentSessionHistory student={student} />
      </Modal>

      <Modal isOpen={showPayments} onClose={() => setShowPayments(false)} title={`${student.name} – Payments`}>
        <StudentPaymentHistory student={student} />
      </Modal>

      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        message={`Are you sure you want to delete ${student.name}? All their sessions and payments will also be removed.`}
      />
    </>
  )
}
