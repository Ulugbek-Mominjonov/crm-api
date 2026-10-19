import {
  floorPrice, lineTotal, priceForUnit, saleTotals, toBaseQty, unitOptions,
  type PermissionSet, type RoundStep, type SaleTotals, type UnitSpec,
} from '@crm/shared'
import type { PriceTier, ProductUnit } from '@prisma/client'
import { DomainError, PermissionDeniedError } from '@/common/errors/domain.error'
import { fromMilli, toMilli } from '@/common/quantity'
import { canSeeField, visibilityPolicy } from '@/common/security/field-visibility'

/**
 * Chek hisobi — sof funksiyalar (T-052, 04 §4.5).
 *
 * Server mijoz yuborgan summalarga ISHONMAYDI: hammasi `packages/shared`
 * dagi aynan o'sha funksiyalar (`saleTotals`, `refundTotals`, `lineTotal`,
 * birlik o'girish) bilan qayta hisoblanadi. Bu yerda faqat server
 * qo'shadigan qoidalar: chegirma chegarasi, to'lov taqsimoti, qaytarish
 * ulushlari.
 */

/** Narxlash uchun mahsulot: qulf ostida o'qilgan qiymatlar, so'mda */
export interface PricingProduct extends UnitSpec {
  id: string
  name: string
  price: number
  wholesalePrice: number
  cost: number
  archived: boolean
}

export interface LineInput {
  productId: string
  /** Sotuv birligi; berilmasa — asosiy birlik */
  unit?: ProductUnit
  /** Miqdor `unit` da */
  qty: number
  /** Birlik narx (savdolashish); berilmasa — narx darajasidan */
  price?: number
  /** Qator chegirmasi, so'm */
  discount?: number
}

/** Chek qatori — narx va tannarx snapshot bilan (10 §10.2) */
export interface PricedLine {
  productId: string
  name: string
  unit: ProductUnit
  qty: number
  /** Asosiy birlikda — ombor chiqimi shu bo'yicha (I23) */
  baseQty: number
  price: number
  /** Tannarx — sotuv birligiga moslangan (1 qop = 50 × kg tannarxi) */
  cost: number
  discount: number
  /** narx × miqdor − qator chegirmasi */
  total: number
}

/** Narxlangan qator + siyosat tekshiruvi uchun qiymatlar (saqlanmaydi, T-141) */
export interface PolicedLine extends PricedLine {
  /** Ro'yxat narxida qator summasi (chegirmasiz) — chegirma chegarasi shunga nisbatan */
  listTotal: number
  /** Minimal birlik narx: tannarx × (1 + marja); 0 — tannarx noma'lum, cheklanmaydi */
  minPrice: number
}

/** Narx darajasini hal qiladigan sozlamalar */
export interface TierSettings {
  wholesaleEnabled: boolean
  sellerWholesaleEnabled: boolean
}

/**
 * Narx siyosati (T-141): zarardan himoya (minimal narx) va savdo siyosati
 * (chegirma foizi). Ikkalasi qo'lda narx, qator va umumiy chegirmaga birga qo'llanadi.
 */
export interface PricePolicy {
  /** Minimal marja, % — minimal narx = tannarx × (1 + shu / 100) */
  minMarginPct: number
  /** Chegirma chegarasi, % — ro'yxat narxiga nisbatan, chekdagi barcha chegirmalar birga */
  maxDiscountPct: number
  /** `sales.belowCost` — minimal narx cheklovi qo'llanmaydi (chek jurnalga belgi bilan tushadi) */
  belowCostAllowed: boolean
}

export function policyOf(settings: { minMarginPct: number; maxDiscountPct: number }, permissions: PermissionSet): PricePolicy {
  return { minMarginPct: settings.minMarginPct, maxDiscountPct: settings.maxDiscountPct, belowCostAllowed: permissions.has('sales.belowCost') }
}

/** Qatorning minimal summasi (minimal narx × miqdor) */
export const lineFloor = (line: Pick<PolicedLine, 'minPrice' | 'qty'>): number => Math.round(line.minPrice * line.qty)

