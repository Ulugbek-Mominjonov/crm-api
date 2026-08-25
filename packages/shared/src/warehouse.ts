import type { Product, Warehouse } from './types'

/**
 * Ko'p ombor qo'llab-quvvatlash.
 *
 * ASOSIY QOIDA (invariant):
 *   product.stock === sum(values(product.stocks))
 *
 * `stock` — jami qoldiq, ilovaning katta qismi (Dashboard, Hisobotlar,
 * kam qolgan ogohlantirish) aynan shuni o'qiydi va o'zgarishsiz ishlayveradi.
 * `stocks` — ombor bo'yicha taqsimot. Ikkalasini FAQAT shu fayldagi
 * funksiyalar o'zgartiradi, shunda ular hech qachon ajralib qolmaydi.
 *
 * Tannarx (`cost`) ataylab ombor bo'yicha ajratilmagan: o'rtacha tortilgan
 * tannarx butun do'kon bo'yicha bitta bo'ladi. Bu qurilish mollari uchun
 * yetarli va hisobotlarni sodda saqlaydi.
 */

/** Migratsiya va toza o'rnatish uchun sukut ombor identifikatori */
export const DEFAULT_WAREHOUSE_ID = 'wh_main'

export function defaultWarehouse(name: string): Warehouse {
  return { id: DEFAULT_WAREHOUSE_ID, name, isDefault: true }
}

/**
 * Mahsulotning ombor bo'yicha taqsimoti.
 * Eski yozuvda `stocks` bo'lmaydi — butun qoldiq sukut omborda deb olinadi.
 */
export function stocksOf(
  p: Product,
  fallbackId = DEFAULT_WAREHOUSE_ID,
): Record<string, number> {
  if (p.stocks && Object.keys(p.stocks).length > 0) return p.stocks
  return { [fallbackId]: p.stock }
}

/** Berilgan ombordagi qoldiq */
export function stockAt(
  p: Product,
  warehouseId: string,
  fallbackId = DEFAULT_WAREHOUSE_ID,
): number {
  return stocksOf(p, fallbackId)[warehouseId] ?? 0
}

/** Taqsimotdan jami qoldiq */
export function totalOf(stocks: Record<string, number>): number {
  return Object.values(stocks).reduce((sum, n) => sum + n, 0)
}

/**
 * Ombordagi qoldiqni `delta` ga o'zgartiradi va JAMI qoldiqni qayta hisoblaydi.
 * Yagona nuqta — invariant shu yerda saqlanadi.
 */
export function applyStockDelta(
  p: Product,
  warehouseId: string,
  delta: number,
  fallbackId = DEFAULT_WAREHOUSE_ID,
): Product {
  const current = stocksOf(p, fallbackId)
  // Har bir ombor qiymati ham yaxlitlanadi: kasrli birliklarda (kg, m²)
  // suzuvchi nuqta xatosi to'planib, qoldiq 0.30000000000000004 bo'lib qolardi
  const next = {
    ...current,
    [warehouseId]: round3((current[warehouseId] ?? 0) + delta),
  }
  // 0 bo'lgan omborlarni ham saqlaymiz — tarixda ko'ringan ombor yo'qolmasin
  return { ...p, stocks: next, stock: round3(totalOf(next)) }
}

/**
 * Eski (bir omborli) mahsulotni ko'p omborli shaklga keltiradi.
 * Migratsiyada bir marta chaqiriladi.
 */
export function migrateProductStocks(
  p: Product,
  defaultId = DEFAULT_WAREHOUSE_ID,
): Product {
  if (p.stocks && Object.keys(p.stocks).length > 0) {
    // Taqsimot bor — jami bilan mos ekanini kafolatlaymiz
    return { ...p, stock: round3(totalOf(p.stocks)) }
  }
  return { ...p, stocks: { [defaultId]: p.stock } }
}

/** Faol (arxivlanmagan) omborlar */
export function activeWarehouses(list: Warehouse[]): Warehouse[] {
  return list.filter((w) => !w.archived)
}

/** Ombor nomi (topilmasa — chiziqcha) */
export function warehouseName(list: Warehouse[], id?: string): string {
  if (!id) return '—'
  return list.find((w) => w.id === id)?.name ?? '—'
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
