import type { ProductUnit } from './types'

/**
 * Tilga bog'liq bo'lmagan domen ma'lumotlari.
 *
 * Bu yerda faqat kalitlar va qiymatlar; ko'rsatiladigan matnlar mijoz
 * tomonidagi i18n'da. Server yangi tenant yaratishda shu ro'yxatdan
 * foydalanadi — shunda mijoz va serverdagi sukut kategoriyalar bir xil.
 */

/** Mahsulot birliklari (kalitlar) — matni `enum.productUnit.*` da */
export const PRODUCT_UNITS: readonly ProductUnit[] = [
  'dona',
  'kg',
  'metr',
  'm2',
  'm3',
  'litr',
  'qop',
  'rulon',
]

/** Do'kon uchun boshlang'ich kategoriyalar (foydalanuvchi o'zgartira oladi) */
export const PRODUCT_CATEGORIES: readonly string[] = [
  'Sement va aralashmalar',
  'G‘isht va bloklar',
  'Bo‘yoq va laklar',
  'Metall va armatura',
  'Elektr mollari',
  'Santexnika',
  'Yog‘och va gips',
  'Asboblar',
  'Boshqa',
]
