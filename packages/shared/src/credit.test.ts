import { describe, expect, it } from 'vitest'
import {
  checkCredit,
  clientDebt,
  dueDateFor,
  isOverdue,
  overdueDebt,
  poOutstanding,
  poReceivedValue,
  totalPayables,
} from './finance'
import type { Client, PurchaseOrder, Sale } from './types'

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

describe('ta’minotchiga qarz', () => {
  const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
    id: 'po1',
    number: 'BUY-1001',
    supplierId: 'sup1',
    items: [
      { productId: 'p1', name: 'Sement', qty: 10, cost: 40_000 },
      { productId: 'p2', name: 'G‘isht', qty: 100, cost: 1_000 },
    ],
    total: 500_000,
    paid: 0,
    status: 'ordered',
    date: '2026-08-01',
    ...over,
  })

  it('buyurtma holatida qarz yo‘q (tovar hali kelmagan)', () => {
    expect(poOutstanding(po())).toBe(0)
  })

  it('to‘liq qabulda butun summa qarz', () => {
    expect(poOutstanding(po({ status: 'received' }))).toBe(500_000)
  })

  it('to‘langan qism chegiriladi', () => {
    expect(poOutstanding(po({ status: 'received', paid: 200_000 }))).toBe(300_000)
  })

  // Qisman qabul: faqat KELGAN tovar uchun qarz bo'lishi kerak
  it('qisman qabulda faqat kelgan tovar qiymati qarz bo‘ladi', () => {
    const partial = po({
      status: 'partial',
      items: [
        { productId: 'p1', name: 'Sement', qty: 10, receivedQty: 7, cost: 40_000 },
        { productId: 'p2', name: 'G‘isht', qty: 100, receivedQty: 0, cost: 1_000 },
      ],
    })
    expect(poReceivedValue(partial)).toBe(280_000)
    expect(poOutstanding(partial)).toBe(280_000)
  })

  it('bekor qilingan buyurtmada qarz yo‘q', () => {
    expect(poOutstanding(po({ status: 'cancelled', paid: 0 }))).toBe(0)
  })

  it('umumiy kreditorlik yig‘iladi', () => {
    const orders = [
      po({ id: 'a', status: 'received', total: 100_000 }),
      po({ id: 'b', status: 'received', total: 50_000, paid: 20_000 }),
      po({ id: 'c', status: 'ordered', total: 900_000 }),
    ]
    expect(totalPayables(orders)).toBe(130_000)
  })
})
