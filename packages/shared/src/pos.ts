/**
 * Kassa (POS) hisob-kitobi — sof funksiyalar.
 *
 * Komponentdan ajratilgan, chunki aynan shu yerda ikkita jiddiy xato bor edi:
 *  · yetkazib berish narxi chek summasiga kirmasdi (K2);
 *  · qaytarishda QQS mijozga qaytarilmasdi (K3).
 * Sof funksiya sifatida ular test bilan qoplanadi.
 */

/** Naqd yaxlitlash qadami: 0 — yaxlitlanmaydi */
export type RoundStep = 0 | 500 | 1000

export interface SaleTotalsInput {
  /** Qatorlar summasi (qator chegirmalaridan keyin) */
  subtotal: number
  /** Umumiy chegirma (so'm) */
  discount: number
  /** QQS foizi; 0 — QQS yo'q */
  taxRate: number
  /** Mijoz ishlatmoqchi bo'lgan bonus ball */
  bonusRequested?: number
  /** Mijozdagi mavjud bonus ball */
  bonusAvailable?: number
  /** Naqd yaxlitlash qadami */
  roundTo?: RoundStep
  /** Yetkazib berish narxi */
  deliveryFee?: number
}

export interface SaleTotals {
  /** QQS solinadigan baza (chegirmadan keyin) */
  taxable: number
  tax: number
  /** Haqiqatda ishlatilgan bonus (cheklangan) */
  bonusUsed: number
  /** Yaxlitlash tuzatmasi (+/−) */
  rounding: number
  /** Tovarlar summasi — yaxlitlangan, yetkazishsiz */
  goodsTotal: number
  deliveryFee: number
  /** Yakuniy to'lanadigan summa (yetkazish bilan birga) */
  total: number
}

const roundNearest = (v: number, step: number) => Math.round(v / step) * step

export function saleTotals({
  subtotal,
  discount,
  taxRate,
  bonusRequested = 0,
  bonusAvailable = 0,
  roundTo = 0,
  deliveryFee = 0,
}: SaleTotalsInput): SaleTotals {
  const taxable = Math.max(0, subtotal - Math.max(0, discount))
  const tax = taxRate > 0 ? Math.round((taxable * taxRate) / 100) : 0
  const beforeBonus = taxable + tax

  const bonusUsed = Math.min(
    Math.max(0, bonusRequested),
    Math.max(0, bonusAvailable),
    beforeBonus,
  )
  const afterBonus = beforeBonus - bonusUsed
  const goodsTotal = roundTo ? roundNearest(afterBonus, roundTo) : afterBonus
  const fee = Math.max(0, deliveryFee)

  return {
    taxable,
    tax,
    bonusUsed,
    rounding: goodsTotal - afterBonus,
    goodsTotal,
    deliveryFee: fee,
    // K2: yetkazish narxi chek summasining bir qismi. Aks holda pul kassaga
    // kirib, tushum hisobotiga tushmasdi.
    total: goodsTotal + fee,
  }
}

export interface RefundTotals {
  taxable: number
  tax: number
  total: number
}

/**
 * Qaytarish summasi. K3: mijoz QQS bilan to'lagan bo'lsa, QQS ham qaytariladi —
 * shuning uchun `taxRate` asl chekdan olinishi kerak.
 */
export function refundTotals(
  subtotal: number,
  discount: number,
  taxRate: number,
): RefundTotals {
  const taxable = Math.max(0, subtotal - Math.max(0, discount))
  const tax = taxRate > 0 ? Math.round((taxable * taxRate) / 100) : 0
  return { taxable, tax, total: taxable + tax }
}
