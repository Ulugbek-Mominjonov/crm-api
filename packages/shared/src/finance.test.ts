import { describe, expect, it } from 'vitest'
import { cogsOf, grossProfitOf, revenueOf, salesInRange } from './finance'
import type { Sale, SaleStatus, SaleType } from './types'

function makeSale(
  over: Partial<Sale> & { total: number; status: SaleStatus; type: SaleType },
): Sale {
  return {
    id: Math.random().toString(36).slice(2),
    number: 'CHEK-1001',
    items: [],
    priceTier: 'retail',
    subtotal: over.total,
    discount: 0,
    taxRate: 0,
    tax: 0,
    paid: { cash: 0, card: 0, transfer: 0 },
    debtPaid: 0,
    change: 0,
    date: '2026-08-05',
    ...over,
  }
}

describe('revenueOf', () => {
  // K1 — asosiy xato: Dashboard nasiya sotuvni tushumga qo‘shmasdi,
  // Hisobotlar esa qo‘shardi. Endi qoida bitta.
  it('K1: nasiya (pending) sotuv ham tushumga kiradi', () => {
    const sales = [
      makeSale({ total: 100_000, status: 'completed', type: 'sale' }),
      makeSale({ total: 50_000, status: 'pending', type: 'sale' }),
    ]
    expect(revenueOf(sales)).toBe(150_000)
  })

  it('bekor qilingan chek tushumga kirmaydi', () => {
    const sales = [
      makeSale({ total: 100_000, status: 'completed', type: 'sale' }),
      makeSale({ total: 70_000, status: 'cancelled', type: 'sale' }),
    ]
    expect(revenueOf(sales)).toBe(100_000)
  })

  it('qaytarish tushumdan chegiriladi', () => {
    const sales = [
      makeSale({ total: 100_000, status: 'completed', type: 'sale' }),
      makeSale({ total: 30_000, status: 'completed', type: 'return' }),
    ]
    expect(revenueOf(sales)).toBe(70_000)
  })

  it('bekor qilingan qaytarish chegirilmaydi', () => {
    const sales = [
      makeSale({ total: 100_000, status: 'completed', type: 'sale' }),
      makeSale({ total: 30_000, status: 'cancelled', type: 'return' }),
    ]
    expect(revenueOf(sales)).toBe(100_000)
  })
})

describe('cogsOf / grossProfitOf', () => {
  it('tannarx qatorlardan hisoblanadi, qaytarish chegiriladi', () => {
    const sales = [
      makeSale({
        total: 100_000,
        status: 'completed',
        type: 'sale',
        items: [
          {
            productId: 'p1',
            name: 'Sement',
            unit: 'qop',
            qty: 2,
            price: 50_000,
            cost: 30_000,
            discount: 0,
          },
        ],
      }),
      makeSale({
        total: 50_000,
        status: 'completed',
        type: 'return',
        items: [
          {
            productId: 'p1',
            name: 'Sement',
            unit: 'qop',
            qty: 1,
            price: 50_000,
            cost: 30_000,
            discount: 0,
          },
        ],
      }),
    ]
    expect(cogsOf(sales)).toBe(30_000)
    expect(grossProfitOf(sales)).toBe(50_000 - 30_000)
  })
})

describe('salesInRange', () => {
  it('oraliq chegaralari ikkala tomondan ham kiradi', () => {
    const sales = [
      makeSale({ total: 1, status: 'completed', type: 'sale', date: '2026-08-01' }),
      makeSale({ total: 1, status: 'completed', type: 'sale', date: '2026-08-05' }),
      makeSale({ total: 1, status: 'completed', type: 'sale', date: '2026-08-09' }),
    ]
    expect(salesInRange(sales, '2026-08-01', '2026-08-05')).toHaveLength(2)
  })
})
