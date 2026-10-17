import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min,
} from 'class-validator'
import { ToUpperCase, Trim } from '@/common/validation/decorators'

/** Do'kon sozlamalari — tenantda bitta qator */
export class SettingsDto {
  @ApiProperty({ example: 'Qurilish Mollari' }) storeName!: string
  @ApiProperty({ example: 'so‘m' }) currency!: string
  @ApiProperty() taxEnabled!: boolean
  @ApiProperty({ example: 12, description: 'QQS foizi, butun son (12 = 12%)' }) taxRate!: number
  @ApiProperty() wholesaleEnabled!: boolean
  @ApiProperty({
    description:
      'Sotuvchi ham ulgurji narxda sota oladi va `wholesalePrice` ni ko‘radi (`wholesaleEnabled` bilan birga). ' +
      '`false` — sotuvchiga ulgurji narx yashirin, `priceTier: "wholesale"` → 403',
  })
  sellerWholesaleEnabled!: boolean
  @ApiProperty() loyaltyEnabled!: boolean
  @ApiProperty({ example: 1, description: 'Xariddan bonus foizi' }) loyaltyRate!: number
  @ApiProperty({ example: 100, description: 'Kassada ruxsat etilgan maksimal chegirma, % — umumiy va qator chegirmasi, qo‘lda narx (ro‘yxat narxiga nisbatan)' })
  maxDiscountPct!: number
  @ApiProperty({
    example: 5,
    description: 'Minimal marja, %: minimal narx = tannarx × (1 + shu / 100); undan past sotish — faqat `sales.belowCost` ruxsati bilan (T-141). 0 — tannarxning o‘zi',
  })
  minMarginPct!: number
  @ApiProperty({ example: '+998 71 200 00 00' }) receiptPhone!: string
  @ApiProperty({ example: 'Toshkent sh., Qurilish ko‘chasi 1' }) receiptAddress!: string
  @ApiProperty({ example: 'Xaridingiz uchun rahmat!' }) receiptFooter!: string
  @ApiProperty({ description: 'Dastlabki sozlash tugatilganmi' }) onboarded!: boolean
  @ApiProperty({
    type: String,
    nullable: true,
    example: '#1A7F5A',
    description: 'Brend rangi `#RRGGBB` (katta harf); `null` — standart. Kalit doim bor',
  })
  brandColor!: string | null
  @ApiProperty({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Logotip — `store_logo` fayli (`GET /files/urls?ids=…&variant=128|512`); `null` — yo‘q. Kalit doim bor',
  })
  logoFileId!: string | null
}

/** Foizlar 0–100 — baza CHECK'i ham shunday (oxirgi to'siq) */
const PCT_MAX = 100
/** Brend rangi — baza CHECK'i bilan bir xil (`settings_brand_color_check`) */
const BRAND_COLOR = /^#[0-9A-F]{6}$/

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 'Qurilish Mollari', maxLength: 120 })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  storeName?: string

  @ApiPropertyOptional({ example: 'so‘m', maxLength: 10 })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  currency?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  taxEnabled?: boolean

  @ApiPropertyOptional({ minimum: 0, maximum: PCT_MAX })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PCT_MAX)
  taxRate?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  wholesaleEnabled?: boolean

  @ApiPropertyOptional({ description: 'Sotuvchiga ulgurji narxda sotishni ochish' })
  @IsOptional()
  @IsBoolean()
  sellerWholesaleEnabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  loyaltyEnabled?: boolean

  @ApiPropertyOptional({ minimum: 0, maximum: PCT_MAX })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PCT_MAX)
  loyaltyRate?: number

  @ApiPropertyOptional({ minimum: 0, maximum: PCT_MAX })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PCT_MAX)
  maxDiscountPct?: number

  @ApiPropertyOptional({ minimum: 0, maximum: PCT_MAX, description: 'Minimal marja, % (0 — tannarxning o‘zi)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PCT_MAX)
  minMarginPct?: number

  @ApiPropertyOptional({ maxLength: 40 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(40)
  receiptPhone?: string

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  receiptAddress?: string

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  receiptFooter?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onboarded?: boolean

  @ApiPropertyOptional({ type: String, nullable: true, example: '#1A7F5A', description: '`#RRGGBB`; `null` — standart rang' })
  @IsOptional()
  @ToUpperCase()
  @Matches(BRAND_COLOR, { message: 'brandColor — #RRGGBB ko‘rinishida (masalan #1A7F5A)' })
  brandColor?: string | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Tasdiqlangan `store_logo` fayli; `null` — logotipni olib tashlash (eski fayl o‘chiriladi)',
  })
  @IsOptional()
  @IsUUID()
  logoFileId?: string | null
}
