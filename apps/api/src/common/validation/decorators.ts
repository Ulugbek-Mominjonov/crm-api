import { applyDecorators } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { IsInt, IsISO8601, IsNumber, Matches, Max, Min } from 'class-validator'

/** Decimal(14,3) sig'imi: 11 ta butun va 3 ta kasr raqam */
export const MAX_QTY = 99_999_999_999.999
/** Nolga teng harakat ma'nosiz — eng kichik miqdor (3 kasr) */
export const MIN_QTY = 0.001

/**
 * Pul — butun so'm, manfiy emas. Yuqori chegara — JSON number xavfsiz
 * ifodalay oladigan eng katta butun son (BigInt'ga yo'qotishsiz o'tadi).
 */
export const IsMoney = (): PropertyDecorator =>
  applyDecorators(IsInt(), Min(0), Max(Number.MAX_SAFE_INTEGER))

/** Miqdor — 3 kasr xonagacha (kg, m², metr), manfiy emas */
export const IsQty = (): PropertyDecorator =>
  applyDecorators(
    IsNumber({ maxDecimalPlaces: 3, allowNaN: false, allowInfinity: false }),
    Min(0),
    Max(MAX_QTY),
  )

/** Sana `YYYY-MM-DD` — mavjud kun bo'lishi shart (2026-02-30 rad etiladi) */
export const IsDateOnly = (): PropertyDecorator =>
  applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '$property YYYY-MM-DD ko‘rinishida bo‘lsin' }),
    IsISO8601({ strict: true }),
  )

/**
 * Query satridagi `true`/`false` → boolean.
 *
 * `enableImplicitConversion` o'chiq (setup-app): `Boolean('false') === true`
 * xatosiga yo'l qo'ymaslik uchun o'girish shu yerda aniq yoziladi.
 * Boshqa qiymat o'zgarmaydi va `@IsBoolean` da yiqiladi.
 */
export const ToBoolean = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )

/** Chekka bo'sh joylarni olib tashlaydi (nom, email ...) */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))

/**
 * Email bitta ko'rinishda: kirishda ham (`auth.service`) shunday
 * solishtiriladi, aks holda `Ali@Crm.uz` bilan yaratilgan hisobga kirib
 * bo'lmay qolardi.
 */
export const NormalizeEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )

/**
 * Bo'sh satr → `null`. Ixtiyoriy NOYOB maydonlar uchun (shtrix-kod, STIR):
 * aks holda bo'sh qiymatli ikkinchi yozuv "band" xatosini berardi.
 */
export const TrimToNull = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
