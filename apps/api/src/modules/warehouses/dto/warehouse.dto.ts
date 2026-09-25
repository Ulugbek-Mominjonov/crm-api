import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import type { Prisma } from '@prisma/client'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { byField, sortValues, type SortMap } from '@/common/crud/sort'
import { ToBoolean, Trim } from '@/common/validation/decorators'

/** Saralash oq ro'yxati. Sukut `createdAt`: sukut ombor birinchi yaratilgan */
export const WAREHOUSE_SORT = {
  id: byField('id'),
  name: byField('name'),
  createdAt: byField('createdAt'),
} satisfies SortMap<Prisma.WarehouseOrderByWithRelationInput>

export class WarehouseDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Asosiy ombor' }) name!: string
  @ApiProperty({ example: 'Toshkent, Chilonzor 5', nullable: true, type: String }) address!: string | null
  @ApiProperty({ description: 'Sukut ombor — arxivlab bo‘lmaydi' }) isDefault!: boolean
  @ApiProperty() archived!: boolean
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: String, format: 'date-time', description: 'Versiya — tahrirda `If-Match` ga qo‘yiladi' })
  updatedAt!: Date
}

export class StockWarningDto {
  @ApiProperty({ example: 3, description: 'Omborda qoldig‘i bor mahsulotlar soni' })
  productCount!: number
}

export class ArchivedWarehouseDto extends WarehouseDto {
  @ApiProperty({
    type: StockWarningDto,
    nullable: true,
    description: 'Arxivlangan omborda tovar qolgan bo‘lsa — ogohlantirish (amal bekor qilinmaydi)',
  })
  stockWarning!: StockWarningDto | null
}

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Sklad №2', maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string

  @ApiPropertyOptional({ type: String, example: 'Toshkent, Sergeli 12', maxLength: 200, nullable: true })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  address?: string | null
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}

export class WarehouseListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: sortValues(WAREHOUSE_SORT), default: 'createdAt' })
  @IsOptional()
  @IsIn(sortValues(WAREHOUSE_SORT))
  sort?: string

  @ApiPropertyOptional({ description: 'Berilmasa — hammasi (arxivlanganlari ham)' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  archived?: boolean
}

export class WarehouseStockDto {
  @ApiProperty({ format: 'uuid' }) warehouseId!: string
  @ApiProperty({ example: 84, description: 'Qoldig‘i bor mahsulot turlari' }) productCount!: number
  @ApiPropertyOptional({ example: 45_200_000, description: 'Tovar qiymati tannarxda. Sotuvchi rolida yo‘q' }) stockValue?: number
}
