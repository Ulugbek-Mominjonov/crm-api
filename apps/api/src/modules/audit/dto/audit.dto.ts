import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator'
import { IsDateOnly, Trim } from '@/common/validation/decorators'

export const AUDIT_PAGE_DEFAULT = 50
export const AUDIT_PAGE_MAX = 200

export class AuditQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Kim qilgan (foydalanuvchi)' })
  @IsOptional()
  @IsUUID()
  userId?: string

  @ApiPropertyOptional({ example: 'sale', description: 'Amal guruhi — `sale.create`, `sale.cancel` … hammasi' })
  @IsOptional()
  @Matches(/^[a-z][a-z-]*$/)
  group?: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Bitta yozuv tarixi (chek, mahsulot …)' })
  @IsOptional()
  @IsUUID()
  entityId?: string

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Toshkent kuni bo‘yicha' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string

  @ApiPropertyOptional({ description: 'Amal yoki tafsilot matnida' })
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

  @ApiPropertyOptional({ minimum: 1, maximum: AUDIT_PAGE_MAX, default: AUDIT_PAGE_DEFAULT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AUDIT_PAGE_MAX)
  limit: number = AUDIT_PAGE_DEFAULT
}

export class AuditUserDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Bobur Toshmatov' }) name!: string
}

export class AuditEntryDto {
  @ApiProperty() id!: string
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ example: 'sale.create' }) action!: string
  @ApiProperty({ type: String, nullable: true }) detail!: string | null
  @ApiProperty({ type: String, nullable: true, example: 'sale' }) entityType!: string | null
  @ApiProperty({ type: String, nullable: true }) entityId!: string | null
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true, description: 'O‘zgarish (maxfiy maydonlar tozalangan)' })
  diff!: Record<string, unknown> | null
  @ApiProperty({ type: AuditUserDto, nullable: true, description: '`null` — tizim (fon ishi)' }) user!: AuditUserDto | null
}

export class AuditPageDto {
  @ApiProperty({ type: [AuditEntryDto] }) items!: AuditEntryDto[]
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null
  @ApiProperty() hasMore!: boolean
}
