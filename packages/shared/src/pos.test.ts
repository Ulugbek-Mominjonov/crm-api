import { describe, expect, it } from 'vitest'
import { refundTotals, saleTotals } from './pos'

describe('saleTotals', () => {
  it('QQS chegirmadan keyingi bazadan hisoblanadi', () => {
    const t = saleTotals({ subtotal: 100_000, discount: 20_000, taxRate: 12 })
    expect(t.taxable).toBe(80_000)
    expect(t.tax).toBe(9_600)
    expect(t.total).toBe(89_600)
  })

  it('QQS o‘chirilgan bo‘lsa (taxRate=0) soliq qo‘shilmaydi', () => {
    const t = saleTotals({ subtotal: 100_000, discount: 0, taxRate: 0 })
    expect(t.tax).toBe(0)
    expect(t.total).toBe(100_000)
  })

  // K2 — asosiy xato: yetkazish narxi chek summasiga kirmasdi
  it('K2: yetkazib berish narxi yakuniy summaga qo‘shiladi', () => {
    const t = saleTotals({
      subtotal: 100_000,
      discount: 0,
      taxRate: 0,
      deliveryFee: 15_000,
    })
    expect(t.goodsTotal).toBe(100_000)
    expect(t.deliveryFee).toBe(15_000)
    expect(t.total).toBe(115_000)
  })

  it('K2: yetkazish narxi QQS bazasiga ta’sir qilmaydi', () => {
    const t = saleTotals({
      subtotal: 100_000,
      discount: 0,
      taxRate: 12,
      deliveryFee: 15_000,
    })
    expect(t.tax).toBe(12_000)
    expect(t.total).toBe(100_000 + 12_000 + 15_000)
  })

  it('bonus mavjud balldan va chek summasidan oshmaydi', () => {
    const few = saleTotals({
      subtotal: 50_000,
      discount: 0,
      taxRate: 0,
      bonusRequested: 90_000,
      bonusAvailable: 30_000,
    })
    expect(few.bonusUsed).toBe(30_000)
    expect(few.total).toBe(20_000)

    const capped = saleTotals({
      subtotal: 10_000,
      discount: 0,
      taxRate: 0,
      bonusRequested: 99_000,
      bonusAvailable: 99_000,
    })
    expect(capped.bonusUsed).toBe(10_000)
    expect(capped.total).toBe(0)
  })

  it('yaxlitlash bonusdan keyin qo‘llanadi va tuzatma qaytariladi', () => {
    const t = saleTotals({
      subtotal: 100_300,
      discount: 0,
      taxRate: 0,
      roundTo: 500,
    })
    expect(t.goodsTotal).toBe(100_500)
    expect(t.rounding).toBe(200)
  })

  it('chegirma summadan katta bo‘lsa manfiy chiqmaydi', () => {
    const t = saleTotals({ subtotal: 10_000, discount: 50_000, taxRate: 12 })
    expect(t.taxable).toBe(0)
    expect(t.total).toBe(0)
  })
})

describe('refundTotals', () => {
  // K3 — asosiy xato: qaytarishda QQS mijozga qaytarilmasdi
  it('K3: mijoz to‘lagan QQS ham qaytariladi', () => {
    const sold = saleTotals({ subtotal: 100_000, discount: 0, taxRate: 12 })
    const back = refundTotals(100_000, 0, 12)
    expect(back.tax).toBe(12_000)
    expect(back.total).toBe(sold.total)
  })

  it('QQS foizi 0 bo‘lsa faqat tovar summasi qaytariladi', () => {
    expect(refundTotals(100_000, 0, 0).total).toBe(100_000)
  })

  it('chegirmali chekda qaytarish chegirmadan keyingi summadan hisoblanadi', () => {
    const back = refundTotals(100_000, 20_000, 12)
    expect(back.taxable).toBe(80_000)
    expect(back.total).toBe(89_600)
  })
})
