import { effectivePermissions, SYSTEM_ROLES, type PermissionSet, type Role } from '@crm/shared'
import { DomainError } from '@/common/errors/domain.error'
import {
  computeTotals, priceLines, refundFor, resolvePriceTier, returnLines, settle,
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
/** Sukut: marja 0, chegirma 100%, minimal narx cheklovi qo'llanmaydi */
const POLICY = { minMarginPct: 0, maxDiscountPct: 100, belowCostAllowed: true }

const codeOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (err) {
    if (err instanceof DomainError) return err.code
    throw err
  }
  throw new Error('xato kutilgan edi')
}

/** Tizim rolining sukut ruxsatlari */
const of = (role: Role): PermissionSet => new Set(effectivePermissions(role, SYSTEM_ROLES[role].permissions))

describe('resolvePriceTier', () => {
  const settings = (wholesaleEnabled: boolean, sellerWholesaleEnabled = false) => ({ wholesaleEnabled, sellerWholesaleEnabled })

  it('do‘konda ulgurji o‘chiq — har doim chakana (so‘ralgan bo‘lsa ham)', () => {
    expect(resolvePriceTier('wholesale', 'retail', settings(false), of('admin'))).toBe('retail')
    expect(resolvePriceTier(undefined, 'wholesale', settings(false, true), of('manager'))).toBe('retail')
  })

  it('admin/menejer — so‘ralgani yoki mijoz guruhidan', () => {
    expect(resolvePriceTier('wholesale', 'retail', settings(true), of('manager'))).toBe('wholesale')
    expect(resolvePriceTier(undefined, 'wholesale', settings(true), of('admin'))).toBe('wholesale')
    expect(resolvePriceTier('retail', 'wholesale', settings(true), of('admin'))).toBe('retail')
  })

  it('sotuvchi ruxsatsiz: so‘ralgan ulgurji — 403, mijoz guruhidan kelgani — chakana', () => {
    expect(codeOf(() => resolvePriceTier('wholesale', 'retail', settings(true), of('sotuvchi')))).toBe('PERMISSION_DENIED')
    expect(resolvePriceTier(undefined, 'wholesale', settings(true), of('sotuvchi'))).toBe('retail')
  })

  it('sotuvchiga ruxsat berilgan (`sellerWholesaleEnabled`) — ulgurji', () => {
    expect(resolvePriceTier('wholesale', 'retail', settings(true, true), of('sotuvchi'))).toBe('wholesale')
    expect(resolvePriceTier(undefined, 'wholesale', settings(true, true), of('sotuvchi'))).toBe('wholesale')
  })
})

describe('priceLines', () => {
  it('asosiy birlik va chakana narx — sukut', () => {
    const [line] = priceLines([{ productId: 'p1', qty: 10 }], products, 'retail', POLICY)
    expect(line).toMatchObject({ unit: 'kg', baseQty: 10, price: 1_200, cost: 900, total: 12_000 })
  })

  it('I23: qopda sotilgan tovar kilogrammda chiqadi, narx va tannarx birlikka moslashadi', () => {
    const [line] = priceLines([{ productId: 'p1', unit: 'qop', qty: 3 }], products, 'retail', POLICY)
    expect(line).toMatchObject({ unit: 'qop', qty: 3, baseQty: 150, price: 60_000, cost: 45_000, total: 180_000 })
  })

  it('ulgurji daraja va savdolashilgan narx', () => {
    expect(priceLines([{ productId: 'p1', qty: 1 }], products, 'wholesale', POLICY)[0]!.price).toBe(1_100)
    expect(priceLines([{ productId: 'p1', qty: 2, price: 1_000, discount: 300 }], products, 'retail', POLICY)[0]!.total).toBe(1_700)
  })

  it('kasrli miqdor — so‘mgacha yaxlitlanadi', () => {
    expect(priceLines([{ productId: 'p1', qty: 1.333 }], products, 'retail', POLICY)[0]!.total).toBe(1_600)
  })

  it('arxivlangan tovar, sozlanmagan birlik, katta qator chegirmasi, yo‘q tovar — rad', () => {
    const archived = new Map([['p1', { ...cement, archived: true }]])
    expect(codeOf(() => priceLines([{ productId: 'p1', qty: 1 }], archived, 'retail', POLICY))).toBe('PRODUCT_ARCHIVED')
    expect(codeOf(() => priceLines([{ productId: 'p1', unit: 'metr', qty: 1 }], products, 'retail', POLICY))).toBe('VALIDATION_FAILED')
    expect(codeOf(() => priceLines([{ productId: 'p1', qty: 1, discount: 1_201 }], products, 'retail', POLICY))).toBe('DISCOUNT_LIMIT')
    expect(codeOf(() => priceLines([{ productId: 'x', qty: 1 }], products, 'retail', POLICY))).toBe('REFERENCE_NOT_FOUND')
  })
})

