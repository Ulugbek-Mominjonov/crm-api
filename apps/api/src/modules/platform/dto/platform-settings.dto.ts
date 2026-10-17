import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator'
import { Trim } from '@/common/validation/decorators'

export const REGISTRATION_MODES = ['open', 'closed'] as const
export type RegistrationMode = (typeof REGISTRATION_MODES)[number]

const MAX_PHONE_LENGTH = 32
const MAX_HOURS_LENGTH = 120
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

/** Platforma sozlamasi (T-138, T-140) — bitta qator */
export class PlatformSettingsDto {
  @ApiProperty({
    enum: REGISTRATION_MODES,
    description: '`open` — har kim do‘kon ochadi (`POST /tenants/register`); `closed` — faqat egasi paneli ochadi, ochiq yo‘l 403 `REGISTRATION_CLOSED`',
  })
  registrationMode!: RegistrationMode

  @ApiProperty({ type: PlatformSupportDto }) support!: PlatformSupportDto
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
}
