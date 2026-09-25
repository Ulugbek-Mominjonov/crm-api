import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize, IsArray, IsEmail, IsIn, IsInt, IsISO8601, IsObject, IsOptional, IsString, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator'
import { Trim } from '@/common/validation/decorators'

/** Qabul qilinadigan eng eski va joriy store versiyasi (07 §7.10) */
export const MIN_SNAPSHOT_VERSION = 12
export const CURRENT_SNAPSHOT_VERSION = 15
const ROLES = ['admin', 'manager', 'sotuvchi', 'omborchi'] as const
/** Brauzerdagi demo foydalanuvchilar — parolsiz (07 §7.3) */
const MAX_USERS = 100

export class MigrationUserDto {
  @ApiProperty({ example: 'Vali Karimov', maxLength: 120 })
  @Trim()
  @IsString()
  @MaxLength(120)
  name!: string

  @ApiProperty({ example: 'vali@dokon.uz' })
  @Trim()
  @IsEmail()
  @MaxLength(254)
  email!: string

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role!: (typeof ROLES)[number]
}

/**
 * localStorage nusxasi (07 §7.3, 3-qadam). `data` — brauzerdagi
 * `CrmSnapshot` (+ `categories`); shakli servisda yozuvma-yozuv
 * tekshiriladi: buzuq yozuv butun so'rovni yiqitmaydi, hisobotga tushadi.
 */
export class MigrationDto {
  @ApiProperty({ example: 'localStorage' })
  @IsIn(['localStorage'])
  source!: 'localStorage'

  @ApiProperty({ example: CURRENT_SNAPSHOT_VERSION, minimum: MIN_SNAPSHOT_VERSION, maximum: CURRENT_SNAPSHOT_VERSION })
  @IsInt()
  @Min(MIN_SNAPSHOT_VERSION)
  @Max(CURRENT_SNAPSHOT_VERSION)
  version!: number

  @ApiPropertyOptional({ example: '2026-08-06T09:00:00Z' })
  @IsOptional()
  @IsISO8601()
  exportedAt?: string

  @ApiProperty({ type: 'object', additionalProperties: true, description: 'Brauzerdagi `CrmSnapshot`' })
  @IsObject()
  data!: Record<string, unknown>

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Brauzer sozlamalari (`Settings`)' })
  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>

  @ApiPropertyOptional({ type: [MigrationUserDto], description: 'Parolsiz — server vaqtinchalik parol beradi' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_USERS)
  @ValidateNested({ each: true })
  @Type(() => MigrationUserDto)
  users?: MigrationUserDto[]
}

export class MigrationIssueDto {
  @ApiProperty({ enum: ['error', 'warning'], description: '`error` — yozuv o‘tkazib yuborildi; `warning` — tuzatildi' })
  severity!: 'error' | 'warning'
  @ApiProperty({ example: 'sale' }) entity!: string
  @ApiPropertyOptional({ example: 'sa_x1', description: 'Brauzerdagi id' }) id?: string
  @ApiProperty({ example: 'MISSING_PRODUCT' }) code!: string
  @ApiPropertyOptional({ example: 'pr_zzz topilmadi' }) detail?: string
}

export class TemporaryPasswordDto {
  @ApiProperty() email!: string
  @ApiProperty({ description: 'Bir martalik — birinchi kirishda almashtirilsin' }) password!: string
}

export class MigrationReportDto {
  @ApiProperty({ description: 'Xato (o‘tkazib yuboriladigan yozuv) yo‘q' }) valid!: boolean
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' }, description: 'Nusxadagi yozuvlar soni' })
  counts!: Record<string, number>
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' }, description: 'Yoziladigan (yozilgan) yozuvlar' })
  accepted!: Record<string, number>
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' }, description: 'Serverda allaqachon bor ma’lumot (takroriy import ogohlantirishi)' })
  existing!: Record<string, number>
  @ApiProperty({ type: [MigrationIssueDto] }) issues!: MigrationIssueDto[]
}

export class MigrationResultDto extends MigrationReportDto {
  @ApiProperty({ type: [TemporaryPasswordDto] }) users!: TemporaryPasswordDto[]
}
