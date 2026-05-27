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

/** Return today's date as "YYYY-MM-DD". */
export function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10)
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
 * Open a new browser tab, write an HTML document to it, and auto-trigger
 * PDF download via html2pdf.js (served locally from /html2pdf.bundle.min.js).
 * Falls back to window.print() if the script hasn't loaded within 5 s.
 */
export function openPDFWindow(html: string, filename: string): void {
  const pdfOpts = JSON.stringify({
    margin: [6, 6, 6, 6],
    filename: filename + '.pdf',
    image: { type: 'jpeg', quality: 0.97 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  })

  const autoHtml = html.replace(
    '</body>',
    `<script src="/html2pdf.bundle.min.js"><\/script>
<script>
(function(){
  var attempts = 0;
  var max = 50; // 5 s at 100 ms intervals
  function tryPDF(){
    if (typeof html2pdf !== 'undefined'){
      html2pdf().set(${pdfOpts}).from(document.querySelector('.page')).save();
    } else if (++attempts < max){
      setTimeout(tryPDF, 100);
    } else {
      window.print();
    }
  }
  window.addEventListener('load', tryPDF);
})();
<\/script></body>`,
  )

  const w = window.open('', '_blank')
  if (w) {
    w.document.write(autoHtml)
    w.document.close()
  }
}
