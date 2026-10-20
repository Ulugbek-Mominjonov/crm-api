import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator'
import { IsCardNumber } from '@/common/validation/card'
import { Trim } from '@/common/validation/decorators'

export const REGISTRATION_MODES = ['open', 'closed'] as const
export type RegistrationMode = (typeof REGISTRATION_MODES)[number]

const MAX_PHONE_LENGTH = 32
const MAX_HOURS_LENGTH = 120
const MAX_CARD_HOLDER_LENGTH = 64
/** Telegram foydalanuvchi nomi: 5–32 belgi, harf/raqam/`_`; bo'sh — o'chirish */
const TELEGRAM_USERNAME_PATTERN = /^([A-Za-z0-9_]{5,32})?$/

/** Egasining aloqa ma'lumoti (T-140) — do'kon ilovasida bannerda va murojaat oynasida; hammasi ixtiyoriy */
export class PlatformSupportDto {
  @ApiProperty({ nullable: true, type: String, example: '+998 90 123 45 67', description: 'Ko‘rsatish uchun; `tel:` havolaga raqamlarni oling' })
  phone!: string | null
  @ApiProperty({ nullable: true, type: String, example: 'workspaces_support', description: 'Telegram foydalanuvchi nomi (`@`siz) — `https://t.me/<nom>`' })
  telegram!: string | null
  @ApiProperty({ nullable: true, type: String, example: 'Du–Sha 9:00–18:00', description: 'Ish vaqti (erkin matn)' })
  hours!: string | null
}

/** Egasining to'lov kartasi (T-149): do'kon administratori to'lov oynasida ko'radi va shu kartaga o'tkazadi */
export class PaymentCardDto {
  @ApiProperty({ example: '8600069195406311', description: '16 raqam — ko‘rsatishda 4 tadan guruhlang (`8600 0691 9540 6311`)' })
  number!: string
  @ApiProperty({
    nullable: true, type: String, example: 'ULUGBEK M.',
    description: 'Karta egasi — to‘lovchi ilovasi o‘tkazmada ko‘rsatadigan ism bilan solishtiradi',
  })
  holder!: string | null
}

/** Platforma sozlamasi (T-138, T-140, T-149) — bitta qator */
export class PlatformSettingsDto {
  @ApiProperty({
    enum: REGISTRATION_MODES,
    description: '`open` — har kim do‘kon ochadi (`POST /tenants/register`); `closed` — faqat egasi paneli ochadi, ochiq yo‘l 403 `REGISTRATION_CLOSED`',
  })
  registrationMode!: RegistrationMode

  @ApiProperty({ type: PlatformSupportDto }) support!: PlatformSupportDto
  @ApiProperty({ type: PaymentCardDto, nullable: true, description: 'To‘lov kartasi; `null` — karta orqali to‘lov o‘chiq' })
  paymentCard!: PaymentCardDto | null
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date
  @ApiProperty({ nullable: true, type: String, description: 'Oxirgi o‘zgartirgan egasi hisobi (nomi)' }) updatedBy!: string | null
}

/** Faqat yuborilgan maydon o'zgaradi; `""` — o'chirish */
export class UpdatePlatformSupportDto {
  @ApiPropertyOptional({ maxLength: MAX_PHONE_LENGTH, example: '+998 90 123 45 67', description: '`""` — o‘chirish' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_PHONE_LENGTH)
  phone?: string

  @ApiPropertyOptional({ example: 'workspaces_support', description: 'Foydalanuvchi nomi, `@` bilan ham bo‘ladi (olib tashlanadi); `""` — o‘chirish' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/^@/, '') : value))
  @IsString()
  @Matches(TELEGRAM_USERNAME_PATTERN, { message: 'Telegram nomi — 5–32 ta harf, raqam yoki «_»' })
  telegram?: string

  @ApiPropertyOptional({ maxLength: MAX_HOURS_LENGTH, example: 'Du–Sha 9:00–18:00', description: '`""` — o‘chirish' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_HOURS_LENGTH)
  hours?: string
}

/** Faqat yuborilgan maydon o'zgaradi; `number: ""` — karta orqali to'lovni o'chirish */
export class UpdatePaymentCardDto {
  @ApiPropertyOptional({ example: '8600 0691 9540 6311', description: '16 raqam (bo‘sh joy, chiziqcha bo‘lishi mumkin), nazorat raqami tekshiriladi; `""` — o‘chirish' })
  @IsOptional()
  @IsCardNumber()
  number?: string

  @ApiPropertyOptional({ maxLength: MAX_CARD_HOLDER_LENGTH, example: 'ULUGBEK M.', description: '`""` — o‘chirish' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_CARD_HOLDER_LENGTH)
  holder?: string
}

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({ enum: REGISTRATION_MODES })
  @IsOptional()
  @IsIn(REGISTRATION_MODES)
  registrationMode?: RegistrationMode

  @ApiPropertyOptional({ type: UpdatePlatformSupportDto, description: 'Aloqa: faqat yuborilgan maydonlar o‘zgaradi' })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePlatformSupportDto)
  support?: UpdatePlatformSupportDto

  @ApiPropertyOptional({ type: UpdatePaymentCardDto, description: 'To‘lov kartasi: faqat yuborilgan maydonlar o‘zgaradi' })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePaymentCardDto)
  paymentCard?: UpdatePaymentCardDto
}
