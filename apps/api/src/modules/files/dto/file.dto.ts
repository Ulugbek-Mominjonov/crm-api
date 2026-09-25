import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { FileKind, FileStatus } from '@prisma/client'
import { Transform } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator'
import { Trim } from '@/common/validation/decorators'

export const VARIANTS = ['orig', '128', '512'] as const
export type Variant = (typeof VARIANTS)[number]

export class PresignDto {
  @ApiProperty({ enum: FileKind })
  @IsIn(Object.values(FileKind))
  kind!: FileKind

  @ApiProperty({ example: 'image/webp', description: 'Oq ro‘yxatdan (09 §9.6)' })
  @IsString()
  @MaxLength(100)
  mime!: string

  @ApiProperty({ example: 153_600, description: 'Bayt — imzoga kiradi' })
  @IsInt()
  @Min(1)
  size!: number

  @ApiProperty({ example: 'ab12…', description: 'Tarkib SHA-256 (hex) — takror yuklashni aniqlash' })
  @Matches(/^[0-9a-f]{64}$/, { message: 'sha256 — 64 ta kichik hex belgi' })
  sha256!: string

  @ApiPropertyOptional({ example: 'sement.webp', maxLength: 200 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  originalName?: string
}

export class RawQueryDto {
  @ApiPropertyOptional({ enum: VARIANTS, default: 'orig', description: 'Variant tayyor bo‘lmasa — `orig`' })
  @IsOptional()
  @IsIn(VARIANTS)
  variant: Variant = 'orig'
}

/** Bir so'rovda ko'pi bilan — katalog sahifasi (50) va POS kartochkalari sig'adi */
export const MAX_URL_BATCH = 100

export class FileUrlsQueryDto {
  @ApiProperty({ type: String, example: '0199…,0199…', description: `Vergul bilan, ko‘pi bilan ${MAX_URL_BATCH} ta` })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? [...new Set(value.split(',').filter(Boolean))] : value))
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_URL_BATCH)
  @IsUUID('all', { each: true })
  ids!: string[]

  @ApiPropertyOptional({ enum: VARIANTS, default: '128', description: 'Variant tayyor bo‘lmasa — `orig`' })
  @IsOptional()
  @IsIn(VARIANTS)
  variant: Variant = '128'
}

export class FileUrlsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    description: 'Fayl id → imzolangan havola. Yo‘q, tayyor bo‘lmagan yoki huquq yetmagan fayl — ro‘yxatda yo‘q',
  })
  urls!: Record<string, string>

  @ApiProperty({ type: String, format: 'date-time', description: 'Havolalar shu paytgacha amal qiladi' })
  expiresAt!: Date
}

export class FileDto {
  @ApiProperty() id!: string
  @ApiProperty({ enum: FileKind }) kind!: FileKind
  @ApiProperty() mime!: string
  @ApiProperty() sizeBytes!: number
  @ApiProperty() sha256!: string
  @ApiProperty({ nullable: true, type: String }) originalName!: string | null
  @ApiProperty({ enum: FileStatus }) status!: FileStatus
  @ApiProperty({ type: [String], example: ['128', '512'], description: 'Tayyor rasm variantlari' }) variants!: string[]
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}

export class UploadTargetDto {
  @ApiProperty({ description: 'Imzolangan PUT havolasi (≤ 10 daqiqa)' }) url!: string
  @ApiProperty({ example: 'PUT' }) method!: 'PUT'
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { 'Content-Type': 'image/webp' },
    description: 'Aynan shu sarlavhalar bilan yuborilsin',
  })
  headers!: Record<string, string>
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date
}

export class PresignResultDto {
  @ApiProperty({ type: FileDto }) file!: FileDto
  @ApiProperty({ description: 'Shu tarkib allaqachon bor — yuklash shart emas (09 §9.9)' }) reused!: boolean
  @ApiProperty({ type: UploadTargetDto, nullable: true }) upload!: UploadTargetDto | null
}

export class UsageDto {
  @ApiProperty() usedBytes!: number
  @ApiProperty() limitBytes!: number
  @ApiProperty({ type: 'object', additionalProperties: { type: 'number' }, description: 'tur → bayt' })
  byKind!: Record<string, number>
}
