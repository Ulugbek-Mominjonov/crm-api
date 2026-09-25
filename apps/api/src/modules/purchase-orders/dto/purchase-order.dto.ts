import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { PayMethod, POStatus, ProductUnit } from '@prisma/client'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested,
} from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { IsDateOnly, IsMoney, IsQty, MIN_QTY, Trim } from '@/common/validation/decorators'

/** Bitta buyurtmada ko'pi bilan */
export const MAX_PO_ITEMS = 500

export class PoItemInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string

  @ApiProperty({ example: 100, description: 'ASOSIY birlikda' })
  @IsQty()
  @Min(MIN_QTY)
  qty!: number

  @ApiProperty({ example: 40_000, description: 'Birlik tannarx (kirim narxi)' })
  @IsMoney()
  cost!: number
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  supplierId!: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Qabul ombori; berilmasa — qabul paytidagi joriy ombor' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string

  @ApiProperty({ type: [PoItemInputDto], maxItems: MAX_PO_ITEMS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PO_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => PoItemInputDto)
  items!: PoItemInputDto[]

  @ApiPropertyOptional({ example: '2026-09-23', description: 'Berilmasa — bugun' })
  @IsOptional()
  @IsDateOnly()
  date?: string

  @ApiPropertyOptional({ example: '2026-10-23', description: 'Berilmasa — ta’minotchi to‘lov muddatidan' })
  @IsOptional()
  @IsDateOnly()
  dueDate?: string

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  note?: string
}

export class UpdatePurchaseOrderDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string

  @ApiPropertyOptional({ type: [PoItemInputDto], description: 'Berilsa — qatorlar TO‘LIQ almashtiriladi' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PO_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => PoItemInputDto)
  items?: PoItemInputDto[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateOnly()
  dueDate?: string

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  note?: string
}

export class ReceiveItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  poItemId!: string

  @ApiProperty({ example: 7 })
  @IsQty()
  @Min(MIN_QTY)
  qty!: number
}

export class ReceivePurchaseOrderDto {
  @ApiPropertyOptional({ type: [ReceiveItemDto], description: 'Berilmasa — qolgan HAMMASI qabul qilinadi' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PO_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items?: ReceiveItemDto[]
}

export class PayPurchaseOrderDto {
  @ApiProperty({ example: 400_000 })
  @IsMoney()
  @Min(1)
  amount!: number

  @ApiProperty({ enum: PayMethod, description: '`cash` — kassadan chiqadi (ochiq smena shart)' })
  @IsIn(Object.values(PayMethod))
  method!: PayMethod
}

export class PurchaseOrderQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: POStatus })
  @IsOptional()
  @IsIn(Object.values(POStatus))
  status?: POStatus

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Buyurtma sanasi — shu kundan' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Buyurtma sanasi — shu kun ham' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string
}

export class PurchaseOrderSummaryDto {
  @ApiProperty({ example: 1_200_000, description: 'Ta’minotchilarga jami qarz (kelgan tovar uchun, I18)' }) outstanding!: number
  @ApiProperty({ example: 3, description: 'Kutilayotgan (`ordered`) buyurtmalar' }) openOrders!: number
  @ApiProperty({ example: 5_400_000, description: 'Joriy oy buyurtmalari (bekor qilinganlarsiz)' }) monthTotal!: number
  @ApiProperty({ example: 9_800_000, description: 'To‘liq qabul qilingan buyurtmalar summasi' }) receivedTotal!: number
}

export class PoItemDto {
  @ApiProperty() id!: string
  @ApiProperty() productId!: string
  @ApiProperty() name!: string
  @ApiProperty() qty!: number
  @ApiProperty({ description: 'Qabul qilingan (I19: buyurtmadan oshmaydi)' }) receivedQty!: number
  @ApiProperty({ enum: ProductUnit, description: 'Mahsulotning asosiy birligi' }) unit!: ProductUnit
  @ApiPropertyOptional({ description: 'Birlik tannarx. Sotuvchi rolida yo‘q' }) cost?: number
}

export class PoSupplierRefDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
}

export class PurchaseOrderDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'BUY-1001' }) number!: string
  @ApiProperty({ type: PoSupplierRefDto }) supplier!: PoSupplierRefDto
  @ApiProperty({ nullable: true, type: String }) warehouseId!: string | null
  @ApiProperty({ enum: POStatus }) status!: POStatus
  @ApiProperty() total!: number
  @ApiProperty({ description: 'Kelgan tovar qiymati' }) receivedValue!: number
  @ApiProperty() paid!: number
  @ApiProperty({ description: 'Ta’minotchiga qarz — faqat kelgan tovar uchun (I18)' }) outstanding!: number
  @ApiProperty() date!: string
  @ApiProperty({ nullable: true, type: String }) receivedDate!: string | null
  @ApiProperty({ nullable: true, type: String }) dueDate!: string | null
  @ApiProperty({ nullable: true, type: String }) note!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: [PoItemDto] }) items!: PoItemDto[]
}

export class PurchaseOrderPageDto {
  @ApiProperty({ type: [PurchaseOrderDto] }) items!: PurchaseOrderDto[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() pageCount!: number
}

export class SupplierPaymentDto {
  @ApiProperty() id!: string
  @ApiProperty() poId!: string
  @ApiProperty() amount!: number
  @ApiProperty({ enum: PayMethod }) method!: PayMethod
  @ApiProperty() date!: string
  @ApiProperty({ nullable: true, type: String }) shiftId!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}

export class PoPaymentResultDto {
  @ApiProperty({ type: SupplierPaymentDto }) payment!: SupplierPaymentDto
  @ApiProperty({ type: PurchaseOrderDto }) order!: PurchaseOrderDto
}