/**
 * Narx darajasi (sotuv, taklif). Ulgurji — faqat do'konda yoqilgan bo'lsa
 * (aks holda jimgina chakana). Ulgurji narxni ko'rmaydigan rol (`wholesale.view`
 * yo'q, `sellerWholesaleEnabled` o'chiq) unda sotmaydi: ataylab so'ralgani — 403,
 * mijoz guruhidan avtomatik tanlangani — chakana.
 */
export function resolvePriceTier(
  requested: PriceTier | undefined,
  fallback: PriceTier,
  settings: TierSettings,
  permissions: PermissionSet,
): PriceTier {
  if (!settings.wholesaleEnabled) return 'retail'
  const tier = requested ?? fallback
  if (tier === 'retail' || canSeeField(permissions, 'wholesalePrice', visibilityPolicy(settings))) return tier
  if (requested) {
    throw new PermissionDeniedError('Ulgurji narxda sotish sotuvchiga yopiq — administrator sozlamada yoqadi')
  }
  return 'retail'
}

/**
 * Qatorlarni narxlaydi: birlik (asosiy yoki sozlangan qo'shimcha), asosiy
 * birlikdagi miqdor (I23), narx darajasi, tannarx snapshot. Arxivlangan
 * tovar sotilmaydi. Qator chegirmasi va qo'lda narx — siyosat doirasida
 * (chegirma foizi, minimal narx); ikkalasi ham 422 `DISCOUNT_LIMIT`
 * (`meta.reason`: `policy` yoki `cost`, `meta.max` — shu qatorga mumkin bo'lgan chegirma).
 */
export function priceLines(
  inputs: readonly LineInput[],
  products: ReadonlyMap<string, PricingProduct>,
  tier: PriceTier,
  policy: PricePolicy,
): PolicedLine[] {
  return inputs.map((input, i) => {
    const product = products.get(input.productId)
    if (!product) {
      throw new DomainError('REFERENCE_NOT_FOUND', 'Mahsulot topilmadi', [
        { field: `items[${i}].productId`, code: 'REFERENCE_NOT_FOUND' },
      ])
    }
    if (product.archived) {
      throw new DomainError('PRODUCT_ARCHIVED', `«${product.name}» arxivlangan — sotib bo‘lmaydi`, [
        { field: `items[${i}].productId`, code: 'PRODUCT_ARCHIVED' },
      ])
    }
    const unit = input.unit ?? product.unit
    if (!unitOptions(product).some((option) => option.unit === unit)) {
      throw new DomainError('VALIDATION_FAILED', `«${product.name}» uchun «${unit}» birligi sozlanmagan`, [
        { field: `items[${i}].unit`, code: 'VALIDATION_FAILED' },
      ])
    }

    const listPrice = priceForUnit(product, tier === 'wholesale' ? product.wholesalePrice : product.price, unit)
    const price = input.price ?? listPrice
    const discount = input.discount ?? 0
    const gross = lineTotal(price, input.qty)
    if (discount > gross) {
      throw new DomainError('DISCOUNT_LIMIT', `«${product.name}»: qator chegirmasi qator summasidan katta`, [
        { field: `items[${i}].discount`, code: 'DISCOUNT_LIMIT', meta: { max: gross, requested: discount } },
      ])
    }
    const cost = priceForUnit(product, product.cost, unit)
    const line: PolicedLine = {
      productId: product.id,
      name: product.name,
      unit,
      qty: input.qty,
      baseQty: toBaseQty(product, input.qty, unit),
      price,
      cost,
      discount,
      total: gross - discount,
      listTotal: lineTotal(listPrice, input.qty),
      minPrice: floorPrice(cost, policy.minMarginPct),
    }
    assertLinePolicy(line, i, input.discount !== undefined, policy)
    return line
  })
}

