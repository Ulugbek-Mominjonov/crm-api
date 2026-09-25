/**
 * CSV (Excel ochadigan) — brauzer eksporti va server eksporti BIR qoida
 * bilan: vergul ajratuvchi, `\r\n` qator oxiri, UTF-8 BOM (Excel o'zbekcha
 * harflarni to'g'ri ko'rsatsin).
 */

/** Fayl boshidagi belgi — Excel uni ko'rib UTF-8 deb o'qiydi */
export const CSV_BOM = '﻿'
export const CSV_EOL = '\r\n'

/**
 * Formula in'yeksiyasi: `=`, `+`, `-`, `@`, tab yoki CR bilan boshlangan
 * MATN katakni Excel formula deb bajaradi (`=HYPERLINK(...)`). Bunday
 * matn oldiga `'` qo'yiladi — faqat matnga, sonlarga (manfiy ham) emas.
 */
const FORMULA_START = /^[=+\-@\t\r]/

function toText(value: unknown): string {
  if (typeof value === 'string') return FORMULA_START.test(value) ? `'${value}` : value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (value instanceof Date) return value.toISOString()
  // Obyekt "[object Object]" bo'lib ketmasin
  return JSON.stringify(value) ?? ''
}

/** Bitta katak: ajratuvchi, qo'shtirnoq yoki yangi qator bo'lsa — qo'shtirnoqqa olinadi */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = toText(value)
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Bitta qator (oxirida `\r\n`) */
export function csvLine(values: readonly unknown[]): string {
  return values.map(csvCell).join(',') + CSV_EOL
}
