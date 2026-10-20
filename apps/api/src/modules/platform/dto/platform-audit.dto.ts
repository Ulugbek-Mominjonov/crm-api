import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/common/crud/list-query.dto'

export class PlatformAuditQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE

  @ApiPropertyOptional({ format: 'uuid', description: 'Bitta do‘kon tarixi' })
  @IsOptional()
  @IsUUID()
  tenantId?: string

  @ApiPropertyOptional({
    example: 'tenant',
    description: 'Amal guruhi: `tenant` (`tenant.block`, `tenant.plan` …), `invoice` (karta to‘lovi tasdig‘i/radi), `user`, `platform`, `request`',
  })
  @IsOptional()
  @Matches(/^[a-z][a-z-]*$/)
  group?: string
}

export class PlatformAuditAdminDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiProperty() email!: string
}

export class PlatformAuditEntryDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'tenant.block' }) action!: string
  @ApiProperty({ type: PlatformAuditAdminDto, nullable: true, description: '`null` — tizim (ishga tushishdagi bootstrap)' })
  admin!: PlatformAuditAdminDto | null
  @ApiProperty({ nullable: true, type: String, description: 'Qaysi do‘kon (o‘chirilgan bo‘lsa ham id qoladi)' })
  targetTenantId!: string | null
  @ApiProperty({ nullable: true, type: String, example: 'Qurilish Mollari', description: 'Do‘kon nomi (o‘chirilgan bo‘lsa `null`)' })
  targetTenantName!: string | null
  @ApiProperty({ nullable: true, type: String }) entityType!: string | null
  @ApiProperty({ nullable: true, type: String }) entityId!: string | null
  @ApiProperty({ nullable: true, type: Object, description: 'Amal tafsiloti (sabab, tarif, summa …)' })
  diff!: unknown
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}
