import { describe, expect, it } from 'vitest'
import { dueTemplates, isoWeekKey, isTemplateDue, periodKey } from './recurring'
import type { ExpenseTemplate } from './types'

const tpl = (over: Partial<ExpenseTemplate> = {}): ExpenseTemplate => ({
  id: 't1',
  name: 'Do‘kon ijarasi',
  category: 'rent',
  amount: 5_000_000,
  method: 'bank',
  period: 'monthly',
  dayOfPeriod: 5,
  active: true,
  ...over,
})

describe('periodKey', () => {
  it('oylik shablon uchun yil-oy', () => {
    expect(periodKey(tpl(), new Date('2026-08-17T10:00:00'))).toBe('2026-08')
  })

  it('haftalik shablon uchun ISO hafta', () => {
    const key = periodKey(tpl({ period: 'weekly' }), new Date('2026-08-06T10:00:00'))
    expect(key).toMatch(/^\d{4}-W\d{2}$/)
  })
})

describe('isoWeekKey', () => {
  it('bir haftaning turli kunlari bitta kalit beradi', () => {
    // 2026-08-03 dushanba, 2026-08-09 yakshanba
    expect(isoWeekKey(new Date('2026-08-03T00:00:00'))).toBe(
      isoWeekKey(new Date('2026-08-09T00:00:00')),
    )
  })

  it('keyingi hafta boshqa kalit beradi', () => {
    expect(isoWeekKey(new Date('2026-08-09T00:00:00'))).not.toBe(
      isoWeekKey(new Date('2026-08-10T00:00:00')),
    )
  })
})

describe('isTemplateDue', () => {
  it('belgilangan kun kelganda muddati keladi', () => {
    expect(isTemplateDue(tpl(), new Date('2026-08-05T09:00:00'))).toBe(true)
  })

  it('kun kelmagan bo‘lsa muddati kelmaydi', () => {
    expect(isTemplateDue(tpl(), new Date('2026-08-03T09:00:00'))).toBe(false)
  })

  it('kundan keyin ham (kechikib kirilsa) yaratiladi', () => {
    expect(isTemplateDue(tpl(), new Date('2026-08-20T09:00:00'))).toBe(true)
  })

  // Eng muhimi: bir davr uchun ikki marta yaratilmasin
  it('shu davrda allaqachon ishlagan bo‘lsa qayta ishlamaydi', () => {
    const t = tpl({ lastRunKey: '2026-08' })
    expect(isTemplateDue(t, new Date('2026-08-20T09:00:00'))).toBe(false)
  })

  it('keyingi oyda yana ishlaydi', () => {
    const t = tpl({ lastRunKey: '2026-08' })
    expect(isTemplateDue(t, new Date('2026-09-05T09:00:00'))).toBe(true)
  })

  it('to‘xtatilgan shablon ishlamaydi', () => {
    expect(isTemplateDue(tpl({ active: false }), new Date('2026-08-20'))).toBe(
      false,
    )
  })

  it('oy kuni 28 dan oshsa ham qulflanmaydi (fevral muammosi)', () => {
    // 31 kiritilgan bo'lsa 28 gacha cheklanadi — fevralda ham ishlaydi
    const t = tpl({ dayOfPeriod: 31 })
    expect(isTemplateDue(t, new Date('2026-02-28T09:00:00'))).toBe(true)
  })
})

describe('dueTemplates', () => {
  it('faqat muddati kelganlarini ajratadi', () => {
    const list = [
      tpl({ id: 'a', dayOfPeriod: 1 }),
      tpl({ id: 'b', dayOfPeriod: 25 }),
      tpl({ id: 'c', dayOfPeriod: 1, active: false }),
    ]
    const due = dueTemplates(list, new Date('2026-08-10T09:00:00'))
    expect(due.map((d) => d.id)).toEqual(['a'])
  })
})
