import { applyDecorators } from '@nestjs/common'
import { Transform } from 'class-transformer'
import { IsString, ValidateBy } from 'class-validator'

/** Bank kartasi raqami — 16 raqam, bo'sh joy va chiziqchasiz saqlanadi */
const CARD_PATTERN = /^\d{16}$/

/**
 * Luhn (ISO/IEC 7812) nazorat raqami: bitta raqam xatosini va qo'shni
 * raqamlar almashuvini ushlaydi.
 */
export function luhnValid(digits: string): boolean {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

/**
 * Egasining to'lov kartasi (T-149): do'konlar pulni xato raqamga
 * o'tkazib yubormasin — format va nazorat raqami tekshiriladi. `""` —
 * kartani olib tashlash (qisman yangilash qoidasi).
 */
export const IsCardNumber = (): PropertyDecorator =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value)),
    IsString(),
    ValidateBy({
      name: 'isCardNumber',
      validator: {
        validate: (value: unknown) => value === '' || (typeof value === 'string' && CARD_PATTERN.test(value) && luhnValid(value)),
        defaultMessage: () => 'Karta raqami — 16 ta raqam, nazorat raqami mos bo‘lsin (raqamni tekshiring)',
      },
    }),
  )
