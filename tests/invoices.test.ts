import { describe, it, expect } from 'vitest'
import { getStudentLedger, earningsForMonthFromCycles, getBillingCycles } from '@utils/billingCore'
import {
  previewInvoiceTotals, finalizeInvoice, nextInvoiceNumber, previousBalanceFor,
  buildCreditNote, nextCreditNoteNumber, isCredited,
} from '@utils/billingInvoice'
import { issueReceipt, nextReceiptNumber } from '@utils/billingReceipt'
import { migrateInvoice } from '@utils/migrate'
import { student, session, payment } from './factories'
import type { Invoice, InvoiceAdjustment, Receipt, Session, Student } from '@/types'

const hourlyStudent = () =>
  student({ rateType: 'hourly', ratePerHour: 500, billingAnchorDate: '2026-09-01' })

/** Sessions on the 1st..nth of September, ₹500 each. */
const septSessions = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) =>
    session(`2026-09-${String(from + i).padStart(2, '0')}`),
  )

/** Issues an invoice and returns it as a stored record, ready to feed back in. */
function issue(
  s: Student,
  sessions: Session[],
  payments: ReturnType<typeof payment>[],
  adjustments: InvoiceAdjustment[],
  existing: Invoice[],
  id: string,
  issuedDate = '2026-09-20',
): Invoice {
  const frozen = finalizeInvoice(
    s, sessions, payments, 'T',
    { periodFrom: '', periodTo: '', adjustments },
    [],
    nextInvoiceNumber(existing, issuedDate),
    existing,
  )
  return {
    ...frozen,
    issuedDate,
    id,
    studentId: s.id,
    periodFrom: '',
    periodTo: '',
    adjustments,
    createdAt: `${issuedDate}T00:00:00.000Z`,
  }
}

describe('invoice numbering', () => {
  it('starts at 0001 and increments past the highest existing', () => {
    expect(nextInvoiceNumber([], '2026-09-20')).toBe('INV-2026-0001')
    const existing = [
      { invoiceNumber: 'INV-2026-0001' },
      { invoiceNumber: 'INV-2026-0007' },
    ] as Invoice[]
    expect(nextInvoiceNumber(existing, '2026-09-20')).toBe('INV-2026-0008')
  })

  it('restarts numbering in a new year', () => {
    const existing = [{ invoiceNumber: 'INV-2026-0009' }] as Invoice[]
    expect(nextInvoiceNumber(existing, '2027-01-04')).toBe('INV-2027-0001')
  })

  it('ignores drafts, which carry no number', () => {
    const existing = [{ invoiceNumber: 'INV-2026-0004' }, { invoiceNumber: '' }] as Invoice[]
    expect(nextInvoiceNumber(existing, '2026-09-20')).toBe('INV-2026-0005')
  })
})

