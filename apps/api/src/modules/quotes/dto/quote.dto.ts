import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PriceTier, ProductUnit, QuoteStatus } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested,
} from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { IsDateOnly, IsMoney, ToBoolean, Trim } from '@/common/validation/decorators'
import { MAX_SALE_ITEMS, SaleItemInputDto } from '@/modules/sales/dto/sale.dto'

/** Qo'lda qo'yiladigan holatlar; `converted` — faqat aylantirish orqali (I20) */
export const EDITABLE_QUOTE_STATUSES = [
  QuoteStatus.draft, QuoteStatus.sent, QuoteStatus.accepted, QuoteStatus.rejected,
] as const

/** Aylantirishda to'lov usuli: `debt` — nasiya (mijoz shart) */
export const CONVERT_METHODS = ['cash', 'card', 'transfer', 'debt'] as const
export type ConvertMethod = (typeof CONVERT_METHODS)[number]

export class CreateQuoteDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Berilmasa — joriy foydalanuvchining xodimi' })
  @IsOptional()
  @IsUUID()
  sellerId?: string

  @ApiPropertyOptional({ enum: PriceTier, description: 'Berilmasa — mijoz guruhidan' })
  @IsOptional()
  @IsIn(Object.values(PriceTier))
  priceTier?: PriceTier

  @ApiProperty({ type: [SaleItemInputDto], maxItems: MAX_SALE_ITEMS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SALE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items!: SaleItemInputDto[]

  @ApiPropertyOptional({ example: 50_000 })
  @IsOptional()
  @IsMoney()
  discount?: number

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Amal muddati' })
  @IsOptional()
  @IsDateOnly()
  validUntil?: string

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  note?: string
}

export class UpdateQuoteDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  customerId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sellerId?: string

  @ApiPropertyOptional({ enum: PriceTier })
  @IsOptional()
  @IsIn(Object.values(PriceTier))
  priceTier?: PriceTier

  @ApiPropertyOptional({ type: [SaleItemInputDto], description: 'Berilsa — qatorlar TO‘LIQ almashtiriladi' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SALE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => SaleItemInputDto)
  items?: SaleItemInputDto[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsMoney()
  discount?: number

  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateOnly()
  validUntil?: string

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  note?: string

  @ApiPropertyOptional({ enum: EDITABLE_QUOTE_STATUSES, description: '`converted` — faqat aylantirish orqali' })
  @IsOptional()
  @IsIn(EDITABLE_QUOTE_STATUSES)
  status?: (typeof EDITABLE_QUOTE_STATUSES)[number]
}

export class QuoteQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: QuoteStatus })
  @IsOptional()
  @IsIn(Object.values(QuoteStatus))
  status?: QuoteStatus

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Taklif sanasi — shu kundan' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Taklif sanasi — shu kun ham' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string

  @ApiPropertyOptional({ description: 'Faqat amal muddati o‘tgan ochiq takliflar' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  expired?: boolean
}

export class QuoteSummaryDto {
  @ApiProperty({ description: 'Barcha takliflar summasi' }) total!: number
  @ApiProperty({ description: 'Qabul qilinganlar' }) accepted!: number
  @ApiProperty({ description: 'Javob kutilayotganlar (yuborilgan)' }) pending!: number
}

export class QuotePartyDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiPropertyOptional({ description: 'Faqat mijozda' }) phone?: string
}

export class ConvertQuoteDto {
  @ApiProperty({ enum: CONVERT_METHODS, description: 'To‘lov usuli chaqiruvchidan (I20) — `debt`: nasiya' })
  @IsIn(CONVERT_METHODS)
  method!: ConvertMethod
}

export class QuoteItemDto {
  @ApiProperty() id!: string
  @ApiProperty() productId!: string
  @ApiProperty() name!: string
  @ApiProperty({ enum: ProductUnit }) unit!: ProductUnit
  @ApiProperty() qty!: number
  @ApiProperty({ description: 'Asosiy birlikda' }) baseQty!: number
  @ApiProperty() price!: number
  @ApiPropertyOptional({ description: 'Tannarx snapshot. Sotuvchi rolida yo‘q' }) cost?: number
  @ApiProperty() discount!: number
}

export class QuoteDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'TKLF-1001' }) number!: string
  @ApiProperty({ nullable: true, type: String }) customerId!: string | null
  @ApiProperty({ nullable: true, type: String }) sellerId!: string | null
  @ApiProperty({ type: QuotePartyDto, nullable: true }) customer!: QuotePartyDto | null
  @ApiProperty({ type: QuotePartyDto, nullable: true }) seller!: QuotePartyDto | null
  @ApiProperty() subtotal!: number
  @ApiProperty() discount!: number
  @ApiProperty() taxRate!: number
  @ApiProperty() tax!: number
  @ApiProperty() total!: number
  @ApiProperty({ enum: QuoteStatus }) status!: QuoteStatus
  @ApiProperty({ example: '2026-09-23' }) date!: string
  @ApiProperty({ nullable: true, type: String }) validUntil!: string | null
  @ApiProperty({ description: 'Amal muddati o‘tgan (aylantirilmagan/rad etilmagan taklif)' }) expired!: boolean
  @ApiProperty({ nullable: true, type: String }) note!: string | null
  @ApiProperty({ nullable: true, type: String, description: 'Aylantirilgan chek' }) saleId!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: [QuoteItemDto] }) items!: QuoteItemDto[]
}

export class QuotePageDto {
  @ApiProperty({ type: [QuoteDto] }) items!: QuoteDto[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() pageCount!: number
}
