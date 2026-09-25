import { DomainError } from '@/common/errors/domain.error'
import {
  computeTotals, priceLines, refundFor, returnLines, settle,
  type PricingProduct, type SoldLine,
} from './sale-totals'

/** Sotuv summasini serverda hisoblash (T-052) — sof funksiyalar */
const cement: PricingProduct = {
  id: 'p1',
  name: 'Sement M400',
  unit: 'kg',
  altUnit: 'qop',
  altFactor: 50,
  price: 1_200,
  wholesalePrice: 1_100,
  cost: 900,
  archived: false,
}
const products = new Map([[cement.id, cement]])

const codeOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (err) {
    if (err instanceof DomainError) return err.code
    throw err
  }
  throw new Error('xato kutilgan edi')
}

describe('priceLines', () => {
  it('asosiy birlik va chakana narx — sukut', () => {
    const [line] = priceLines([{ productId: 'p1', qty: 10 }], products, 'retail')
    expect(line).toMatchObject({ unit: 'kg', baseQty: 10, price: 1_200, cost: 900, total: 12_000 })
  })

  it('I23: qopda sotilgan tovar kilogrammda chiqadi, narx va tannarx birlikka moslashadi', () => {
    const [line] = priceLines([{ productId: 'p1', unit: 'qop', qty: 3 }], products, 'retail')
    expect(line).toMatchObject({ unit: 'qop', qty: 3, baseQty: 150, price: 60_000, cost: 45_000, total: 180_000 })
  })

  it('ulgurji daraja va savdolashilgan narx', () => {
    expect(priceLines([{ productId: 'p1', qty: 1 }], products, 'wholesale')[0]!.price).toBe(1_100)
    expect(priceLines([{ productId: 'p1', qty: 2, price: 1_000, discount: 300 }], products, 'retail')[0]!.total).toBe(1_700)
  })

  it('kasrli miqdor — so‘mgacha yaxlitlanadi', () => {
    expect(priceLines([{ productId: 'p1', qty: 1.333 }], products, 'retail')[0]!.total).toBe(1_600)
  })

  it('arxivlangan tovar, sozlanmagan birlik, katta qator chegirmasi, yo‘q tovar — rad', () => {
    const archived = new Map([['p1', { ...cement, archived: true }]])
    expect(codeOf(() => priceLines([{ productId: 'p1', qty: 1 }], archived, 'retail'))).toBe('PRODUCT_ARCHIVED')
    expect(codeOf(() => priceLines([{ productId: 'p1', unit: 'metr', qty: 1 }], products, 'retail'))).toBe('VALIDATION_FAILED')
    expect(codeOf(() => priceLines([{ productId: 'p1', qty: 1, discount: 1_201 }], products, 'retail'))).toBe('DISCOUNT_LIMIT')
    expect(codeOf(() => priceLines([{ productId: 'x', qty: 1 }], products, 'retail'))).toBe('REFERENCE_NOT_FOUND')
  })
})

describe('computeTotals', () => {
  const lines = priceLines([{ productId: 'p1', unit: 'qop', qty: 3 }], products, 'retail') // 180 000

  it('QQS chegirmadan keyin, yetkazish narxi jami ICHIDA (I5)', () => {
    const t = computeTotals(lines, { discount: 20_000, taxRate: 12, maxDiscountPct: 100, deliveryFee: 15_000 })
    expect(t).toMatchObject({ subtotal: 180_000, discount: 20_000, tax: 19_200, deliveryFee: 15_000, total: 194_200 })
  })

  it('chegirma `maxDiscountPct` dan oshsa — 422 DISCOUNT_LIMIT', () => {
    expect(codeOf(() => computeTotals(lines, { discount: 18_001, taxRate: 0, maxDiscountPct: 10 }))).toBe('DISCOUNT_LIMIT')
    expect(computeTotals(lines, { discount: 18_000, taxRate: 0, maxDiscountPct: 10 }).total).toBe(162_000)
  })

  it('bonus mavjudidan ko‘p ishlatilmaydi, yaxlitlash faqat tovar qismiga', () => {
    const t = computeTotals(lines, {
      discount: 0, taxRate: 0, maxDiscountPct: 100, bonusRequested: 9_999, bonusAvailable: 1_200, roundTo: 1000, deliveryFee: 15_000,
    })
    // 180 000 − 1 200 = 178 800 → 179 000; + 15 000
    expect(t).toMatchObject({ bonusUsed: 1_200, goodsTotal: 179_000, total: 194_000 })
  })
})

