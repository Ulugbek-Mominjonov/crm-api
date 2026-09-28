import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { Trim } from '@/common/validation/decorators'

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
  @ApiProperty({ example: 100, description: 'Kassada ruxsat etilgan maksimal chegirma, %' })
  maxDiscountPct!: number
  @ApiProperty({ example: '+998 71 200 00 00' }) receiptPhone!: string
  @ApiProperty({ example: 'Toshkent sh., Qurilish ko‘chasi 1' }) receiptAddress!: string
  @ApiProperty({ example: 'Xaridingiz uchun rahmat!' }) receiptFooter!: string
  @ApiProperty({ description: 'Dastlabki sozlash tugatilganmi' }) onboarded!: boolean
}

/** Foizlar 0–100 — baza CHECK'i ham shunday (oxirgi to'siq) */
const PCT_MAX = 100

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
}