describe('coverage — work is never billed twice', () => {
  it('a second invoice with no payment in between bills only new work', () => {
    const s = hourlyStudent()
    const all = septSessions(10)

    const first = issue(s, all.slice(0, 5), [], [], [], 'inv-1')
    expect(first.charges).toBe(2500)
    expect(first.coverage).toHaveLength(5)

    const second = previewInvoiceTotals(s, all, [], '', '', [], [], [first])
    expect(second.charges).toBe(2500)          // only sessions 6–10
    expect(second.previousBalance).toBe(2500)  // the first invoice, unpaid
    expect(second.amountDueNow).toBe(5000)
  })

  it('a partial payment does not change what gets itemised', () => {
    const s = hourlyStudent()
    const all = septSessions(10)
    const first = issue(s, all.slice(0, 5), [], [], [], 'inv-1')

    const paid = [payment('2026-09-05', 1000)]
    const second = previewInvoiceTotals(s, all, paid, '', '', [], [], [first])

    expect(second.charges).toBe(2500)          // sessions 6–10 only
    expect(second.previousBalance).toBe(1500)  // 2500 invoiced − 1000 paid
    expect(second.amountDueNow).toBe(4000)
  })

  it('billing twice over the same work charges nothing the second time', () => {
    const s = hourlyStudent()
    const all = septSessions(5)
    const first = issue(s, all, [], [], [], 'inv-1')
    const again = previewInvoiceTotals(s, all, [], '', '', [], [], [first])
    expect(again.charges).toBe(0)
  })

  it('a back-dated session inside an already-invoiced period still gets billed', () => {
    const s = hourlyStudent()
    const all = septSessions(10)
    const first = issue(s, all, [], [], [], 'inv-1')

    const late = session('2026-09-03')  // remembered after the fact
    const next = previewInvoiceTotals(s, [...all, late], [], '', '', [], [], [first])
    expect(next.charges).toBe(500)
  })

  it('voiding an invoice releases its work to be billed again', () => {
    const s = hourlyStudent()
    const all = septSessions(5)
    const voided: Invoice = { ...issue(s, all, [], [], [], 'inv-1'), status: 'void' }
    const again = previewInvoiceTotals(s, all, [], '', '', [], [], [voided])
    expect(again.charges).toBe(2500)
    expect(again.previousBalance).toBe(0)
  })

  it('a draft claims nothing', () => {
    const s = hourlyStudent()
    const all = septSessions(5)
    const draft: Invoice = {
      id: 'd', studentId: s.id, status: 'draft', invoiceNumber: '', issuedDate: '',
      periodFrom: '', periodTo: '', periodLabel: '', coverage: [], charges: 0,
      adjustments: [], total: 0, previousBalance: 0, amountDueNow: 0, html: '',
      createdAt: '2026-09-20T00:00:00.000Z',
    }
    expect(previewInvoiceTotals(s, all, [], '', '', [], [], [draft]).charges).toBe(2500)
  })
})

describe('settlements survive the next invoice', () => {
  const s = hourlyStudent()
  const first10 = septSessions(10)
  const discount: InvoiceAdjustment[] = [{ description: 'Agreed settlement', amount: -4050 }]

  it('the settling invoice totals the agreed figure, not the computed one', () => {
    const inv = issue(s, first10, [], discount, [], 'inv-1')
    expect(inv.charges).toBe(5000)
    expect(inv.total).toBe(950)
    expect(inv.amountDueNow).toBe(950)
  })

  it('the next invoice does not re-bill the waived amount', () => {
    const inv = issue(s, first10, [], discount, [], 'inv-1')
    const all = [...first10, ...septSessions(2, 11)]
    const paid = [payment('2026-09-20', 950)]

    const next = previewInvoiceTotals(s, all, paid, '', '', [], [], [inv])
    expect(next.charges).toBe(1000)
    expect(next.previousBalance).toBe(0)   // 950 invoiced − 950 paid
    expect(next.amountDueNow).toBe(1000)
  })

  it('a settlement plus a partial payment carries the right arrears', () => {
    const inv = issue(s, first10, [], discount, [], 'inv-1')
    const all = [...first10, ...septSessions(2, 11)]
    const paid = [payment('2026-09-20', 500)]

    const next = previewInvoiceTotals(s, all, paid, '', '', [], [], [inv])
    expect(next.previousBalance).toBe(450)   // 950 − 500
    expect(next.amountDueNow).toBe(1450)
  })

  it('invoice totals stay this-invoice-only so summing them cannot double count', () => {
    const inv1 = issue(s, first10, [], [], [], 'inv-1')
    const all = [...first10, ...septSessions(2, 11)]
    const inv2 = issue(s, all, [], [], [inv1], 'inv-2')

    expect(inv2.previousBalance).toBe(5000)
    expect(inv2.total).toBe(1000)            // not 6000
    expect(inv1.total + inv2.total).toBe(6000)
  })
})

