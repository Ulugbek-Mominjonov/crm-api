import type { Prisma } from '@prisma/client'

/**
 * API ↔ baza qiymatlari (02: pul — BigInt, miqdor — Decimal(14,3)).
 *
 * Pul JSON'da `number`: so'mdagi summa `Number.MAX_SAFE_INTEGER` (≈9·10¹⁵)
 * ga yetmaydi, DTO validatsiyasi ham shu chegarani qo'yadi (`IsMoney`).
 * Miqdor bazaga SATR bo'lib boradi — 0.1 kabi qiymat suzuvchi nuqta
 * xatosisiz yoziladi.
 */
export const moneyToDb = (value: number): bigint => BigInt(value)
export const moneyFromDb = (value: bigint): number => Number(value)

export const qtyToDb = (value: number): string => String(value)
export const qtyFromDb = (value: Prisma.Decimal): number => value.toNumber()

/** `YYYY-MM-DD` ↔ `@db.Date` (vaqt zonasiz sana — UTC yarim tun) */
export const dateToDb = (value: string): Date => new Date(`${value}T00:00:00.000Z`)
export const dateFromDb = (value: Date): string => value.toISOString().slice(0, 10)

/**
 * PATCH uchun: `undefined` — maydon o'zgarmaydi, `null` — tozalanadi,
 * qiymat — o'giriladi.
 */
export function mapNullable<T, R>(
  value: T | null | undefined,
  convert: (v: T) => R,
): R | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return convert(value)
}

/** Ixtiyoriy (null bo'lmaydigan) maydon: `undefined` — o'zgarmaydi */
export function mapDefined<T, R>(value: T | undefined, convert: (v: T) => R): R | undefined {
  return value === undefined ? undefined : convert(value)
}
