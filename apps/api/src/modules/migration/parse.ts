import { businessDate } from '@/common/time'

/**
 * Brauzerdan kelgan nusxa ISHONCHSIZ: har maydon turi tekshiriladi, mos
 * kelmasa `undefined` (chaqiruvchi sukut qo'yadi yoki yozuvni o'tkazadi).
 */
export type Obj = Record<string, unknown>

export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Massiv bo'lmasa — bo'sh (eski versiyada ro'yxat yo'q, 07 §7.10) */
export const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

export function text(v: unknown, max = 500): string | undefined {
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s === '' ? undefined : s.slice(0, max)
}

/** So'm — butun son */
export function money(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined
}

/** Miqdor — 3 kasr (kg, m) */
export function qty(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : undefined
}

export function int(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) ? v : undefined
}

export function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** Hujjat sanasi `YYYY-MM-DD`: vaqtli ISO bo'lsa — Toshkent kuni (00:30 dagi sotuv o'sha kunniki) */
export function day(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  if (DATE_ONLY.test(v)) return Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? undefined : v
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? undefined : businessDate(new Date(ms))
}

/** Vaqt belgisi — ISO */
export function moment(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString()
}

/** `CHEK-1044` → 1044 (hisoblagich uchun); raqamsiz — 0 */
export function docNo(number: string): number {
  const match = /(\d+)$/.exec(number)
  return match ? Number(match[1]) : 0
}
