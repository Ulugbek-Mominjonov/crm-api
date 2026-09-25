import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { ProductUnit, type Prisma } from '@prisma/client'
import {
  IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateIf,
} from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { byField, sortValues, type SortMap } from '@/common/crud/sort'
import { IsMoney, IsQty, ToBoolean, Trim, TrimToNull } from '@/common/validation/decorators'

export const PRODUCT_SORT = {
  id: byField('id'),
  name: byField('name'),
  sku: byField('sku'),
  price: byField('price'),
  stock: byField('stock'),
  createdAt: byField('createdAt'),
} satisfies SortMap<Prisma.ProductOrderByWithRelationInput>

export const UNITS = Object.values(ProductUnit)
/** Qo'shimcha birlik koeffitsiyenti musbat (1 qop = 50 kg) */
export const MIN_ALT_FACTOR = 0.001

/**
 * Qo'shimcha birlik (`altUnit`) va koeffitsiyent (`altFactor`) faqat
 * BIRGA beriladi: biri bo'lsa, ikkinchisi ham tekshiriladi.
 */
export const altUnitGiven = (o: { altUnit?: unknown; altFactor?: unknown }): boolean =>
  [o.altUnit, o.altFactor].some((v) => v !== null && v !== undefined)

export class ProductDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Portland sement M400' }) name!: string
  @ApiProperty({ example: 'SEM-400' }) sku!: string
  @ApiProperty({ example: '4780000000011', nullable: true, type: String }) barcode!: string | null
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) categoryId!: string | null
  @ApiProperty({ nullable: true, type: String, format: 'uuid' }) supplierId!: string | null
  @ApiProperty({ enum: ProductUnit, example: 'qop' }) unit!: ProductUnit
  @ApiProperty({ example: 60_000, description: 'Chakana narx, butun so‘m' }) price!: number
  @ApiPropertyOptional({ example: 55_000, description: 'Ulgurji narx, butun so‘m. Sotuvchi rolida yo‘q' })
  wholesalePrice?: number
  @ApiPropertyOptional({ example: 40_000, description: 'O‘rtacha tannarx, butun so‘m. Sotuvchi rolida yo‘q' })
  cost?: number
  @ApiProperty({ example: 120.5, description: 'JAMI qoldiq, asosiy birlikda (3 kasr)' }) stock!: number
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: { '0190a7a0-…': 80.5, '0190a7a1-…': 40 },
    description: 'Ombor bo‘yicha taqsimot: omborId → miqdor',
  })
  stocks!: Record<string, number>
  @ApiPropertyOptional({ example: 80.5, description: 'Faqat `warehouseId` filtri berilganda: shu ombordagi qoldiq' })
  warehouseStock?: number
  @ApiProperty({ example: 20, description: 'Kam qolgan chegarasi (3 kasr)' }) minStock!: number
  @ApiProperty() archived!: boolean
  @ApiProperty({ enum: ProductUnit, nullable: true, example: 'kg' }) altUnit!: ProductUnit | null
  @ApiProperty({ nullable: true, type: Number, example: 50, description: '1 altUnit = altFactor × unit' })
  altFactor!: number | null
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Rasm: `GET /files/{imageFileId}/raw?variant=128|512|orig`',
  })
  imageFileId!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: String, format: 'date-time', description: 'Versiya — tahrirda `If-Match` ga qo‘yiladi' })
  updatedAt!: Date
}

/**
 * Mahsulot yaratish. QOLDIQ bu yerda YO'Q: u faqat ombor amallari
 * (kirim, chiqim, inventarizatsiya) orqali o'zgaradi — harakatlar jurnali
 * va tannarx hisobi buzilmasin (I1, I11).
 */
export class CreateProductDto {
  @ApiProperty({ example: 'Portland sement M400', maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string

  @ApiProperty({ example: 'SEM-400', maxLength: 64, description: 'Do‘kon ichida noyob' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku!: string

  @ApiPropertyOptional({ type: String, example: '4780000000011', maxLength: 64, nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(64)
  barcode?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null

  @ApiPropertyOptional({ type: String, nullable: true, format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string | null

  @ApiProperty({ enum: ProductUnit })
  @IsIn(UNITS)
  unit!: ProductUnit

  @ApiProperty({ example: 60_000, description: 'Butun so‘m' })
  @IsMoney()
  price!: number

  @ApiProperty({ example: 55_000, description: 'Butun so‘m' })
  @IsMoney()
  wholesalePrice!: number

  @ApiProperty({ example: 40_000, description: 'Butun so‘m' })
  @IsMoney()
  cost!: number

  @ApiPropertyOptional({ example: 20, description: '3 kasr xonagacha' })
  @IsOptional()
  @IsQty()
  minStock?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean

  @ApiPropertyOptional({ enum: ProductUnit, nullable: true, description: '`altFactor` bilan birga beriladi' })
  @ValidateIf(altUnitGiven)
  @IsIn(UNITS)
  altUnit?: ProductUnit | null

  @ApiPropertyOptional({ type: Number, example: 50, nullable: true, description: '`altUnit` bilan birga beriladi' })
  @ValidateIf(altUnitGiven)
  @IsQty()
  @Min(MIN_ALT_FACTOR)
  altFactor?: number | null

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'uuid',
    description: 'Tasdiqlangan (`ready`) `product_image` fayli; `null` — rasmni olib tashlash',
  })
  @IsOptional()
  @IsUUID()
  imageFileId?: string | null
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: sortValues(PRODUCT_SORT), default: 'name' })
  @IsOptional()
  @IsIn(sortValues(PRODUCT_SORT))
  sort?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supplierId?: string

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Faqat shu omborda qoldig‘i bor tovarlar; har birida `warehouseStock` qaytadi',
  })
  @IsOptional()
  @IsUUID()
  warehouseId?: string

  @ApiPropertyOptional({ description: 'Faqat kam qolganlar: qoldiq ≤ minimal' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  lowStock?: boolean

  @ApiPropertyOptional({ default: false, description: '`true` — faqat arxivlanganlar' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  archived?: boolean
}

export class CategoryValueDto {
  @ApiProperty({ example: 'Sement va aralashmalar', description: 'Kategoriyasizlar — bo‘sh satr' }) name!: string
  @ApiProperty({ example: 12_400_000 }) value!: number
}

export class ProductSummaryDto {
  @ApiProperty({ example: 137, description: 'Faol (arxivlanmagan) mahsulot turlari' }) active!: number
  @ApiProperty({ example: 6, description: 'Kam qolganlar: qoldiq ≤ minimal' }) lowStock!: number
  @ApiPropertyOptional({ example: 84_500_000, description: 'Ombor qiymati tannarxda. Sotuvchi rolida yo‘q' }) stockValue?: number
  @ApiPropertyOptional({ type: [CategoryValueDto], description: 'Ombor qiymati kategoriyalar bo‘yicha (eng kattasi 8 ta). Sotuvchi rolida yo‘q' })
  stockValueByCategory?: CategoryValueDto[]
}

export class ProductStatsDto {
  @ApiProperty({ example: 340.5, description: 'Sof sotilgan miqdor, asosiy birlikda: sotuv − qaytarish (bekor qilinganlarsiz)' }) soldQty!: number
  @ApiProperty({ type: String, nullable: true, format: 'date', description: 'Oxirgi sotuv kuni' }) lastSale!: string | null
}
