import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ExportStatus } from '@prisma/client'
import { IsIn, IsOptional } from 'class-validator'
import { IsDateOnly } from '@/common/validation/decorators'
import { EXPORT_RESOURCE_NAMES, type ExportResourceName } from '../export-resources'

export const EXPORT_FORMATS = ['csv', 'json'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export class ExportParamsDto {
  @ApiProperty({ enum: EXPORT_RESOURCE_NAMES })
  @IsIn(EXPORT_RESOURCE_NAMES)
  resource!: ExportResourceName
}

export class ExportQueryDto {
  @ApiPropertyOptional({ enum: EXPORT_FORMATS, default: 'csv', description: 'CSV — UTF-8 BOM bilan (Excel)' })
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format: ExportFormat = 'csv'

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Sanali ro‘yxatlar uchun (sotuv, harakat, xarajat)' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string
}

export class ExportJobDto {
  @ApiProperty() id!: string
  @ApiProperty({ enum: EXPORT_RESOURCE_NAMES }) resource!: string
  @ApiProperty({ enum: EXPORT_FORMATS }) format!: string
  @ApiProperty({ enum: ExportStatus }) status!: ExportStatus
  @ApiProperty({ nullable: true, type: Number }) rowCount!: number | null
  @ApiProperty({ nullable: true, type: String, description: 'Tayyor bo‘lsa — fayl id’si' })
  fileId!: string | null
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Tayyor bo‘lsa — imzolangan yuklab olish havolasi (`attachment`). Token talab qilmaydi: brauzerda ' +
      '`window.location` bilan oching (CORS’ga bog‘liq emas). Eskirsa — ishni qayta so‘rang',
  })
  url!: string | null
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: '`url` shu paytgacha amal qiladi' })
  expiresAt!: Date | null
  @ApiProperty({ nullable: true, type: String }) error!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) finishedAt!: Date | null
}
