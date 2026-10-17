import { describe, expect, it } from 'vitest'
import {
  accrualPeriod, earnedSign, monthPeriod, payrollTotals, previousMonth, proratedSalary, salesBonus, workedDays,
} from './payroll'

describe('davr', () => {
  it('o‘tgan oy: yanvarda — o‘tgan yil dekabri; oy oxiri va kunlar soni (kabisa fevral ham)', () => {
    expect(previousMonth('2026-01-05')).toBe('2025-12')
    expect(previousMonth('2026-10-01')).toBe('2026-09')
    expect(accrualPeriod('2026-10-01')).toEqual({ key: '2026-09', start: '2026-09-01', end: '2026-09-30', days: 30 })
    expect(monthPeriod('2028-02')).toMatchObject({ end: '2028-02-29', days: 29 })
  })
})

describe('proratedSalary', () => {
  const sep = monthPeriod('2026-09')

  it('to‘liq oy — maoshning o‘zi; oy ichida ishga kirgan — kunlarga mutanosib', () => {
    expect(workedDays('2025-01-10', sep)).toBe(30)
    expect(workedDays('2026-09-01', sep)).toBe(30)
    expect(workedDays('2026-09-16', sep)).toBe(15)
    expect(workedDays('2026-09-30', sep)).toBe(1)
    expect(proratedSalary(3_000_000, '2026-09-16', sep)).toBe(1_500_000)
    expect(proratedSalary(3_000_000, '2026-01-01', sep)).toBe(3_000_000)
    // 3 000 000 × 7 / 30 = 700 000
    expect(proratedSalary(3_000_000, '2026-09-24', sep)).toBe(700_000)
  })

  it('davrdan keyin ishga kirgan — 0 kun, maosh yo‘q', () => {
    expect(workedDays('2026-10-01', sep)).toBe(0)
    expect(proratedSalary(3_000_000, '2026-10-01', sep)).toBe(0)
  })
})

describe('salesBonus', () => {
  it('asos × foiz, so‘mgacha; kasr foiz; manfiy yoki nol asos — 0', () => {
    expect(salesBonus(45_000_000, 2)).toBe(900_000)
    expect(salesBonus(1_234_567, 1.5)).toBe(18_519)
    expect(salesBonus(0, 5)).toBe(0)
    expect(salesBonus(-100_000, 5)).toBe(0)
    expect(salesBonus(100_000, 0)).toBe(0)
  })
})

describe('payrollTotals', () => {
  it('ishlab topilgani − to‘langani; jarima ayiradi, to‘lov ishlab topilganiga kirmaydi', () => {
    expect(earnedSign('salary')).toBe(1)
    expect(earnedSign('penalty')).toBe(-1)
    expect(earnedSign('advance')).toBe(0)
    expect(payrollTotals([
      { type: 'salary', amount: 3_000_000 },
      { type: 'bonus', amount: 900_000 },
      { type: 'award', amount: 200_000 },
      { type: 'penalty', amount: 100_000 },
      { type: 'advance', amount: 1_000_000 },
      { type: 'payment', amount: 2_500_000 },
    ])).toEqual({ earned: 4_000_000, paid: 3_500_000, balance: 500_000 })
    expect(payrollTotals([])).toEqual({ earned: 0, paid: 0, balance: 0 })
  })
})
