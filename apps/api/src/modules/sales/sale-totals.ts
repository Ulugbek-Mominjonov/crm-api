import {
  lineTotal, priceForUnit, refundTotals, saleTotals, toBaseQty, unitOptions,
  type RoundStep, type SaleTotals, type UnitSpec,
} from '@crm/shared'
import type { PriceTier, ProductUnit, Role } from '@prisma/client'
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

/** Narx darajasini hal qiladigan sozlamalar */
export interface TierSettings {
  wholesaleEnabled: boolean
  sellerWholesaleEnabled: boolean
}

/**
 * Narx darajasi (sotuv, taklif). Ulgurji — faqat do'konda yoqilgan bo'lsa
 * (aks holda jimgina chakana). Ulgurji narxni ko'rmaydigan rol (sotuvchi,
 * `sellerWholesaleEnabled` o'chiq) unda sotmaydi: ataylab so'ralgani — 403,
 * mijoz guruhidan avtomatik tanlangani — chakana.
 */
export function resolvePriceTier(
  requested: PriceTier | undefined,
  fallback: PriceTier,
  settings: TierSettings,
  role: Role,
): PriceTier {
  if (!settings.wholesaleEnabled) return 'retail'
  const tier = requested ?? fallback
  if (tier === 'retail' || canSeeField(role, 'wholesalePrice', visibilityPolicy(settings))) return tier
  if (requested) {
    throw new PermissionDeniedError('Ulgurji narxda sotish sotuvchiga yopiq — administrator sozlamada yoqadi')
  }
  return 'retail'
}

/**
 * Qatorlarni narxlaydi: birlik (asosiy yoki sozlangan qo'shimcha), asosiy
 * birlikdagi miqdor (I23), narx darajasi, tannarx snapshot.
 * Arxivlangan tovar sotilmaydi.
 */
export function priceLines(
  inputs: readonly LineInput[],
  products: ReadonlyMap<string, PricingProduct>,
  tier: PriceTier,
): PricedLine[] {
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

    const price = input.price ?? priceForUnit(product, tier === 'wholesale' ? product.wholesalePrice : product.price, unit)
    const discount = input.discount ?? 0
    const gross = lineTotal(price, input.qty)
    if (discount > gross) {
      throw new DomainError('DISCOUNT_LIMIT', `«${product.name}»: qator chegirmasi qator summasidan katta`, [
        { field: `items[${i}].discount`, code: 'DISCOUNT_LIMIT', meta: { max: gross, requested: discount } },
      ])
    }
    return {
      productId: product.id,
      name: product.name,
      unit,
      qty: input.qty,
      baseQty: toBaseQty(product, input.qty, unit),
      price,
      cost: priceForUnit(product, product.cost, unit),
      discount,
      total: gross - discount,
    }
  })
}

export interface TotalsInput {
  /** Umumiy chegirma, so'm */
  discount: number
  taxRate: number
  /** Umumiy chegirma chegarasi, % (sozlama) */
  maxDiscountPct: number
  bonusRequested?: number
  bonusAvailable?: number
  roundTo?: RoundStep
  deliveryFee?: number
}

export interface ComputedTotals extends SaleTotals {
  subtotal: number
  /** Umumiy chegirma (bonussiz) */
  discount: number
}

/** Qatorlar yig'indisi, chegirma chegarasi va `saleTotals` (shared) */
export function computeTotals(lines: readonly PricedLine[], input: TotalsInput): ComputedTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0)
  const maxDiscount = Math.round((subtotal * input.maxDiscountPct) / 100)
  if (input.discount > maxDiscount) {
    throw new DomainError('DISCOUNT_LIMIT', `Chegirma ko‘pi bilan ${maxDiscount} so‘m (${input.maxDiscountPct}%)`, [
      { field: 'discount', code: 'DISCOUNT_LIMIT', meta: { max: maxDiscount, requested: input.discount } },
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
  return { ...totals, subtotal, discount: input.discount }
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
  const refund = refundTotals(subtotal, discount, sale.taxRate)
  return {
    subtotal,
    discount: discount + bonusRestored,
    taxRate: sale.taxRate,
    tax: refund.tax,
    total: Math.max(0, refund.total - bonusRestored),
    bonusRestored,
    bonusRevoked: share(sale.bonusEarned, Math.floor),
  }
}