/**
 * Qator siyosati: ro'yxat narxidan berilgan chegirma (qator chegirmasi va
 * qo'lda pasaytirilgan narx birga) foizdan oshmasin; qator summasi minimal
 * summadan past bo'lmasin. Xato maydoni — chegirma yuborilgan bo'lsa
 * `discount`, aks holda `price` (sabab qo'lda narx).
 */
function assertLinePolicy(line: PolicedLine, i: number, hasDiscount: boolean, policy: PricePolicy): void {
  const field = `items[${i}].${hasDiscount ? 'discount' : 'price'}`
  const given = line.listTotal - line.total
  const maxGiven = Math.round((line.listTotal * policy.maxDiscountPct) / 100)
  if (given > maxGiven) {
    throw new DomainError('DISCOUNT_LIMIT', `«${line.name}»: chegirma ko‘pi bilan ${maxGiven} so‘m (${policy.maxDiscountPct}%)`, [
      { field, code: 'DISCOUNT_LIMIT', meta: { max: maxGiven, requested: given, reason: 'policy' } },
    ])
  }
  const floor = lineFloor(line)
  if (policy.belowCostAllowed || line.total >= floor) return
  const max = Math.max(0, line.total + line.discount - floor)
  throw new DomainError('DISCOUNT_LIMIT', `«${line.name}»: minimal narx ${line.minPrice} so‘m — chegirma ko‘pi bilan ${max} so‘m`, [
    { field, code: 'DISCOUNT_LIMIT', meta: { max, requested: line.discount, reason: 'cost', minPrice: line.minPrice } },
  ])
}

export interface TotalsInput extends Pick<PricePolicy, 'maxDiscountPct' | 'belowCostAllowed'> {
  /** Umumiy chegirma, so'm */
  discount: number
  taxRate: number
  bonusRequested?: number
  bonusAvailable?: number
  roundTo?: RoundStep
  deliveryFee?: number
}

export interface ComputedTotals extends SaleTotals {
  subtotal: number
  /** Umumiy chegirma (bonussiz) */
  discount: number
  /** Qatorlar minimal summalari yig'indisi (T-141) */
  minSubtotal: number
  /** Chek minimal narxdan past (`sales.belowCost` bilan o'tgan) — jurnalga belgi */
  belowCost: boolean
}

/**
 * Qatorlar yig'indisi, umumiy chegirma chegarasi va `saleTotals` (shared).
 * Umumiy chegirma uchun joy — ikki chegaraning kichigi: siyosat (ro'yxat
 * narxining foizi, qator chegirmalari allaqachon olgan qismi chiqarilgan)
 * va minimal summa (bonus hisobga olinmaydi — u mijozning avval ishlab
 * topgani, kassirning chegirmasi emas).
 */
export function computeTotals(lines: readonly PolicedLine[], input: TotalsInput): ComputedTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0)
  const listSubtotal = lines.reduce((sum, line) => sum + line.listTotal, 0)
  const minSubtotal = lines.reduce((sum, line) => sum + lineFloor(line), 0)
  const policyRoom = Math.max(0, Math.round((listSubtotal * input.maxDiscountPct) / 100) - (listSubtotal - subtotal))
  const costRoom = input.belowCostAllowed ? Number.POSITIVE_INFINITY : Math.max(0, subtotal - minSubtotal)
  if (input.discount > policyRoom) {
    throw new DomainError('DISCOUNT_LIMIT', `Chegirma ko‘pi bilan ${policyRoom} so‘m (${input.maxDiscountPct}%, qator chegirmalari bilan birga)`, [
      { field: 'discount', code: 'DISCOUNT_LIMIT', meta: { max: policyRoom, requested: input.discount, reason: 'policy' } },
    ])
  }
  if (input.discount > costRoom) {
    throw new DomainError('DISCOUNT_LIMIT', `Chegirma ko‘pi bilan ${costRoom} so‘m — tovarlar minimal narxdan past sotilmaydi`, [
      { field: 'discount', code: 'DISCOUNT_LIMIT', meta: { max: costRoom, requested: input.discount, reason: 'cost' } },
    ])
  }
  const totals = saleTotals({
    subtotal,
    discount: input.discount,
    taxRate: input.taxRate,
    bonusRequested: input.bonusRequested,
    bonusAvailable: input.bonusAvailable,
    roundTo: input.roundTo,
    deliveryFee: input.deliveryFee,
  })
  const belowCost = subtotal - input.discount < minSubtotal || lines.some((line) => line.total < lineFloor(line))
  return { ...totals, subtotal, discount: input.discount, minSubtotal, belowCost }
}