describe('previousBalanceFor', () => {
  const s = hourlyStudent()

  it('is zero with no invoices and no payments', () => {
    expect(previousBalanceFor(s, [], [])).toBe(0)
  })

  it('goes negative when payments run ahead of invoices', () => {
    expect(previousBalanceFor(s, [payment('2026-09-01', 1000)], [])).toBe(-1000)
  })

  it('ignores voided invoices', () => {
    const voided: Invoice = { ...issue(s, septSessions(2), [], [], [], 'inv-1'), status: 'void' }
    expect(previousBalanceFor(s, [], [voided])).toBe(0)
  })
})

describe('ledger and dashboard consistency', () => {
  const s = hourlyStudent()
  const first10 = septSessions(10)
  const discount: InvoiceAdjustment[] = [{ description: 'Agreed settlement', amount: -4050 }]

  it('a draft never moves the balance', () => {
    const draft: Invoice = {
      id: 'd', studentId: s.id, status: 'draft', invoiceNumber: '', issuedDate: '',
      periodFrom: '', periodTo: '', periodLabel: '', coverage: [], charges: 0,
      adjustments: discount, total: 0, previousBalance: 0, amountDueNow: 0, html: '',
      createdAt: '2026-09-20T00:00:00.000Z',
    }
    expect(getStudentLedger(s, first10, [], [], '2026-09-30', [draft]).totalDue).toBe(5000)
  })

  it('an issued discount reaches the cycle, not just the grand total', () => {
    const inv = issue(s, first10, [], discount, [], 'inv-1')
    const ledger = getStudentLedger(s, first10, [], [], '2026-09-30', [inv])

    expect(ledger.totalDue).toBe(950)
    // The cycle row and the headline agree — this is what used to disagree.
    expect(ledger.cycles.reduce((sum, c) => sum + c.amount, 0)).toBe(950)
    expect(earningsForMonthFromCycles(ledger.cycles, '2026-09')).toBe(950)
  })

  it('cycle balances sum to the headline balance after a part payment', () => {
    const inv = issue(s, first10, [], discount, [], 'inv-1')
    const paid = [payment('2026-09-20', 500)]
    const ledger = getStudentLedger(s, first10, paid, [], '2026-09-30', [inv])

    expect(ledger.balance).toBe(450)
    expect(ledger.cycles.reduce((sum, c) => sum + c.balance, 0)).toBe(450)
  })

  it('settles to zero when the agreed figure is paid', () => {
    const inv = issue(s, first10, [], discount, [], 'inv-1')
    const ledger = getStudentLedger(s, first10, [payment('2026-09-20', 950)], [], '2026-09-30', [inv])
    expect(ledger.balance).toBe(0)
    expect(ledger.credit).toBe(0)
    expect(ledger.cycles.every((c) => c.balance === 0)).toBe(true)
  })

  it('overpaying leaves credit rather than a negative balance', () => {
    const inv = issue(s, first10, [], discount, [], 'inv-1')
    const ledger = getStudentLedger(s, first10, [payment('2026-09-20', 1000)], [], '2026-09-30', [inv])
    expect(ledger.balance).toBe(0)
    expect(ledger.credit).toBe(50)
  })

  it('a discount larger than the work it covers still balances exactly', () => {
    const big: InvoiceAdjustment[] = [{ description: 'Full waiver plus', amount: -8000 }]
    const inv = issue(s, first10, [], big, [], 'inv-1')
    const ledger = getStudentLedger(s, first10, [], [], '2026-09-30', [inv])
    expect(ledger.totalDue).toBe(-3000)
    expect(ledger.cycles.every((c) => c.amount >= 0)).toBe(true)
  })

  it('un-invoiced work still counts as owed', () => {
    const inv = issue(s, first10, [], discount, [], 'inv-1')
    const all = [...first10, ...septSessions(2, 11)]
    const ledger = getStudentLedger(s, all, [payment('2026-09-20', 950)], [], '2026-09-30', [inv])
    expect(ledger.balance).toBe(1000)
  })

  it('another student\u2019s invoice never touches this ledger', () => {
    const other: Invoice = { ...issue(s, first10, [], discount, [], 'inv-1'), studentId: 'nope' }
    expect(getStudentLedger(s, first10, [], [], '2026-09-30', [other]).totalDue).toBe(5000)
  })
})

