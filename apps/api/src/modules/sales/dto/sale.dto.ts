import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { FiscalStatus, PriceTier, ProductUnit, SaleStatus, SaleType } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional,
  IsString, IsUUID, Max, MaxLength, Min, ValidateNested,
} from 'class-validator'
import { IsDateOnly, IsMoney, IsQty, MIN_QTY, Trim } from '@/common/validation/decorators'

/** Bitta chekda ko'pi bilan — katta ulgurji buyurtma ham sig'adi */
export const MAX_SALE_ITEMS = 200
/** Naqd yaxlitlash qadamlari (shared `RoundStep`) */
export const ROUND_STEPS = [0, 500, 1000] as const

/** To'lov usullari bo'yicha filtr: `debt` — qolgan qarzi bor cheklar */
export const PAYMENT_FILTERS = ['cash', 'card', 'transfer', 'debt'] as const
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number]

// ─────────────────────────────────────────────── kirish (so'rov)

export class SaleItemInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string

  @ApiPropertyOptional({ enum: ProductUnit, description: 'Sotuv birligi; berilmasa — asosiy birlik' })
  @IsOptional()
  @IsIn(Object.values(ProductUnit))
  unit?: ProductUnit

  @ApiProperty({ example: 3, description: '`unit` da, 3 kasrgacha' })
  @IsQty()
  @Min(MIN_QTY)
  qty!: number

  @ApiPropertyOptional({ example: 60_000, description: 'Birlik narx (savdolashish); berilmasa — narx darajasidan' })
  @IsOptional()
  @IsMoney()
  price?: number

  @ApiPropertyOptional({ example: 0, description: 'Qator chegirmasi, so‘m' })
  @IsOptional()
  @IsMoney()
  discount?: number
}

export class PaidDto {
  @ApiProperty({ example: 200_000, description: 'Berilgan naqd (qaytim shundan)' })
  @IsMoney()
  cash!: number

  @ApiProperty({ example: 0 })
  @IsMoney()
  card!: number

  @ApiProperty({ example: 0 })
  @IsMoney()
  transfer!: number
}

