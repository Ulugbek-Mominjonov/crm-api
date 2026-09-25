import { describe, expect, it } from 'vitest'
import { isLowStock, reorderQty } from './reorder'

describe('buyurtma taklifi (reorder)', () => {
  it('minimalning ikki barobarigacha to‘ldiradi', () => {
    // min 40, qoldiq 10 → 80 − 10 = 70
    expect(reorderQty({ stock: 10, minStock: 40 })).toBe(70)
  })

  it('kamida minimal miqdor taklif qilinadi', () => {
    // min 40, qoldiq 40 → max(40, 40) = 40
    expect(reorderQty({ stock: 40, minStock: 40 })).toBe(40)
  })

  it('manfiy qoldiqda ham to‘g‘ri (eski ma’lumot)', () => {
    expect(reorderQty({ stock: -5, minStock: 10 })).toBe(25)
  })

  it('kasrli miqdorlarda suzuvchi nuqta xatosi yo‘q', () => {
    expect(reorderQty({ stock: 0.1, minStock: 0.3 })).toBe(0.5)
  })

  it('kam qolgan: qoldiq minimaldan oshmasa', () => {
    expect(isLowStock({ stock: 40, minStock: 40 })).toBe(true)
    expect(isLowStock({ stock: 41, minStock: 40 })).toBe(false)
  })
})