describe('migration from before coverage existed', () => {
  it('claims everything up to the old period so it is not re-billed', () => {
    const legacy = {
      id: 'old', studentId: 'stu-1', invoiceNumber: 'INV-20260910-SUK',
      issuedDate: '2026-09-10', periodFrom: '', periodTo: '', periodLabel: 'x',
      total: 2500, html: '<html></html>', createdAt: '2026-09-10T00:00:00.000Z',
    } as unknown as Invoice

    const migrated = migrateInvoice(legacy)
    expect(migrated.status).toBe('issued')
    expect(migrated.coverage).toEqual([])
    expect(migrated.legacyCoveredThrough).toBe('2026-09-10')
    expect(migrated.charges).toBe(2500)
  })

  it('stops a legacy invoice\u2019s sessions appearing on the next one', () => {
    const s = hourlyStudent()
    const all = septSessions(10)
    const legacy = migrateInvoice({
      id: 'old', studentId: s.id, invoiceNumber: 'INV-20260905-SUK',
      issuedDate: '2026-09-05', periodFrom: '', periodTo: '', periodLabel: 'x',
      total: 2500, html: '', createdAt: '2026-09-05T00:00:00.000Z',
    } as unknown as Invoice)

    // Sessions on the 1st–5th are claimed; only the 6th–10th remain billable.
    expect(previewInvoiceTotals(s, all, [], '', '', [], [], [legacy]).charges).toBe(2500)
  })

  it('leaves an already-migrated invoice untouched', () => {
    const s = hourlyStudent()
    const inv = issue(s, septSessions(2), [], [], [], 'inv-1')
    expect(migrateInvoice(inv)).toBe(inv)
  })
})

describe('stable cycle keys', () => {
  it('keys a monthly cycle by its start date, not its position', () => {
    const s = student({ rateType: 'monthly', ratePerHour: 5000, billingAnchorDate: '2026-09-01' })
    const [first] = getBillingCycles(s, [], [], '2026-09-20')
    expect(first.key).toBe('cycle-2026-09-01')
  })

  it('a back-dated switch does not renumber an earlier cycle', () => {
    const before = student({ rateType: 'monthly', ratePerHour: 5000, billingAnchorDate: '2026-07-01' })
    const keyBefore = getBillingCycles(before, [], [], '2026-09-20')[0].key

    const after = student({
      rateType: 'monthly', ratePerHour: 5000, billingAnchorDate: '2026-07-01',
      rateHistory: [
        { effectiveFrom: '2026-07-01', ratePerHour: 5000, rateType: 'monthly' },
        { effectiveFrom: '2026-08-15', ratePerHour: 500, rateType: 'hourly' },
      ],
    })
    expect(getBillingCycles(after, [], [], '2026-09-20')[0].key).toBe(keyBefore)
  })
})