export interface PaidInput {
  cash: number
  card: number
  transfer: number
}

/** To'lov — bazaga yoziladigan ko'rinishda */
export interface Settlement {
  /** Kassada QOLADIGAN naqd: berilgan − qaytim (`paid_cash`) */
  cash: number
  card: number
  transfer: number
  /** Qaytim — faqat naqddan */
  change: number
  /** Qolgan qarz (I13) */
  outstanding: number
}

/**
 * To'lovni taqsimlaydi. Qaytim faqat naqddan beriladi: karta va o'tkazma
 * chek summasidan oshsa — xato (ortiqcha pulni kassadan qaytarib
 * bo'lmaydi). Bazada `paid_cash` — kassada qolgan naqd, shuning uchun
 * to'langan summa hech qachon chekdan oshmaydi (`paid_not_over_total`).
 */
export function settle(total: number, paid: PaidInput): Settlement {
  const nonCash = paid.card + paid.transfer
  if (nonCash > total) {
    throw new DomainError('PAYMENT_EXCEEDS_TOTAL', `Karta va o‘tkazma ${total} so‘mdan oshmasin — qaytim faqat naqddan`, [
      { field: 'paid', code: 'PAYMENT_EXCEEDS_TOTAL', meta: { total, nonCash } },
    ])
  }
  const received = paid.cash + nonCash
  const change = Math.max(0, received - total)
  return {
    cash: paid.cash - change,
    card: paid.card,
    transfer: paid.transfer,
    change,
    outstanding: Math.max(0, total - received),
  }
}

// ─────────────────────────────────────────────── qaytarish

/** Asl chek qatori — qaytarish uchun */
export interface SoldLine {
  id: string
  productId: string
  name: string
  unit: ProductUnit
  qty: number
  baseQty: number
  price: number
  cost: number
  discount: number
  /** Oldingi (bekor qilinmagan) qaytarishlarda qaytgan miqdor */
  returnedQty: number
}

export interface ReturnLine extends PricedLine {
  returnOfId: string
}

/**
 * Ulush yig'indisi bo'yicha yaxlitlash: `whole` ning `done → done+part`
 * oralig'iga to'g'ri keladigan qismi. Qismlar yig'indisi aynan `whole`
 * ga teng bo'ladi — qator bir necha marta qaytarilganda yaxlitlash
 * qoldig'i to'planmaydi.
 */
function shareOf(whole: number, done: number, part: number, of: number, round = Math.round): number {
  if (of <= 0) return 0
  return round((whole * (done + part)) / of) - round((whole * done) / of)
}

/**
 * Qaytariladigan qatorlar: miqdor asl qatordan (oldingi qaytarishlar
 * bilan birga) oshmaydi; summa, chegirma va asosiy birlik ulush bo'yicha.
 * Ombor qoldig'i TEKSHIRILMAYDI (I7).
 */