describe('settle', () => {
  it('qaytim faqat naqddan; kassada berilgan − qaytim qoladi', () => {
    expect(settle(188_600, { cash: 200_000, card: 0, transfer: 0 })).toEqual({
      cash: 188_600, card: 0, transfer: 0, change: 11_400, outstanding: 0,
    })
  })

  it('aralash to‘lov va qolgan qarz (I13)', () => {
    expect(settle(100_000, { cash: 30_000, card: 20_000, transfer: 0 })).toMatchObject({ change: 0, outstanding: 50_000 })
  })

  it('karta chekdan oshsa — 422 PAYMENT_EXCEEDS_TOTAL', () => {
    expect(codeOf(() => settle(100_000, { cash: 0, card: 100_001, transfer: 0 }))).toBe('PAYMENT_EXCEEDS_TOTAL')
  })
})

describe('qaytarish', () => {
  const sold = (over: Partial<SoldLine> = {}): Map<string, SoldLine> =>
    new Map([['i1', {
      id: 'i1', productId: 'p1', name: 'Sement', unit: 'qop', qty: 3, baseQty: 150,
      price: 60_000, cost: 45_000, discount: 100, returnedQty: 0, ...over,
    } satisfies SoldLine]])

  it('asl miqdordan (oldingilar bilan) oshmaydi — 422 RETURN_EXCEEDS_SOLD', () => {
    expect(codeOf(() => returnLines(sold({ returnedQty: 2 }), [{ saleItemId: 'i1', qty: 2 }]))).toBe('RETURN_EXCEEDS_SOLD')
    expect(codeOf(() => returnLines(sold(), [{ saleItemId: 'x', qty: 1 }]))).toBe('REFERENCE_NOT_FOUND')
  })

  it('bo‘lib qaytarilganda ulushlar yig‘indisi aynan qator summasiga teng', () => {
    const parts = [0, 1, 2].map((done) => returnLines(sold({ returnedQty: done }), [{ saleItemId: 'i1', qty: 1 }])[0]!)
    expect(parts.reduce((s, p) => s + p.total, 0)).toBe(179_900)
    expect(parts.reduce((s, p) => s + p.discount, 0)).toBe(100)
    expect(parts.reduce((s, p) => s + p.baseQty, 0)).toBe(150)
  })

  it('I6: QQS asl chek foizi bo‘yicha, qisman qaytarishda mutanosib', () => {
    // 4 × 100 000, 12% → 1 tasi qaytadi: 112 000
    const r = refundFor({ subtotal: 400_000, discount: 0, bonusUsed: 0, bonusEarned: 0, taxRate: 12 }, 100_000, 0)
    expect(r).toMatchObject({ tax: 12_000, total: 112_000, taxRate: 12 })
  })

  it('ball bilan to‘langan qism ball bo‘lib qaytadi, berilgan ball olib qo‘yiladi', () => {
    // 100 000, 12%, bonus 5 000 → mijoz 107 000 pul + 5 000 ball to'lagan
    const sale = { subtotal: 100_000, discount: 5_000, bonusUsed: 5_000, bonusEarned: 1_070, taxRate: 12 }
    expect(refundFor(sale, 100_000, 0)).toMatchObject({ total: 107_000, bonusRestored: 5_000, bonusRevoked: 1_070 })
    const half = [refundFor(sale, 50_000, 0), refundFor(sale, 50_000, 50_000)]
    expect(half[0]!.total + half[1]!.total).toBe(107_000)
    expect(half[0]!.bonusRevoked + half[1]!.bonusRevoked).toBe(1_070)
  })
})
