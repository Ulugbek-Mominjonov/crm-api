import { describe, expect, it } from 'vitest'
import {
  BILLING_PERIODS, PAID_PLANS, PLAN_INFO, PLAN_MONTHLY_PRICE, PLAN_NAMES, planLimits, planPrice, PLANS, prepayDiscountPct,
  TRIAL_DAYS, TRIAL_PLAN,
} from './plans'

const MB = 1024 * 1024

describe('tariflar', () => {
  it('saqlash hajmi va bitta fayl: bepul 200 MB / 5 MB, pullik — 1 / 5 / 20 GB', () => {
    expect([PLANS.free.storageBytes, PLANS.basic.storageBytes, PLANS.business.storageBytes, PLANS.pro.storageBytes])
      .toEqual([200 * MB, 1024 * MB, 5120 * MB, 20_480 * MB])
    expect([PLANS.free.fileBytes, PLANS.basic.fileBytes, PLANS.business.fileBytes, PLANS.pro.fileBytes]).toEqual([5 * MB, 10 * MB, 20 * MB, 50 * MB])
  })

  it('har keyingi tarif chegarasi kichik emas', () => {
    for (const key of ['users', 'warehouses', 'storageBytes', 'fileBytes', 'smsPerMonth'] as const) {
      const values = PLAN_NAMES.map((p) => PLANS[p][key])
      expect([...values].sort((x, y) => x - y)).toEqual(values)
    }
  })

  it('noma’lum tarif — bepul chegaralar', () => {
    expect(planLimits('enterprise')).toEqual(PLANS.free)
    expect(planLimits('pro')).toEqual(PLANS.pro)
  })

  it('narx: bepul sotilmaydi; kattaroq tarif — qimmatroq; har tarifning nomi bor', () => {
    expect(PAID_PLANS).toEqual(['basic', 'business', 'pro'])
    for (let i = 1; i < PAID_PLANS.length; i++) {
      expect(PLAN_MONTHLY_PRICE[PAID_PLANS[i]!]).toBeGreaterThan(PLAN_MONTHLY_PRICE[PAID_PLANS[i - 1]!])
    }
    expect(PLAN_NAMES.every((p) => PLAN_INFO[p].label.length > 0)).toBe(true)
  })

  it('oldindan to‘lov chegirmasi: 3 oy — 5 %, 6 oy — 10 %, 12 oy — 20 %; oraliq oylar — pastki pog‘ona', () => {
    expect([1, 2, 3, 5, 6, 11, 12].map(prepayDiscountPct)).toEqual([0, 0, 5, 5, 10, 10, 20])
    expect(BILLING_PERIODS).toEqual([1, 3, 6, 12])
  })

  it('summa: oylik × oy, chegirma bilan, 1 000 so‘mga pastga yaxlitlanadi', () => {
    expect(planPrice('basic', 1)).toBe(99_000)
    // 297 000 × 0,95 = 282 150 → 282 000
    expect(planPrice('basic', 3)).toBe(282_000)
    // 199 000 × 12 × 0,8 = 1 910 400 → 1 910 000
    expect(planPrice('business', 12)).toBe(1_910_000)
    expect(planPrice('pro', 2)).toBe(PLAN_MONTHLY_PRICE.pro * 2)
    expect(planPrice('free', 12)).toBe(0)
    // Tanlov muddatlarida uzoqrog'i jami qimmatroq, oyiga esa arzonroq (11 oy 12 oydan qimmat —
    // shuning uchun do'kon faqat shu muddatlarni tanlaydi)
    for (const plan of PAID_PLANS) {
      for (let i = 1; i < BILLING_PERIODS.length; i++) {
        const [shorter, longer] = [BILLING_PERIODS[i - 1]!, BILLING_PERIODS[i]!]
        expect(planPrice(plan, longer)).toBeGreaterThan(planPrice(plan, shorter))
        expect(planPrice(plan, longer) / longer).toBeLessThan(planPrice(plan, shorter) / shorter)
      }
    }
  })

  it('sinov: sotiladigan tarifda, 14 kun', () => {
    expect(PAID_PLANS).toContain(TRIAL_PLAN)
    expect(TRIAL_DAYS).toBe(14)
  })
})
