import { describe, expect, it } from 'vitest'
import { averageCost } from './cost'

describe('averageCost (I11, K8)', () => {
  it('o‘rtacha tortilgan tannarxni hisoblaydi', () => {
    // 100 dona × 10 000 + 10 dona × 20 000 = 1 200 000 / 110 ≈ 10 909
    expect(averageCost(100, 10_000, 10, 20_000)).toBe(10_909)
  })

  it('qoldiq 0 bo‘lsa kirim narxi to‘g‘ridan-to‘g‘ri olinadi', () => {
    expect(averageCost(0, 10_000, 10, 20_000)).toBe(20_000)
  })

  it('manfiy qoldiq (eski buzuq ma’lumot) ham kirim narxini oladi', () => {
    expect(averageCost(-5, 10_000, 10, 20_000)).toBe(20_000)
  })

  it('kirim narxi berilmasa eski tannarx saqlanadi', () => {
    expect(averageCost(100, 10_000, 10, 0)).toBe(10_000)
  })

  it('kirim miqdori musbat bo‘lmasa tannarx o‘zgarmaydi', () => {
    expect(averageCost(100, 10_000, 0, 20_000)).toBe(10_000)
  })

  it('kasrli miqdorlar (kg, m²) bilan ham to‘g‘ri', () => {
    // 12.5 kg × 8 000 + 7.5 kg × 12 000 = 190 000 / 20 = 9 500
    expect(averageCost(12.5, 8_000, 7.5, 12_000)).toBe(9_500)
  })

  it('omborlar bo‘yicha ajratilmaydi — ikki kirim umumiy o‘rtachani beradi', () => {
    const afterFirst = averageCost(0, 0, 10, 10_000)
    expect(averageCost(10, afterFirst, 10, 20_000)).toBe(15_000)
  })
})