export function returnLines(
  sold: ReadonlyMap<string, SoldLine>,
  requests: readonly { saleItemId: string; qty: number }[],
): ReturnLine[] {
  return requests.map((request, i) => {
    const line = sold.get(request.saleItemId)
    if (!line) {
      throw new DomainError('REFERENCE_NOT_FOUND', 'Chek qatori topilmadi', [
        { field: `items[${i}].saleItemId`, code: 'REFERENCE_NOT_FOUND' },
      ])
    }
    const soldMilli = toMilli(line.qty)
    const doneMilli = toMilli(line.returnedQty)
    const partMilli = toMilli(request.qty)
    if (doneMilli + partMilli > soldMilli) {
      throw new DomainError(
        'RETURN_EXCEEDS_SOLD',
        `«${line.name}»: sotilgan ${line.qty}, qaytarilgan ${line.returnedQty}, so‘ralgan ${request.qty}`,
        [{
          field: `items[${i}].qty`,
          code: 'RETURN_EXCEEDS_SOLD',
          meta: { sold: line.qty, returned: line.returnedQty, requested: request.qty },
        }],
      )
    }
    const net = lineTotal(line.price, line.qty, line.discount)
    return {
      returnOfId: line.id,
      productId: line.productId,
      name: line.name,
      unit: line.unit,
      qty: request.qty,
      baseQty: fromMilli(shareOf(toMilli(line.baseQty), doneMilli, partMilli, soldMilli)),
      price: line.price,
      cost: line.cost,
      discount: shareOf(line.discount, doneMilli, partMilli, soldMilli),
      total: shareOf(net, doneMilli, partMilli, soldMilli),
    }
  })
}

/** Qaytarish hisobi uchun asl chek */
export interface RefundBase {
  subtotal: number
  /** Chekdagi chegirma — ishlatilgan bonus BILAN (API ko'rinishi) */
  discount: number
  bonusUsed: number
  bonusEarned: number
  taxRate: number
  /** Chekda saqlangan QQS — qaytarishda ulush bo'yicha (qismlar yig'indisi aynan) */
  tax: number
  /** Chek summasi va yetkazish: kassa yaxlitlashi (`roundTo`) shulardan tiklanadi */
  total: number
  deliveryFee: number
}

/** Chekdagi kassa yaxlitlashi (`roundTo`): saqlanmaydi, summalardan tiklanadi; `discount` bonus bilan */
export function roundingOf(sale: Pick<RefundBase, 'subtotal' | 'discount' | 'tax' | 'total' | 'deliveryFee'>): number {
  return sale.total - sale.deliveryFee - (sale.subtotal - sale.discount + sale.tax)
}

export interface RefundResult {
  subtotal: number
  /** Umumiy chegirma ulushi + qaytariladigan bonus ulushi */
  discount: number
  taxRate: number
  tax: number
  /** Mijozga qaytadigan pul (bonus ulushisiz) */
  total: number
  /** Mijozga QAYTADIGAN ball — to'lovning ball bilan qilingan qismi */
  bonusRestored: number
  /** Mijozdan OLINADIGAN ball — shu tovar uchun berilgani */
  bonusRevoked: number
}

/**
 * Qaytarish summasi (I6): QQS ASL chek foizi bo'yicha (`refundTotals`,
 * shared). Umumiy chegirma va bonus ulush bo'yicha taqsimlanadi:
 * ball bilan to'langan qism pul emas, ball bo'lib qaytadi; shu tovar
 * uchun berilgan ball olib qo'yiladi. `returnedBefore` — oldingi
 * qaytarishlar subtotali (ulush yaxlitlashi to'planmasin).
 */
export function refundFor(sale: RefundBase, subtotal: number, returnedBefore: number): RefundResult {
  const share = (whole: number, round?: (n: number) => number) =>
    shareOf(whole, returnedBefore, subtotal, sale.subtotal, round)
  const discount = share(sale.discount - sale.bonusUsed)
  const bonusRestored = share(sale.bonusUsed)
  // I6: QQS va kassa yaxlitlashi ham asl chekdan ULUSH bo'yicha, qayta hisoblanmaydi —
  // qismlar yig'indisi to'langan summaga aynan teng; mijoz to'lamagan yaxlitlash qaytmaydi
  const tax = share(sale.tax)
  const rounding = share(roundingOf(sale))
  return {
    subtotal,
    discount: discount + bonusRestored,
    taxRate: sale.taxRate,
    tax,
    total: Math.max(0, subtotal - discount + tax - bonusRestored + rounding),
    bonusRestored,
    bonusRevoked: share(sale.bonusEarned, Math.floor),
  }
}
