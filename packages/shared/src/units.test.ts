import { describe, expect, it } from 'vitest'
import {
  fromBaseQty,
  hasAltUnit,
  priceForUnit,
  toBaseQty,
  unitOptions,
} from './units'
import type { Product } from './types'

/** Sement: ombor kilogrammda, sotuv qopda ham mumkin (1 qop = 50 kg) */
const cement = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Sement M400',
  sku: 'SEM-400',
  category: 'Sement',
  unit: 'kg',
  price: 1_200,
  wholesalePrice: 1_100,
  cost: 900,
  stock: 500,
  minStock: 50,
  altUnit: 'qop',
  altFactor: 50,
  ...over,
})

describe('hasAltUnit', () => {
  it('to‘liq sozlangan qo‘shimcha birlikni taniydi', () => {
    expect(hasAltUnit(cement())).toBe(true)
  })

  it('koeffitsiyent yo‘q yoki 0 bo‘lsa ishlatilmaydi', () => {
    expect(hasAltUnit(cement({ altFactor: undefined }))).toBe(false)
    expect(hasAltUnit(cement({ altFactor: 0 }))).toBe(false)
  })

  it('qo‘shimcha birlik asosiysi bilan bir xil bo‘lsa ishlatilmaydi', () => {
    expect(hasAltUnit(cement({ altUnit: 'kg' }))).toBe(false)
  })
})

describe('unitOptions', () => {
  it('asosiy va qo‘shimcha birlikni qaytaradi', () => {
    expect(unitOptions(cement())).toEqual([
      { unit: 'kg', factor: 1, base: true },
      { unit: 'qop', factor: 50, base: false },
    ])
  })

  it('qo‘shimcha birlik yo‘q bo‘lsa faqat asosiysi', () => {
    expect(unitOptions(cement({ altUnit: undefined }))).toHaveLength(1)
  })
})

describe('toBaseQty / fromBaseQty', () => {
  it('qopdan kilogrammga o‘tkazadi', () => {
    expect(toBaseQty(cement(), 3, 'qop')).toBe(150)
  })

  it('kilogrammdan qopga o‘tkazadi', () => {
    expect(fromBaseQty(cement(), 150, 'qop')).toBe(3)
  })

  it('asosiy birlikda o‘zgarishsiz qoladi', () => {
    expect(toBaseQty(cement(), 7, 'kg')).toBe(7)
    expect(fromBaseQty(cement(), 7, 'kg')).toBe(7)
  })

  it('oldinga-orqaga o‘tkazish asl qiymatni beradi', () => {
    const p = cement()
    expect(fromBaseQty(p, toBaseQty(p, 2.5, 'qop'), 'qop')).toBe(2.5)
  })

  it('noma’lum birlik berilsa miqdor o‘zgarmaydi', () => {
    expect(toBaseQty(cement(), 4, 'rulon')).toBe(4)
  })
})

describe('priceForUnit', () => {
  it('qop narxi kilogramm narxidan koeffitsiyent barobar', () => {
    expect(priceForUnit(cement(), 1_200, 'qop')).toBe(60_000)
  })

  it('asosiy birlikda narx o‘zgarmaydi', () => {
    expect(priceForUnit(cement(), 1_200, 'kg')).toBe(1_200)
  })

  it('tannarx ham xuddi shunday o‘giriladi', () => {
    const p = cement()
    expect(priceForUnit(p, p.cost, 'qop')).toBe(45_000)
  })
})
