import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { MovementType, ProductUnit } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator'
import { IsDateOnly, IsMoney, IsQty, MIN_QTY, Trim } from '@/common/validation/decorators'
/** Bir inventarizatsiyada ko'pi bilan — katta ombor bir necha so'rovda sanaladi */
export const MAX_ADJUST_ITEMS = 500

// ─────────────────────────────────────────────── kirish (so'rov)

export class IntakeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Berilmasa — joriy ombor' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string

  @ApiProperty({ example: 50, description: 'ASOSIY birlikda, 3 kasrgacha' })
  @IsQty()
  @Min(MIN_QTY)
  qty!: number

  @ApiPropertyOptional({ example: 42_000, description: 'Kirim narxi, butun so‘m — o‘rtacha tannarx qayta hisoblanadi (I11)' })
  @IsOptional()
  @IsMoney()
  @Min(1)
  unitCost?: number

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string

  @ApiPropertyOptional({ example: 'Hujjat 4512', maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string
}

export class WriteoffDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Berilmasa — joriy ombor' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string

  @ApiProperty({ example: 2, description: 'ASOSIY birlikda, 3 kasrgacha' })
  @IsQty()
  @Min(MIN_QTY)
  qty!: number

  @ApiProperty({ example: 'Namlikdan yaroqsiz', description: 'Sabab MAJBURIY', maxLength: 500 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string
}

export class AdjustItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string

  @ApiProperty({ example: 118, description: 'SANALGAN miqdor (asosiy birlikda)' })
  @IsQty()
  countedQty!: number
}

export class AdjustDto {
  @ApiProperty({ type: [AdjustItemDto], maxItems: MAX_ADJUST_ITEMS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ADJUST_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => AdjustItemDto)
  items!: AdjustItemDto[]

  @ApiPropertyOptional({ format: 'uuid', description: 'Berilmasa — joriy ombor' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string

  @ApiPropertyOptional({ example: 'Oylik inventarizatsiya', maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string
}

export class TransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fromWarehouseId!: string

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  toWarehouseId!: string

  @ApiProperty({ example: 30 })
  @IsQty()
  @Min(MIN_QTY)
  qty!: number

  @ApiPropertyOptional({ example: 'Skladdan zalga', maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string
}

// ─────────────────────────────────────────────── javoblar

export class ProductStockDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Sement M400' }) name!: string
  @ApiProperty({ example: 170.5, description: 'JAMI qoldiq' }) stock!: number
  @ApiPropertyOptional({ example: 40_588, description: 'O‘rtacha tannarx (I11)' }) cost?: number
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' }, description: 'omborId → miqdor' })
  stocks!: Record<string, number>
}

export class StockOperationResultDto {
  @ApiProperty() movementId!: string
  @ApiProperty({ type: ProductStockDto }) product!: ProductStockDto
}

export class TransferResultDto {
  @ApiProperty() outMovementId!: string
  @ApiProperty() inMovementId!: string
  @ApiProperty({ type: ProductStockDto }) product!: ProductStockDto
}

export class AdjustedLineDto {
  @ApiProperty() productId!: string
  @ApiProperty() movementId!: string
  @ApiProperty({ example: -2, description: 'Farq: sanalgan − hisobdagi' }) delta!: number
  @ApiProperty({ example: 118 }) balanceAfter!: number
}

export class AdjustResultDto {
  @ApiProperty({ type: [AdjustedLineDto] }) adjusted!: AdjustedLineDto[]
  @ApiProperty({ example: 3, description: 'Farqi 0 bo‘lgan qatorlar — harakat yozilmadi' }) unchanged!: number
}

// ─────────────────────────────────────────────── jurnal

export const MOVEMENT_PAGE_DEFAULT = 50
export const MOVEMENT_PAGE_MAX = 200

export class MovementQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string

  @ApiPropertyOptional({ enum: MovementType })
  @IsOptional()
  @IsIn(Object.values(MovementType))
  type?: MovementType

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string

  @ApiPropertyOptional({ description: 'Mahsulot nomi yoki izoh bo‘yicha' })
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

  @ApiPropertyOptional({ minimum: 1, maximum: MOVEMENT_PAGE_MAX, default: MOVEMENT_PAGE_DEFAULT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MOVEMENT_PAGE_MAX)
  limit: number = MOVEMENT_PAGE_DEFAULT
}

export class MovementDto {
  @ApiProperty() id!: string
  @ApiProperty() productId!: string
  @ApiProperty({ description: 'Nom snapshot — tovar arxivlansa ham tarix o‘qiladi' }) productName!: string
  @ApiProperty({ enum: MovementType }) type!: MovementType
  @ApiProperty({ example: -3, description: 'Ishorali: + kirim, − chiqim (asosiy birlikda)' }) qty!: number
  @ApiProperty({ example: 97, description: 'Shu harakatdan keyingi qoldiq — AYNAN shu omborda' }) balanceAfter!: number
  @ApiProperty() warehouseId!: string
  @ApiProperty({ nullable: true, type: String }) counterWarehouseId!: string | null
  @ApiProperty({ example: '2026-09-23' }) date!: string
  @ApiProperty({ nullable: true, type: String }) note!: string | null
  @ApiProperty({ nullable: true, type: String }) supplierId!: string | null
  @ApiPropertyOptional({ nullable: true, type: Number, description: 'Kirim narxi. Sotuvchi rolida yo‘q' }) unitCost?: number | null
  @ApiProperty({ nullable: true, type: String, description: 'Bog‘liq hujjat (chek, buyurtma)' }) refId!: string | null
  @ApiProperty({ nullable: true, type: String }) userId!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}

export class MovementPageDto {
  @ApiProperty({ type: [MovementDto] }) items!: MovementDto[]
  @ApiProperty({ nullable: true, type: String }) nextCursor!: string | null
  @ApiProperty() hasMore!: boolean
}

// ─────────────────────────────────────────────── buyurtma taklifi

export class SupplierRefDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Bekabad Sement' }) name!: string
}

export class ReorderItemDto {
  @ApiProperty() productId!: string
  @ApiProperty() name!: string
  @ApiProperty() sku!: string
  @ApiProperty({ enum: ProductUnit }) unit!: ProductUnit
  @ApiProperty({ example: 10 }) stock!: number
  @ApiProperty({ example: 40 }) minStock!: number
  @ApiProperty({ example: 70, description: '`max(minStock×2 − stock, minStock)` — shared/reorder' }) suggestedQty!: number
  @ApiPropertyOptional({ example: 52_000, description: 'Tannarx. Sotuvchi rolida yo‘q' }) cost?: number
}

export class ReorderGroupDto {
  @ApiProperty({ type: SupplierRefDto, nullable: true, description: 'null — ta’minotchisi belgilanmagan' })
  supplier!: SupplierRefDto | null
  @ApiProperty({ type: [ReorderItemDto] }) items!: ReorderItemDto[]
}
