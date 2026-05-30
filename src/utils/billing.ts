/**
 * billing.ts
 * Core billing calculations and formatting helpers.
 *
 * Excel exports → billingExcel.ts
 * PDF invoice   → billingInvoice.ts
 * PDF receipt   → billingReceipt.ts
 */

import type { Session, Payment, MonthlyBreakdown } from '@/types'
import { DEFAULT_CURRENCY } from '@constants'

/**
 * Format a YYYY-MM-DD string to DD/MM/YYYY.
 * e.g. "2026-05-24" → "24/05/2026"
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Build a monthly breakdown for a student.
 * Returns array of { key, month, hours, amount, paid, balance }
 */
export function getMonthlyBreakdown(
  sessions: Session[],
  payments: Payment[],
  ratePerHour: number,
  rateType: 'hourly' | 'monthly' = 'hourly',
): MonthlyBreakdown[] {
  const monthMap: Record<string, { hours: number; paid: number }> = {}

  sessions.forEach(({ date, hours }) => {
    const key = date.slice(0, 7)
    if (!monthMap[key]) monthMap[key] = { hours: 0, paid: 0 }
    monthMap[key].hours += hours
  })

  payments.forEach(({ date, amount }) => {
    const key = date.slice(0, 7)
    if (!monthMap[key]) monthMap[key] = { hours: 0, paid: 0 }
    monthMap[key].paid += amount
  })

  return Object.entries(monthMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, { hours, paid }]) => {
      const [year, month] = key.split('-')
      const monthLabel = new Date(+year, +month - 1, 1).toLocaleString('en-IN', {
        month: 'long',
        year: 'numeric',
      })
      const amount =
        rateType === 'monthly'
          ? parseFloat(ratePerHour.toFixed(2))
          : parseFloat((hours * ratePerHour).toFixed(2))
      return {
        key,
        month: monthLabel,
        hours: parseFloat(hours.toFixed(1)),
        amount,
        paid: parseFloat(paid.toFixed(2)),
        balance: parseFloat((amount - paid).toFixed(2)),
      }
    })
}

/**
 * Format a number as currency.
 * e.g. formatCurrency(5000, 'INR') → "₹5,000"
 */
export function formatCurrency(amount: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Generate PDF via the /api/pdf serverless function (Puppeteer on Vercel).
 * Always opens a preview tab. The "Save as PDF" button inside the tab handles the download.
 */
export function openPDFWindow(html: string, _filename: string): void {
  const w = window.open('', '_blank')
  if (w) {
    w.document.write(html)
    w.document.close()
  }
}