describe('narx siyosati (T-141)', () => {
  const strict = { minMarginPct: 10, maxDiscountPct: 100, belowCostAllowed: false }
  const policy10 = { minMarginPct: 0, maxDiscountPct: 10, belowCostAllowed: false }
  const errorOf = (fn: () => unknown): DomainError => {
    try {
      fn()
    } catch (err) {
      if (err instanceof DomainError) return err
      throw err
    }
    throw new Error('xato kutilgan edi')
  }

  it('minimal narx = tannarx × (1 + marja), sotuv birligiga moslanadi; tannarxsiz tovar — chegarasiz', () => {
    // kg: 900 × 1.1 = 990; qop (50 kg): 45 000 × 1.1 = 49 500
    expect(priceLines([{ productId: 'p1', qty: 1 }], products, 'retail', strict)[0]).toMatchObject({ minPrice: 990, listTotal: 1_200 })
    expect(priceLines([{ productId: 'p1', unit: 'qop', qty: 2 }], products, 'retail', strict)[0]).toMatchObject({ minPrice: 49_500, listTotal: 120_000 })
    const noCost = new Map([['p1', { ...cement, cost: 0 }]])
    expect(priceLines([{ productId: 'p1', qty: 1, price: 1 }], noCost, 'retail', strict)[0]!.minPrice).toBe(0)
  })

  it('qator chegirmasi va qo‘lda narx minimal summadan past — 422 `cost` (`max`, `minPrice`); chegarada — o‘tadi', () => {
    const byDiscount = errorOf(() => priceLines([{ productId: 'p1', unit: 'qop', qty: 2, discount: 21_001 }], products, 'retail', strict))
    expect(byDiscount.errors?.[0]).toEqual({ field: 'items[0].discount', code: 'DISCOUNT_LIMIT', meta: { max: 21_000, requested: 21_001, reason: 'cost', minPrice: 49_500 } })
    const byPrice = errorOf(() => priceLines([{ productId: 'p1', unit: 'qop', qty: 1, price: 49_499 }], products, 'retail', strict))
    expect(byPrice.errors?.[0]).toMatchObject({ field: 'items[0].price', meta: { max: 0, reason: 'cost', minPrice: 49_500 } })
    expect(priceLines([{ productId: 'p1', unit: 'qop', qty: 2, discount: 21_000 }], products, 'retail', strict)[0]!.total).toBe(99_000)
    expect(priceLines([{ productId: 'p1', unit: 'qop', qty: 1, price: 49_500 }], products, 'retail', strict)[0]!.total).toBe(49_500)
  })

  it('`sales.belowCost` — chegara qo‘llanmaydi, lekin `belowCost` belgisi qaytadi', () => {
    const allowed = { ...strict, belowCostAllowed: true }
    const lines = priceLines([{ productId: 'p1', unit: 'qop', qty: 1, price: 40_000 }], products, 'retail', allowed)
    const t = computeTotals(lines, { discount: 0, taxRate: 0, maxDiscountPct: 100, belowCostAllowed: true })
    expect(t).toMatchObject({ subtotal: 40_000, minSubtotal: 49_500, belowCost: true })
    const fine = priceLines([{ productId: 'p1', unit: 'qop', qty: 1 }], products, 'retail', allowed)
    expect(computeTotals(fine, { discount: 0, taxRate: 0, maxDiscountPct: 100, belowCostAllowed: true }).belowCost).toBe(false)
  })

  it('umumiy chegirma: minimal summagacha (bonus hisobga olinmaydi)', () => {
    const lines = priceLines([{ productId: 'p1', unit: 'qop', qty: 2, discount: 10_000 }], products, 'retail', strict)
    // 120 000 − 10 000 = 110 000; minimal 99 000 → umumiy chegirmaga 11 000 joy
    const err = errorOf(() => computeTotals(lines, { discount: 11_001, taxRate: 0, maxDiscountPct: 100, belowCostAllowed: false }))
    expect(err.errors?.[0]).toEqual({ field: 'discount', code: 'DISCOUNT_LIMIT', meta: { max: 11_000, requested: 11_001, reason: 'cost' } })
    const ok = computeTotals(lines, { discount: 11_000, taxRate: 0, maxDiscountPct: 100, belowCostAllowed: false, bonusRequested: 50_000, bonusAvailable: 50_000 })
    expect(ok).toMatchObject({ total: 49_000, bonusUsed: 50_000, belowCost: false })
  })

  it('chegirma foizi ro‘yxat narxiga nisbatan: qator chegirmasi, qo‘lda narx va umumiy chegirma birga 10% dan oshmaydi', () => {
    expect(errorOf(() => priceLines([{ productId: 'p1', qty: 10, discount: 1_201 }], products, 'retail', policy10)).errors?.[0])
      .toEqual({ field: 'items[0].discount', code: 'DISCOUNT_LIMIT', meta: { max: 1_200, requested: 1_201, reason: 'policy' } })
    expect(errorOf(() => priceLines([{ productId: 'p1', qty: 10, price: 1_079 }], products, 'retail', policy10)).errors?.[0])
      .toMatchObject({ field: 'items[0].price', meta: { max: 1_200, requested: 1_210, reason: 'policy' } })
    // Qatorda 600 berildi — umumiyga 600 qoldi
    const lines = priceLines([{ productId: 'p1', qty: 10, discount: 600 }], products, 'retail', policy10)
    expect(errorOf(() => computeTotals(lines, { discount: 601, taxRate: 0, maxDiscountPct: 10, belowCostAllowed: false })).errors?.[0])
      .toEqual({ field: 'discount', code: 'DISCOUNT_LIMIT', meta: { max: 600, requested: 601, reason: 'policy' } })
    expect(computeTotals(lines, { discount: 600, taxRate: 0, maxDiscountPct: 10, belowCostAllowed: false }).total).toBe(10_800)
    // Ro'yxatdan qimmat sotish — chegirma emas
    expect(priceLines([{ productId: 'p1', qty: 1, price: 1_500 }], products, 'retail', policy10)[0]!.total).toBe(1_500)
  })
})

