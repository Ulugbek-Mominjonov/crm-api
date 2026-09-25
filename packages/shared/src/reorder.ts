import type { Product } from './types'

/**
 * Kam qolgan tovar: jami qoldiq minimal chegaradan oshmaydi.
 * Frontenddagi "Ombor → taklif" tabi va Dashboard ogohlantirishi bilan bir xil.
 */
export function isLowStock(p: Pick<Product, 'stock' | 'minStock'>): boolean {
  return p.stock <= p.minStock
}

/**
 * Buyurtma taklifi: qoldiqni minimalning ikki barobarigacha to'ldirish,
 * lekin kamida minimal miqdor — `max(minStock × 2 − stock, minStock)`.
 * Miqdor asosiy birlikda, 3 kasrgacha yaxlitlanadi (kg, m²).
 */
export function reorderQty(p: Pick<Product, 'stock' | 'minStock'>): number {
  return round3(Math.max(p.minStock * 2 - p.stock, p.minStock))
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