export class DeliveryInputDto {
  @ApiProperty({ example: 'Toshkent, Chilonzor 7' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address!: string

  @ApiProperty({ example: '+998901234567' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string

  @ApiPropertyOptional({ example: 15_000, description: 'Chek summasi ICHIDA (I5)' })
  @IsOptional()
  @IsMoney()
  fee?: number

  @ApiPropertyOptional({ example: '2026-09-24', description: 'Berilmasa — chek sanasi' })
  @IsOptional()
  @IsDateOnly()
  scheduledDate?: string

  @ApiPropertyOptional({ example: 41.31 })
  @IsOptional()
  @IsLatitude()
  lat?: number

  @ApiPropertyOptional({ example: 69.24 })
  @IsOptional()
  @IsLongitude()
  lng?: number

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string
}

export class CreateSaleDto {
  @ApiPropertyOptional({ enum: [SaleType.sale], description: 'Faqat `sale`; qaytarish — `POST /sales/:id/return`' })
  @IsOptional()
  @IsIn([SaleType.sale])
  type?: SaleType

  @ApiPropertyOptional({ format: 'uuid', description: 'Nasiyada MAJBURIY (I15)' })
  @IsOptional()
  @IsUUID()
  customerId?: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Berilmasa — joriy foydalanuvchining xodimi' })
  @IsOptional()
  @IsUUID()
  sellerId?: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Berilmasa — joriy ombor' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string

  @ApiPropertyOptional({
    enum: PriceTier,
    default: PriceTier.retail,
    description:
      '`wholesale` — `wholesaleEnabled` bo‘lsa (aks holda chakana). Sotuvchiga — `sellerWholesaleEnabled` bilan, aks holda 403',
  })
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

  @ApiPropertyOptional({ example: 20_000, description: 'Umumiy chegirma, so‘m (`maxDiscountPct` gacha)' })
  @IsOptional()
  @IsMoney()
  discount?: number

  @ApiPropertyOptional({ example: 5_000, description: 'Ishlatiladigan bonus ball (mavjudigacha)' })
  @IsOptional()
  @IsMoney()
  bonusUsed?: number

  @ApiPropertyOptional({ enum: ROUND_STEPS, default: 0 })
  @IsOptional()
  @IsIn(ROUND_STEPS)
  roundTo?: (typeof ROUND_STEPS)[number]

  @ApiPropertyOptional({ type: DeliveryInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryInputDto)
  delivery?: DeliveryInputDto

  @ApiProperty({ type: PaidDto })
  @ValidateNested()
  @Type(() => PaidDto)
  paid!: PaidDto

  @ApiPropertyOptional({ example: '2026-09-23', description: 'Berilmasa — bugun; kelajak sana rad etiladi' })
  @IsOptional()
  @IsDateOnly()
  date?: string

  @ApiPropertyOptional({
    example: 188_600,
    description: 'Mijoz ko‘rsatgan jami — faqat SOLISHTIRILADI; farq bo‘lsa 422 TOTAL_MISMATCH (yozilmaydi)',
  })
  @IsOptional()
  @IsMoney()
  total?: number
}

export class ReturnItemInputDto {
  @ApiProperty({ format: 'uuid', description: 'Asl chek qatori' })
  @IsUUID()
  saleItemId!: string

  @ApiProperty({ example: 1, description: 'Asl qator birligida' })
  @IsQty()
  @Min(MIN_QTY)
  qty!: number
}

export class ReturnSaleDto {
  @ApiProperty({ type: [ReturnItemInputDto], maxItems: MAX_SALE_ITEMS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_SALE_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemInputDto)
  items!: ReturnItemInputDto[]

  @ApiProperty({ example: 'Sifatsiz', maxLength: 500 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string
}

// ─────────────────────────────────────────────── ro'yxat

export const SALE_PAGE_DEFAULT = 50
export const SALE_PAGE_MAX = 200

export class SaleQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string

  @ApiPropertyOptional({ enum: SaleStatus })
  @IsOptional()
  @IsIn(Object.values(SaleStatus))
  status?: SaleStatus

  @ApiPropertyOptional({ enum: SaleType })
  @IsOptional()
  @IsIn(Object.values(SaleType))
  type?: SaleType

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sellerId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Shu chek bo‘yicha qaytarish hujjatlari (`QAYT-…`)' })
  @IsOptional()
  @IsUUID()
  relatedSaleId?: string

  @ApiPropertyOptional({ enum: PAYMENT_FILTERS, description: '`debt` — qolgan qarzi bor cheklar' })
  @IsOptional()
  @IsIn(PAYMENT_FILTERS)
  payment?: PaymentFilter

  @ApiPropertyOptional({ description: 'Chek raqami yoki mijoz nomi' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  q?: string

  @ApiPropertyOptional({ description: 'Oldingi javobdagi `nextCursor`' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string

  @ApiPropertyOptional({ minimum: 1, maximum: SALE_PAGE_MAX, default: SALE_PAGE_DEFAULT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SALE_PAGE_MAX)
  limit: number = SALE_PAGE_DEFAULT
}

export const RECEIPT_FORMATS = ['json', 'pdf'] as const

export class ReceiptQueryDto {
  @ApiPropertyOptional({ enum: RECEIPT_FORMATS, default: 'json' })
  @IsOptional()
  @IsIn(RECEIPT_FORMATS)
  format: (typeof RECEIPT_FORMATS)[number] = 'json'
}

// ─────────────────────────────────────────────── javoblar

export class SalePaidDto {
  @ApiProperty({ example: 200_000, description: 'Berilgan naqd (qaytim bilan)' }) cash!: number
  @ApiProperty({ example: 0 }) card!: number
  @ApiProperty({ example: 0 }) transfer!: number
}

export class SaleItemDto {
  @ApiProperty() id!: string
  @ApiProperty() productId!: string
  @ApiProperty({ example: 'Sement M400', description: 'Snapshot' }) name!: string
  @ApiProperty({ enum: ProductUnit }) unit!: ProductUnit
  @ApiProperty({ example: 3 }) qty!: number
  @ApiProperty({ example: 150, description: 'Asosiy birlikda — ombor shu bo‘yicha (I23)' }) baseQty!: number
  @ApiProperty({ example: 60_000 }) price!: number
  @ApiPropertyOptional({ example: 45_000, description: 'Tannarx snapshot. Sotuvchi rolida yo‘q' }) cost?: number
  @ApiProperty({ example: 0 }) discount!: number
  @ApiProperty({ nullable: true, type: String, description: 'Qaytarishda — asl chek qatori' }) returnOfId!: string | null
  @ApiProperty({
    example: 1,
    description:
      'Shu qatordan qaytarilgani (bekor qilinmagan qaytarishlar), `unit` da. Yana qaytarish mumkin: `qty − returnedQty`. ' +
      'Qaytarish hujjati qatorida va yangi chekda — 0',
  })
  returnedQty!: number
}

export class SaleDeliveryRefDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'pending' }) status!: string
}

export class SaleDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'CHEK-1042' }) number!: string
  @ApiProperty({ enum: SaleType }) type!: SaleType
  @ApiProperty({ enum: SaleStatus }) status!: SaleStatus
  @ApiProperty({ nullable: true, type: String }) customerId!: string | null
  @ApiProperty({ nullable: true, type: String }) sellerId!: string | null
  @ApiProperty({ nullable: true, type: String }) warehouseId!: string | null
  @ApiProperty({ enum: PriceTier }) priceTier!: PriceTier
  @ApiProperty({ example: 180_000 }) subtotal!: number
  @ApiProperty({ example: 25_000, description: 'Umumiy chegirma + ishlatilgan bonus' }) discount!: number
  @ApiProperty({ example: 12 }) taxRate!: number
  @ApiProperty({ example: 18_600 }) tax!: number
  @ApiProperty({ example: 15_000, description: 'Chek summasi ICHIDA (I5)' }) deliveryFee!: number
  @ApiProperty({ example: 188_600 }) total!: number
  @ApiProperty({ type: SalePaidDto }) paid!: SalePaidDto
  @ApiProperty({ example: 11_400 }) change!: number
  @ApiProperty({ example: 0, description: 'Keyinchalik to‘langan (qarz to‘lovi, qaytarish hisobi)' }) debtPaid!: number
  @ApiProperty({ example: 0, description: 'Qolgan qarz — bazada hisoblangan (I13)' }) outstanding!: number
  @ApiProperty({ nullable: true, type: String, example: null }) dueDate!: string | null
  @ApiProperty({ example: '2026-09-23' }) date!: string
  @ApiProperty({ nullable: true, type: String, description: 'Qaytarishda — asl chek' }) relatedSaleId!: string | null
  @ApiProperty({ example: 5_000 }) bonusUsed!: number
  @ApiProperty({ example: 1_886 }) bonusEarned!: number
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) cancelledAt!: Date | null
  @ApiProperty({ type: [SaleItemDto] }) items!: SaleItemDto[]
  @ApiProperty({ type: SaleDeliveryRefDto, nullable: true }) delivery!: SaleDeliveryRefDto | null
}

export class PartyRefDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
}

/** Ro'yxat qatori — qatorlarsiz (ular `GET /sales/:id` da) */
export class SaleListItemDto {
  @ApiProperty() id!: string
  @ApiProperty() number!: string
  @ApiProperty({ enum: SaleType }) type!: SaleType
  @ApiProperty({ enum: SaleStatus }) status!: SaleStatus
  @ApiProperty({ type: PartyRefDto, nullable: true }) customer!: PartyRefDto | null
  @ApiProperty({ type: PartyRefDto, nullable: true }) seller!: PartyRefDto | null
  @ApiProperty({ nullable: true, type: String }) warehouseId!: string | null
  @ApiProperty() subtotal!: number
  @ApiProperty() discount!: number
  @ApiProperty() tax!: number
  @ApiProperty() deliveryFee!: number
  @ApiProperty() total!: number
  @ApiProperty({ type: SalePaidDto }) paid!: SalePaidDto
  @ApiProperty() change!: number
  @ApiProperty() debtPaid!: number
  @ApiProperty({ description: 'Qolgan qarz — SQL’da hisoblangan (I13)' }) outstanding!: number
  @ApiProperty({ nullable: true, type: String }) dueDate!: string | null
  @ApiProperty() date!: string
  @ApiProperty({ nullable: true, type: String }) relatedSaleId!: string | null
  @ApiProperty({ example: 3 }) itemCount!: number
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}

export class SalePageDto {
  @ApiProperty({ type: [SaleListItemDto] }) items!: SaleListItemDto[]
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null
  @ApiProperty() hasMore!: boolean
}

export class ReceiptStoreDto {
  @ApiProperty() name!: string
  @ApiProperty() phone!: string
  @ApiProperty() address!: string
  @ApiProperty() footer!: string
  @ApiProperty({ example: "so'm" }) currency!: string
}

/** Fiskal ma'lumot (08 §8.9): OFD raqam bergach chek QR bilan chop etiladi */
export class ReceiptFiscalDto {
  @ApiProperty({ enum: FiscalStatus, description: '`pending`/`sent` — navbatda (OFD javob bermagan); `failed` — OFD rad etdi' })
  status!: FiscalStatus
  @ApiProperty({ type: String, nullable: true, description: 'OFD bergan fiskal raqam' }) fiscalId!: string | null
  @ApiProperty({ type: String, nullable: true, description: 'Chekdagi QR mazmuni' }) qrPayload!: string | null
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) fiscalizedAt!: Date | null
}

export class ReceiptDto {
  @ApiProperty({ type: ReceiptStoreDto }) store!: ReceiptStoreDto
  @ApiProperty({ type: SaleDto }) sale!: SaleDto
  @ApiProperty({ type: PartyRefDto, nullable: true }) customer!: PartyRefDto | null
  @ApiProperty({ type: PartyRefDto, nullable: true }) seller!: PartyRefDto | null
  @ApiProperty({ type: ReceiptFiscalDto, nullable: true, description: '`OFD_ENABLED=false` da — `null`' })
  fiscal!: ReceiptFiscalDto | null
}
