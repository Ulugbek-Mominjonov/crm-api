import { describe, expect, it } from 'vitest'
import {
  applyStockDelta,
  DEFAULT_WAREHOUSE_ID,
  migrateProductStocks,
  stockAt,
  stocksOf,
  totalOf,
  warehouseName,
} from './warehouse'
import type { Product, Warehouse } from './types'

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Sement M400',
  sku: 'SEM-400',
  category: 'Sement',
  unit: 'qop',
  price: 60_000,
  wholesalePrice: 55_000,
  cost: 40_000,
  stock: 100,
  minStock: 10,
  ...over,
})

/**
 * Invariant: jami qoldiq taqsimot yig'indisiga teng.
 * `stock` yaxlitlangan yig'indi, shuning uchun taqqoslash ham yaxlitlanadi.
 */
const expectConsistent = (p: Product) => {
  expect(p.stock).toBeCloseTo(totalOf(p.stocks!), 3)
}

describe('stocksOf / stockAt', () => {
  it('eski mahsulotda butun qoldiq sukut omborda hisoblanadi', () => {
    const p = product({ stock: 100 })
    expect(stocksOf(p)).toEqual({ [DEFAULT_WAREHOUSE_ID]: 100 })
    expect(stockAt(p, DEFAULT_WAREHOUSE_ID)).toBe(100)
  })

  it('taqsimot bor bo‘lsa o‘sha ishlatiladi', () => {
    const p = product({ stock: 100, stocks: { a: 70, b: 30 } })
    expect(stockAt(p, 'a')).toBe(70)
    expect(stockAt(p, 'b')).toBe(30)
  })

  it('noma’lum ombor uchun 0', () => {
    expect(stockAt(product({ stocks: { a: 70 } }), 'yo‘q')).toBe(0)
  })
})

describe('applyStockDelta', () => {
  it('bitta ombor qoldig‘ini o‘zgartiradi va jamini yangilaydi', () => {
    const p = applyStockDelta(product({ stock: 100, stocks: { a: 70, b: 30 } }), 'a', -10)
    expect(stockAt(p, 'a')).toBe(60)
    expect(stockAt(p, 'b')).toBe(30)
    expect(p.stock).toBe(90)
    expectConsistent(p)
  })

  it('yangi omborga kirim qo‘shadi', () => {
    const p = applyStockDelta(product({ stock: 100, stocks: { a: 100 } }), 'c', 25)
    expect(stockAt(p, 'c')).toBe(25)
    expect(p.stock).toBe(125)
    expectConsistent(p)
  })

  it('eski (taqsimotsiz) mahsulotni ham to‘g‘ri boshqaradi', () => {
    const p = applyStockDelta(product({ stock: 100 }), DEFAULT_WAREHOUSE_ID, -40)
    expect(p.stock).toBe(60)
    expectConsistent(p)
  })

  it('ketma-ket amallar invariantni buzmaydi', () => {
    let p = product({ stock: 0, stocks: {} })
    p = applyStockDelta(p, 'a', 50)
    p = applyStockDelta(p, 'b', 30)
    p = applyStockDelta(p, 'a', -20)
    p = applyStockDelta(p, 'c', 5)
    expect(p.stock).toBe(65)
    expectConsistent(p)
  })

  it('kasrli miqdorda yaxlitlash xatosi to‘planmaydi', () => {
    let p = product({ stock: 0, stocks: {} })
    for (let i = 0; i < 10; i++) p = applyStockDelta(p, 'a', 0.1)
    expect(p.stock).toBe(1)
    expectConsistent(p)
  })
})

describe('migrateProductStocks', () => {
  it('eski qoldiqni sukut omborga o‘tkazadi', () => {
    const p = migrateProductStocks(product({ stock: 100 }))
    expect(p.stocks).toEqual({ [DEFAULT_WAREHOUSE_ID]: 100 })
    expectConsistent(p)
  })

  it('allaqachon taqsimlangan bo‘lsa tegmaydi', () => {
    const p = migrateProductStocks(product({ stock: 100, stocks: { a: 70, b: 30 } }))
    expect(p.stocks).toEqual({ a: 70, b: 30 })
  })

  // Ma'lumot buzilgan bo'lsa taqsimot haqiqat deb olinadi
  it('jami taqsimotga mos kelmasa jamini tuzatadi', () => {
    const p = migrateProductStocks(product({ stock: 999, stocks: { a: 70, b: 30 } }))
    expect(p.stock).toBe(100)
    expectConsistent(p)
  })
})

describe('warehouseName', () => {
  const list: Warehouse[] = [
    { id: 'a', name: 'Do‘kon zali', isDefault: true },
    { id: 'b', name: 'Sklad' },
  ]

  it('nomni topadi', () => {
    expect(warehouseName(list, 'b')).toBe('Sklad')
  })

  it('topilmasa chiziqcha', () => {
    expect(warehouseName(list, 'yo‘q')).toBe('—')
    expect(warehouseName(list, undefined)).toBe('—')
  })
})
