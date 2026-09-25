import { describe, expect, it } from 'vitest'
import {
  checkCredit,
  clientDebt,
  evaluateCredit,
  dueDateFor,
  isOverdue,
  overdueDebt,
} from './finance'
import type { Client, Sale } from './types'

const TODAY = '2026-08-06'

const client = (over: Partial<Client> = {}): Client => ({
  id: 'c1',
  name: 'Ali Valiyev',
  type: 'individual',
  phone: '+998901234567',
  email: '',
  status: 'active',
  group: 'retail',
  bonusPoints: 0,
  source: 'test',
  createdAt: '2026-01-01',
  ...over,
})

const debtSale = (over: Partial<Sale> = {}): Sale => ({
  id: 's1',
  number: 'CHEK-1001',
  type: 'sale',
  customerId: 'c1',
  items: [],
  priceTier: 'retail',
  subtotal: 0,
  discount: 0,
  taxRate: 0,
  tax: 0,
  total: 100_000,
  paid: { cash: 0, card: 0, transfer: 0 },
  debtPaid: 0,
  change: 0,
  status: 'pending',
  date: '2026-07-01',
  ...over,
})

describe('clientDebt', () => {
  it('mijozning barcha cheklaridagi qarzni yig‘adi', () => {
    const sales = [
      debtSale({ id: 'a', total: 100_000 }),
      debtSale({ id: 'b', total: 50_000 }),
      debtSale({ id: 'c', total: 70_000, customerId: 'c2' }),
    ]
    expect(clientDebt(sales, 'c1')).toBe(150_000)
  })

  it('to‘langan qismni chegiradi', () => {
    const sales = [
      debtSale({ total: 100_000, paid: { cash: 40_000, card: 0, transfer: 0 } }),
    ]
    expect(clientDebt(sales, 'c1')).toBe(60_000)
  })
})

describe('isOverdue / overdueDebt', () => {
  it('muddat o‘tgan bo‘lsa true', () => {
    expect(isOverdue(debtSale({ dueDate: '2026-08-01' }), TODAY)).toBe(true)
  })

  it('muddat kelmagan bo‘lsa false', () => {
    expect(isOverdue(debtSale({ dueDate: '2026-09-01' }), TODAY)).toBe(false)
  })

  it('muddat belgilanmagan bo‘lsa o‘tgan hisoblanmaydi', () => {
    expect(isOverdue(debtSale(), TODAY)).toBe(false)
  })

  it('to‘langan chek muddati o‘tgan bo‘lsa ham hisoblanmaydi', () => {
    const paid = debtSale({
      dueDate: '2026-08-01',
      paid: { cash: 100_000, card: 0, transfer: 0 },
    })
    expect(isOverdue(paid, TODAY)).toBe(false)
  })

  it('muddati o‘tgan qarzni yig‘adi', () => {
    const sales = [
      debtSale({ id: 'a', total: 100_000, dueDate: '2026-08-01' }),
      debtSale({ id: 'b', total: 50_000, dueDate: '2026-09-01' }),
    ]
    expect(overdueDebt(sales, 'c1', TODAY)).toBe(100_000)
  })
})

describe('checkCredit', () => {
  it('limit yo‘q bo‘lsa ruxsat beradi', () => {
    expect(checkCredit(client(), [], 999_000, TODAY)).toEqual({ ok: true })
  })

  it('limitdan oshsa rad etadi', () => {
    const sales = [debtSale({ total: 800_000 })]
    const r = checkCredit(client({ creditLimit: 1_000_000 }), sales, 300_000, TODAY)
    expect(r).toMatchObject({ ok: false, reason: 'limit', current: 800_000 })
  })

  it('limit ichida bo‘lsa ruxsat beradi', () => {
    const sales = [debtSale({ total: 800_000 })]
    const r = checkCredit(client({ creditLimit: 1_000_000 }), sales, 200_000, TODAY)
    expect(r.ok).toBe(true)
  })

  // Muddati o'tgan qarz limitdan ham muhimroq to'siq
  it('muddati o‘tgan qarz bo‘lsa limit bo‘lmasa ham rad etadi', () => {
    const sales = [debtSale({ total: 10_000, dueDate: '2026-08-01' })]
    const r = checkCredit(client(), sales, 5_000, TODAY)
    expect(r).toMatchObject({ ok: false, reason: 'overdue', overdue: 10_000 })
  })

  it('naqd sotuvda (extra=0) tekshirilmaydi', () => {
    const sales = [debtSale({ total: 10_000, dueDate: '2026-08-01' })]
    expect(checkCredit(client(), sales, 0, TODAY).ok).toBe(true)
  })

  it('mijoz tanlanmagan bo‘lsa tekshirilmaydi', () => {
    expect(checkCredit(undefined, [], 100_000, TODAY).ok).toBe(true)
  })
})

describe('dueDateFor', () => {
  it('mijoz muddatiga qarab sana hisoblaydi', () => {
    expect(dueDateFor(client({ paymentTermDays: 14 }), '2026-08-06')).toBe(
      '2026-08-20',
    )
  })

  it('muddat sozlanmagan bo‘lsa undefined', () => {
    expect(dueDateFor(client(), '2026-08-06')).toBeUndefined()
    expect(dueDateFor(client({ paymentTermDays: 0 }), '2026-08-06')).toBeUndefined()
  })

  it('oy chegarasidan to‘g‘ri o‘tadi', () => {
    expect(dueDateFor(client({ paymentTermDays: 30 }), '2026-08-15')).toBe(
      '2026-09-14',
    )
  })
})

describe('evaluateCredit (agregatlardan — server)', () => {
  it('muddati o‘tgan qarz limitsiz ham to‘sadi', () => {
    expect(evaluateCredit({ limit: 0, current: 10_000, overdue: 10_000 }, 5_000)).toEqual({
      ok: false,
      reason: 'overdue',
      overdue: 10_000,
    })
  })

  it('limitdan oshsa — rad, teng bo‘lsa — ruxsat', () => {
    expect(evaluateCredit({ limit: 1_000_000, current: 800_000, overdue: 0 }, 300_000)).toMatchObject({
      ok: false,
      reason: 'limit',
    })
    expect(evaluateCredit({ limit: 1_000_000, current: 800_000, overdue: 0 }, 200_000)).toEqual({ ok: true })
  })

  it('yangi qarz yo‘q — tekshirilmaydi', () => {
    expect(evaluateCredit({ limit: 1, current: 999, overdue: 999 }, 0)).toEqual({ ok: true })
  })
})