describe('computeTotals', () => {
  const lines = priceLines([{ productId: 'p1', unit: 'qop', qty: 3 }], products, 'retail', POLICY) // 180 000

  it('QQS chegirmadan keyin, yetkazish narxi jami ICHIDA (I5)', () => {
    const t = computeTotals(lines, { discount: 20_000, taxRate: 12, maxDiscountPct: 100, belowCostAllowed: true, deliveryFee: 15_000 })
    expect(t).toMatchObject({ subtotal: 180_000, discount: 20_000, tax: 19_200, deliveryFee: 15_000, total: 194_200 })
  })

  it('chegirma `maxDiscountPct` dan oshsa — 422 DISCOUNT_LIMIT', () => {
    expect(codeOf(() => computeTotals(lines, { discount: 18_001, taxRate: 0, maxDiscountPct: 10, belowCostAllowed: true }))).toBe('DISCOUNT_LIMIT')
    expect(computeTotals(lines, { discount: 18_000, taxRate: 0, maxDiscountPct: 10, belowCostAllowed: true }).total).toBe(162_000)
  })

  it('bonus mavjudidan ko‘p ishlatilmaydi, yaxlitlash faqat tovar qismiga', () => {
    const t = computeTotals(lines, {
      discount: 0, taxRate: 0, maxDiscountPct: 100, belowCostAllowed: true, bonusRequested: 9_999, bonusAvailable: 1_200, roundTo: 1000, deliveryFee: 15_000,
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
    const sale = { subtotal: 400_000, discount: 0, bonusUsed: 0, bonusEarned: 0, taxRate: 12, tax: 48_000, total: 448_000, deliveryFee: 0 }
    expect(refundFor(sale, 100_000, 0)).toMatchObject({ tax: 12_000, total: 112_000, taxRate: 12 })
  })

  it('I6: QQS qayta hisoblanmaydi — ulush bo‘yicha: qismlar yig‘indisi to‘langan summaga aynan teng', () => {
    // 2 × 5 005 = 10 010, 12% → QQS 1 201, to'langan 11 211; bittadan qaytarilsa 5 606 + 5 605 (qayta hisoblansa 5 606 + 5 606 bo'lardi)
    const sale = { subtotal: 10_010, discount: 0, bonusUsed: 0, bonusEarned: 0, taxRate: 12, tax: 1_201, total: 11_211, deliveryFee: 0 }
    const parts = [refundFor(sale, 5_005, 0), refundFor(sale, 5_005, 5_005)]
    expect(parts.map((p) => p.total)).toEqual([5_606, 5_605])
    expect(parts.map((p) => p.tax)).toEqual([601, 600])
  })

  it('kassa yaxlitlashi (`roundTo`) qaytarishda ham ulush bo‘yicha: mijoz qancha to‘lagan bo‘lsa, shuncha qaytadi', () => {
    // 10 400, QQS yo'q, 1 000 gacha yaxlitlangan → to'langan 10 000: to'liq qaytarish 10 000, ikki yarmi 5 000 + 5 000
    const down = { subtotal: 10_400, discount: 0, bonusUsed: 0, bonusEarned: 0, taxRate: 0, tax: 0, total: 10_000, deliveryFee: 0 }
    expect(refundFor(down, 10_400, 0).total).toBe(10_000)
    expect([refundFor(down, 5_200, 0).total, refundFor(down, 5_200, 5_200).total]).toEqual([5_000, 5_000])
    // 10 600 → 11 000 to'langan: to'liq qaytarish 11 000
    const up = { ...down, subtotal: 10_600, total: 11_000 }
    expect(refundFor(up, 10_600, 0).total).toBe(11_000)
  })

  it('yetkazish narxi qaytarilmaydi (K2): to‘liq qaytarishda faqat tovar summasi', () => {
    const sale = { subtotal: 100_000, discount: 0, bonusUsed: 0, bonusEarned: 0, taxRate: 0, tax: 0, total: 115_000, deliveryFee: 15_000 }
    expect(refundFor(sale, 100_000, 0).total).toBe(100_000)
  })

  it('ball bilan to‘langan qism ball bo‘lib qaytadi, berilgan ball olib qo‘yiladi', () => {
    // 100 000, 12%, bonus 5 000 → mijoz 107 000 pul + 5 000 ball to'lagan
    const sale = { subtotal: 100_000, discount: 5_000, bonusUsed: 5_000, bonusEarned: 1_070, taxRate: 12, tax: 12_000, total: 107_000, deliveryFee: 0 }
    expect(refundFor(sale, 100_000, 0)).toMatchObject({ total: 107_000, bonusRestored: 5_000, bonusRevoked: 1_070 })
    const half = [refundFor(sale, 50_000, 0), refundFor(sale, 50_000, 50_000)]
    expect(half[0]!.total + half[1]!.total).toBe(107_000)
    expect(half[0]!.bonusRevoked + half[1]!.bonusRevoked).toBe(1_070)
  })
})
