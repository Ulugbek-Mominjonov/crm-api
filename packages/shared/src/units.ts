import type { Product, ProductUnit } from './types'

/**
 * Birlik konvertatsiyasi — qurilish mollari uchun zarur.
 *
 * Sement qopda keladi, lekin kilogrammda ham sotiladi; rulon lineolum
 * metrda kesiladi. Qoldiq va tannarx HAR DOIM asosiy birlikda (`unit`)
 * yuritiladi — shunda ombor hisobi bitta o'lchovda qoladi. `altUnit` esa
 * faqat kiritish/ko'rsatish uchun ishlatiladi.
 */

export interface UnitOption {
  unit: ProductUnit
  /** 1 ta shu birlik nechta asosiy birlikka teng */
  factor: number
  /** Asosiy birlikmi? */
  base: boolean
}

/** Mahsulot uchun mavjud birliklar (asosiy + qo'shimcha) */
export function unitOptions(p: Product): UnitOption[] {
  const out: UnitOption[] = [{ unit: p.unit, factor: 1, base: true }]
  if (p.altUnit && p.altUnit !== p.unit && (p.altFactor ?? 0) > 0) {
    out.push({ unit: p.altUnit, factor: p.altFactor!, base: false })
  }
  return out
}

/** Mahsulotda qo'shimcha birlik sozlanganmi? */
export function hasAltUnit(p: Product): boolean {
  return !!p.altUnit && p.altUnit !== p.unit && (p.altFactor ?? 0) > 0
}

/** Tanlangan birlikdagi miqdorni asosiy birlikka o'tkazadi */
export function toBaseQty(
  p: Product,
  qty: number,
  unit: ProductUnit,
): number {
  if (unit === p.unit) return qty
  if (hasAltUnit(p) && unit === p.altUnit) {
    return round3(qty * p.altFactor!)
  }
  return qty
}

/** Asosiy birlikdagi miqdorni tanlangan birlikka o'tkazadi */
export function fromBaseQty(
  p: Product,
  baseQty: number,
  unit: ProductUnit,
): number {
  if (unit === p.unit) return baseQty
  if (hasAltUnit(p) && unit === p.altUnit) {
    return round3(baseQty / p.altFactor!)
  }
  return baseQty
}

/** Tanlangan birlik uchun bir birlik narxi */
export function priceForUnit(
  p: Product,
  basePrice: number,
  unit: ProductUnit,
): number {
  if (unit === p.unit) return basePrice
  if (hasAltUnit(p) && unit === p.altUnit) {
    return Math.round(basePrice * p.altFactor!)
  }
  return basePrice
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
