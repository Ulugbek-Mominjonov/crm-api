import { describe, expect, it } from 'vitest'
import { PAID_PLANS, PLAN_MONTHLY_PRICE, PLAN_NAMES, planLimits, PLANS } from './plans'

const MB = 1024 * 1024

describe('tariflar', () => {
  it('saqlash hajmi 09 §9.11 bo‘yicha: 200 MB / 2 GB / 20 GB, fayl 5 / 10 / 50 MB', () => {
    expect([PLANS.free.storageBytes, PLANS.basic.storageBytes, PLANS.pro.storageBytes]).toEqual([200 * MB, 2048 * MB, 20_480 * MB])
    expect([PLANS.free.fileBytes, PLANS.basic.fileBytes, PLANS.pro.fileBytes]).toEqual([5 * MB, 10 * MB, 50 * MB])
  })

  it('har keyingi tarif chegarasi kattaroq', () => {
    for (const key of ['users', 'warehouses', 'storageBytes', 'fileBytes', 'smsPerDay'] as const) {
      const values = PLAN_NAMES.map((p) => PLANS[p][key])
      expect([...values].sort((x, y) => x - y)).toEqual(values)
    }
  })

  it('noma’lum tarif — bepul chegaralar', () => {
    expect(planLimits('enterprise')).toEqual(PLANS.free)
    expect(planLimits('pro')).toEqual(PLANS.pro)
  })

  it('narx: bepul sotilmaydi; kattaroq tarif — qimmatroq', () => {
    expect(PAID_PLANS).toEqual(['basic', 'pro'])
    expect(PLAN_MONTHLY_PRICE.pro).toBeGreaterThan(PLAN_MONTHLY_PRICE.basic)
  })
})
