import { applyDecorators } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { IsString, Matches } from 'class-validator'

/**
 * Telefon raqami bitta ko'rinishda saqlanadi: raqamlar va boshidagi `+`.
 *
 * Sabab: bir raqam `+998 90 123-45-67` va `+998901234567` bo'lib ikki xil
 * yozilsa, qidiruv va takroriy mijozni aniqlash ishlamaydi; `(tenant_id,
 * phone)` indeksi ham faqat aniq moslikda foyda beradi.
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, '')
  return trimmed.startsWith('+') ? `+${digits}` : digits
}

/** Kamida 7 raqam (frontend `isPhone` bilan bir xil), ko'pi bilan 15 (E.164) */
const PHONE_PATTERN = /^\+?\d{7,15}$/

/** Kirishda normallashtiradi, keyin tekshiradi */
export const IsPhone = (): PropertyDecorator =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? normalizePhone(value) : value,
    ),
    IsString(),
    Matches(PHONE_PATTERN, { message: '$property 7–15 ta raqamdan iborat bo‘lsin' }),
  )
