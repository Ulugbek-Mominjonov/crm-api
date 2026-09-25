import { describe, expect, it } from 'vitest'
import { poOutstanding, poReceivedValue, totalPayables } from './finance'
import type { PurchaseOrder } from './types'

/** Kreditorlik (I18): qarz faqat KELGAN tovar uchun */
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

  it('kasrli miqdorda qator summasi so‘mgacha yaxlitlanadi', () => {
    const partial = po({
      status: 'partial',
      items: [{ productId: 'p1', name: 'Kabel', qty: 10, receivedQty: 1.333, cost: 1_200 }],
    })
    // 1.333 × 1 200 = 1 599.6
    expect(poReceivedValue(partial)).toBe(1_600)
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

