import { describe, expect, it } from 'vitest'
import { bonusEarned } from './loyalty'

const on = { loyaltyEnabled: true, loyaltyRate: 1 }

describe('bonus ball (loyalty)', () => {
  it('chek summasining foizi', () => {
    expect(bonusEarned(500_000, on)).toBe(5_000)
  })

  it('pastga yaxlitlanadi — kasr ball berilmaydi', () => {
    expect(bonusEarned(188_600, on)).toBe(1_886)
    expect(bonusEarned(199, on)).toBe(1)
  })

  it('dastur o‘chiq yoki foiz 0 — ball yo‘q', () => {
    expect(bonusEarned(500_000, { loyaltyEnabled: false, loyaltyRate: 1 })).toBe(0)
    expect(bonusEarned(500_000, { loyaltyEnabled: true, loyaltyRate: 0 })).toBe(0)
  })

  it('summa 0 — ball yo‘q', () => {
    expect(bonusEarned(0, on)).toBe(0)
  })
})