describe('credits — downward revisions after invoicing', () => {
  const monthly = () =>
    student({ rateType: 'monthly', ratePerHour: 5000, billingAnchorDate: '2026-09-01' })

  it('a student leaving mid-cycle credits back the unearned fee', () => {
    const s = monthly()
    const inv = issue(s, [], [], [], [], 'inv-1')
    expect(inv.charges).toBe(5000)

    // They leave on the 20th, so the cycle pro-rates below what was invoiced.
    const left = { ...s, endDate: '2026-09-20' }
    const next = previewInvoiceTotals(left, [], [], '', '', [], [], [inv])

    expect(next.charges).toBeCloseTo(-1666.67, 2)
    expect(next.previousBalance).toBe(5000)
    expect(next.amountDueNow).toBeCloseTo(3333.33, 2)
  })

  it('the credit brings documents back in line with the ledger', () => {
    const s = monthly()
    const inv = issue(s, [], [], [], [], 'inv-1')
    const left = { ...s, endDate: '2026-09-20' }

    const creditFrozen = finalizeInvoice(
      left, [], [], 'T', { periodFrom: '', periodTo: '', adjustments: [] }, [],
      'INV-2026-0002', [inv],
    )
    const creditInv: Invoice = {
      ...creditFrozen, id: 'inv-2', studentId: s.id, periodFrom: '', periodTo: '',
      adjustments: [], createdAt: '2026-09-20T00:00:00.000Z',
    }

    const ledger = getStudentLedger(left, [], [], [], '2026-09-20', [inv, creditInv])
    expect(previousBalanceFor(left, [], [inv, creditInv])).toBeCloseTo(ledger.totalDue, 2)
  })

  it('deleting an invoiced session credits it back', () => {
    const s = hourlyStudent()
    const all = septSessions(3)
    const inv = issue(s, all, [], [], [], 'inv-1')
    expect(inv.charges).toBe(1500)

    const remaining = all.slice(0, 2)   // the third is deleted
    const next = previewInvoiceTotals(s, remaining, [], '', '', [], [], [inv])
    expect(next.charges).toBe(-500)
  })

  it('a credit fires only once, not on every later invoice', () => {
    const s = hourlyStudent()
    const all = septSessions(3)
    const inv = issue(s, all, [], [], [], 'inv-1')
    const remaining = all.slice(0, 2)

    const creditFrozen = finalizeInvoice(
      s, remaining, [], 'T', { periodFrom: '', periodTo: '', adjustments: [] }, [],
      'INV-2026-0002', [inv],
    )
    const creditInv: Invoice = {
      ...creditFrozen, id: 'inv-2', studentId: s.id, periodFrom: '', periodTo: '',
      adjustments: [], createdAt: '2026-09-20T00:00:00.000Z',
    }
    expect(creditInv.charges).toBe(-500)

    const third = previewInvoiceTotals(s, remaining, [], '', '', [], [], [inv, creditInv])
    expect(third.charges).toBe(0)
  })
})

describe('credit notes', () => {
  const s = hourlyStudent()
  const all = septSessions(10)
  const discount: InvoiceAdjustment[] = [{ description: 'Agreed settlement', amount: -4050 }]

  it('numbers in its own CN sequence', () => {
    expect(nextCreditNoteNumber([], '2026-09-20')).toBe('CN-2026-0001')
    const existing = [{ invoiceNumber: 'CN-2026-0002' }] as Invoice[]
    expect(nextCreditNoteNumber(existing, '2026-09-20')).toBe('CN-2026-0003')
  })

  it('reverses the original total so the two cancel out', () => {
    const inv = issue(s, all, [], discount, [], 'inv-1')
    const note = buildCreditNote(s, inv, 'T', [], [inv], 'CN-2026-0001')

    expect(inv.total).toBe(950)
    expect(note.total).toBe(-950)
    expect(note.creditsInvoiceId).toBe(inv.id)
    expect(previousBalanceFor(s, [], [inv, { ...note, id: 'cn-1', createdAt: '' }])).toBe(0)
  })

  it('releases coverage so the work can be billed again', () => {
    const inv = issue(s, all, [], [], [], 'inv-1')
    const note: Invoice = {
      ...buildCreditNote(s, inv, 'T', [], [inv], 'CN-2026-0001'),
      id: 'cn-1', createdAt: '2026-09-20T00:00:00.000Z',
    }
    expect(previewInvoiceTotals(s, all, [], '', '', [], [], [inv, note]).charges).toBe(5000)
  })

  it('zeroes the ledger contribution of the invoice it reverses', () => {
    const inv = issue(s, all, [], discount, [], 'inv-1')
    const note: Invoice = {
      ...buildCreditNote(s, inv, 'T', [], [inv], 'CN-2026-0001'),
      id: 'cn-1', createdAt: '2026-09-20T00:00:00.000Z',
    }
    // Both adjustments net out, so the student owes the undiscounted amount.
    expect(getStudentLedger(s, all, [], [], '2026-09-30', [inv, note]).totalDue).toBe(5000)
  })

  it('marks the original as credited', () => {
    const inv = issue(s, all, [], [], [], 'inv-1')
    const note: Invoice = {
      ...buildCreditNote(s, inv, 'T', [], [inv], 'CN-2026-0001'),
      id: 'cn-1', createdAt: '2026-09-20T00:00:00.000Z',
    }
    expect(isCredited(inv, [inv, note])).toBe(true)
    expect(isCredited(inv, [inv])).toBe(false)
  })

  it('renders as a credit note, not an invoice', () => {
    const inv = issue(s, all, [], [], [], 'inv-1')
    const note = buildCreditNote(s, inv, 'T', [], [inv], 'CN-2026-0001')
    expect(note.html).toContain('Credit Note')
    expect(note.html).toContain('CN-2026-0001')
  })
})

