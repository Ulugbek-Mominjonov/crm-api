import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ProductUnit } from '@prisma/client'
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional,
  IsString, IsUUID, MaxLength, Min, ValidateIf,
} from 'class-validator'
import { IsMoney, IsQty, Trim, TrimToNull } from '@/common/validation/decorators'
import { altUnitGiven, MIN_ALT_FACTOR, UNITS } from './product.dto'

/** Bitta importda ko'pi bilan (04-api §2) */
export const MAX_IMPORT_ROWS = 5_000
/** Ommaviy narx: diff audit'da saqlanadi — hajm cheklangan */
export const MAX_BULK_PRICE_IDS = 1_000

export const IMPORT_MODES = ['create', 'upsert'] as const
export type ImportMode = (typeof IMPORT_MODES)[number]

/**
 * Import qatori. Butun so'rov emas, HAR QATOR alohida tekshiriladi:
 * xato qator hisobotga tushadi, to'g'rilari saqlanadi.
 */
export class ProductImportRowDto {
  @ApiProperty({ example: 'Sement M400 (50 kg)' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string

  @ApiProperty({ example: 'SEM-400-50', description: '`upsert` rejimida shu bo‘yicha topiladi' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  sku!: string

  @ApiPropertyOptional({ type: String, example: '4780000000011' })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(64)
  barcode?: string | null

  @ApiPropertyOptional({ type: String, example: 'Sement va aralashmalar', description: 'Kategoriya NOMI; yo‘q bo‘lsa yaratiladi' })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(60)
  category?: string | null

  @ApiProperty({ enum: ProductUnit })
  @IsIn(UNITS)
  unit!: ProductUnit

  @ApiProperty({ example: 62_000 })
  @IsMoney()
  price!: number

  @ApiPropertyOptional({ example: 58_000, description: 'Berilmasa — yangi mahsulotda chakana narx' })
  @IsOptional()
  @IsMoney()
  wholesalePrice?: number

  @ApiPropertyOptional({ example: 52_000, description: 'Berilmasa — yangi mahsulotda 0' })
  @IsOptional()
  @IsMoney()
  cost?: number

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsQty()
  minStock?: number

  @ApiPropertyOptional({ enum: ProductUnit })
  @ValidateIf(altUnitGiven)
  @IsIn(UNITS)
  altUnit?: ProductUnit | null

  @ApiPropertyOptional({ type: Number, example: 50 })
  @ValidateIf(altUnitGiven)
  @IsQty()
  @Min(MIN_ALT_FACTOR)
  altFactor?: number | null
}

export class ImportProductsDto {
  @ApiProperty({ type: [ProductImportRowDto], maxItems: MAX_IMPORT_ROWS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  // Qatorlar bu yerda ATAYLAB chuqur tekshirilmaydi: bitta xato qator
  // butun importni 400 bilan yiqitmasin — servis har qatorni alohida tekshiradi
  @IsObject({ each: true })
  rows!: Record<string, unknown>[]

  @ApiPropertyOptional({
    enum: IMPORT_MODES,
    default: 'create',
    description: '`create` — faqat yangi; `upsert` — SKU bo‘yicha mavjudini yangilaydi',
  })
  @IsOptional()
  @IsIn(IMPORT_MODES)
  mode: ImportMode = 'create'
}

export class ImportRowErrorDto {
  @ApiProperty({ example: 15, description: '`rows` massividagi tartib raqami (1 dan)' }) row!: number
  @ApiProperty({ example: 'DUPLICATE_SKU' }) code!: string
  @ApiProperty({ example: 'SEM-400' }) detail!: string
}

export class ImportResultDto {
  @ApiProperty({ example: 148 }) created!: number
  @ApiProperty({ example: 0 }) updated!: number
  @ApiProperty({ example: 2, description: 'Saqlanmagan qatorlar (`errors` soni)' }) skipped!: number
  @ApiProperty({ example: 1, description: 'Import davomida yaratilgan kategoriyalar' }) categoriesCreated!: number
  @ApiProperty({ type: [ImportRowErrorDto] }) errors!: ImportRowErrorDto[]
}

export const PRICE_TARGETS = ['price', 'wholesalePrice'] as const
export type PriceTarget = (typeof PRICE_TARGETS)[number]

export const PRICE_MODES = ['percent', 'fixed', 'set'] as const
export type PriceMode = (typeof PRICE_MODES)[number]

export class BulkPriceDto {
  @ApiProperty({ type: [String], format: 'uuid', maxItems: MAX_BULK_PRICE_IDS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BULK_PRICE_IDS)
  @IsUUID('all', { each: true })
  ids!: string[]

  @ApiProperty({
    enum: PRICE_MODES,
    description: '`percent` — foizga (−100…1000), `fixed` — so‘mga (±), `set` — aniq narx',
  })
  @IsIn(PRICE_MODES)
  mode!: PriceMode

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  value!: number

  @ApiProperty({ enum: PRICE_TARGETS, description: 'Tannarx bu yerda o‘zgarmaydi — u kirimda hisoblanadi (I11)' })
  @IsIn(PRICE_TARGETS)
  target!: PriceTarget
}

export class BulkPriceResultDto {
  @ApiProperty({ example: 12, description: 'Yangilangan mahsulotlar (topilmagan id’lar sanalmaydi)' })
  updated!: number
}