describe('over-discounting', () => {
  it('does not invent credit the student never paid', () => {
    const s = hourlyStudent()
    const all = septSessions(10)
    const inv = issue(s, all, [], [{ description: 'Waiver', amount: -8000 }], [], 'inv-1')
    const ledger = getStudentLedger(s, all, [], [], '2026-09-30', [inv])

    expect(ledger.totalDue).toBe(-3000)
    expect(ledger.credit).toBe(0)
    expect(ledger.balance).toBe(0)
  })

  it('still credits money that was actually received', () => {
    const s = hourlyStudent()
    const all = septSessions(10)
    const inv = issue(s, all, [], [{ description: 'Waiver', amount: -8000 }], [], 'inv-1')
    const ledger = getStudentLedger(s, all, [payment('2026-09-20', 500)], [], '2026-09-30', [inv])
    expect(ledger.credit).toBe(500)
  })
})

describe('receipts', () => {
  const s = hourlyStudent()
  const sessions = septSessions(10)

  it('numbers sequentially and stays gapless past voided ones', () => {
    expect(nextReceiptNumber([], '2026-09-20')).toBe('REC-2026-0001')
    const existing = [
      { receiptNumber: 'REC-2026-0001', voided: true },
      { receiptNumber: 'REC-2026-0002' },
    ] as Receipt[]
    expect(nextReceiptNumber(existing, '2026-09-20')).toBe('REC-2026-0003')
  })

  it('refuses to mint a receipt for a payment that is not on file', () => {
    expect(issueReceipt(s, sessions, [], payment('2026-09-20', 500), 'T', [], 'REC-2026-0001'))
      .toBeNull()
  })

  it('freezes the amount and number at issue time', () => {
    const p = payment('2026-09-20', 5000)
    const rec = issueReceipt(s, sessions, [p], p, 'T', [], 'REC-2026-0001')!
    expect(rec.amount).toBe(5000)
    expect(rec.paymentId).toBe(p.id)
    expect(rec.html).toContain('REC-2026-0001')
  })

  it('reflects an issued settlement instead of showing phantom arrears', () => {
    const inv: Invoice = {
      ...issue(s, sessions, [], [{ description: 'Agreed settlement', amount: -4050 }], [], 'inv-1'),
      issuedDate: '2026-09-19',
    }
    const p = payment('2026-09-20', 950)
    expect(issueReceipt(s, sessions, [p], p, 'T', [], 'REC-2026-0001', [inv])!.html)
      .toContain('Settled in full')
    expect(issueReceipt(s, sessions, [p], p, 'T', [], 'REC-2026-0001', [])!.html)
      .not.toContain('Settled in full')
  })

  it('ignores an invoice issued after the payment', () => {
    const late: Invoice = {
      ...issue(s, sessions, [], [{ description: 'Later', amount: -4050 }], [], 'inv-1'),
      issuedDate: '2026-09-25',
    }
    const p = payment('2026-09-20', 950)
    expect(issueReceipt(s, sessions, [p], p, 'T', [], 'REC-2026-0001', [late])!.html)
      .not.toContain('Settled in full')
  })
})
