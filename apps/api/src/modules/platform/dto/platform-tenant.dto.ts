import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { SystemRole, type Prisma } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator'
import { PAID_PLANS, PLAN_NAMES } from '@crm/shared'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { byField, sortValues, type SortMap } from '@/common/crud/sort'
import { Trim } from '@/common/validation/decorators'
import { PlanLimitsDto } from '@/modules/account/dto/account.dto'
import { RegisterDto } from '@/modules/auth/dto/register.dto'
import { MAX_PASSWORD_LENGTH } from '@/modules/auth/password.service'
import { MAX_INVOICE_MONTHS } from '@/modules/billing/dto/billing.dto'

export const TENANT_STATUSES = ['active', 'suspended', 'blocked', 'deleting'] as const
export type TenantStatusName = (typeof TENANT_STATUSES)[number]

/** Egasi do'kon kartasiga yozadigan izoh va blok sababi — qisqa matn */
export const MAX_NOTE_LENGTH = 500
const MAX_EXPIRES_WITHIN_DAYS = 365

export const TENANT_SORT = {
  id: byField('id'),
  name: byField('name'),
  createdAt: byField('createdAt'),
  planExpiresAt: byField('planExpiresAt'),
} satisfies SortMap<Prisma.TenantOrderByWithRelationInput>

export class PlatformTenantsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: sortValues(TENANT_SORT), default: '-createdAt' })
  @IsOptional()
  @IsIn(sortValues(TENANT_SORT))
  sort?: string

  @ApiPropertyOptional({ enum: TENANT_STATUSES })
  @IsOptional()
  @IsIn(TENANT_STATUSES)
  status?: TenantStatusName

  @ApiPropertyOptional({ enum: PLAN_NAMES })
  @IsOptional()
  @IsIn(PLAN_NAMES)
  plan?: string

  @ApiPropertyOptional({
    minimum: 0, maximum: MAX_EXPIRES_WITHIN_DAYS,
    description: 'Pullik tarifi shuncha kun ichida tugaydiganlar (muddati o‘tganlar ham kiradi); `0` — faqat o‘tganlar',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_EXPIRES_WITHIN_DAYS)
  expiresWithinDays?: number
}

export class TenantUsageDto {
  @ApiProperty({ description: 'Faol kirish hisoblari' }) users!: number
  @ApiProperty({ description: 'Arxivlanmagan omborlar' }) warehouses!: number
  @ApiProperty({ description: 'S3 da band hajm (bayt)' }) storageBytes!: number
}

export class TenantAdminContactDto {
  @ApiProperty({ example: 'Ali Valiyev' }) name!: string
  @ApiProperty({ example: 'ali@dokon.uz' }) email!: string
  @ApiProperty({ example: '+998901234567' }) phone!: string
}

export class TenantActivityDto {
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'Oxirgi chek' }) lastSaleAt!: Date | null
  @ApiProperty({ description: 'So‘nggi 30 kundagi cheklar soni' }) sales30d!: number
}

export class PlatformTenantDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Qurilish Mollari' }) name!: string
  @ApiProperty({ enum: PLAN_NAMES }) plan!: string
  @ApiProperty({ enum: TENANT_STATUSES, description: '`active` dan boshqasi — do‘kon faqat o‘qiydi' }) status!: string
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'Pullik tarif muddati (`free` — null)' })
  planExpiresAt!: Date | null
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'Shu vaqtda ma’lumot to‘liq o‘chadi' })
  deletionScheduledAt!: Date | null
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'Egasi bloklagan payt (holat `deleting` bo‘lsa ham saqlanadi)' })
  blockedAt!: Date | null
  @ApiProperty({ nullable: true, type: String }) blockedReason!: string | null
  @ApiProperty({ nullable: true, type: String, description: 'Egasi izohi — do‘kon ko‘rmaydi' }) notes!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: PlanLimitsDto }) limits!: PlanLimitsDto
  @ApiProperty({ type: TenantUsageDto }) usage!: TenantUsageDto
  @ApiProperty({ type: TenantAdminContactDto, nullable: true, description: 'Birinchi administrator (egasi)' })
  admin!: TenantAdminContactDto | null
  @ApiProperty({ type: TenantActivityDto }) activity!: TenantActivityDto
}

/** Do'kon ochish — ro'yxatdan o'tish bilan bir xil maydonlar + boshlang'ich tarif */
export class CreateTenantDto extends RegisterDto {
  @ApiPropertyOptional({ enum: PLAN_NAMES, default: 'free', description: 'Boshlang‘ich tarif; pullik bo‘lsa `months` shart (bonus sifatida yoziladi)' })
  @IsOptional()
  @IsIn(PLAN_NAMES)
  plan?: string

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_INVOICE_MONTHS, description: 'Pullik tarif muddati (oy) — pullik tarifda SHART' })
  @ValidateIf((dto: CreateTenantDto) => PAID_PLANS.includes(dto.plan as (typeof PAID_PLANS)[number]))
  @IsInt()
  @Min(1)
  @Max(MAX_INVOICE_MONTHS)
  months?: number

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, description: 'Egasi izohi' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  notes?: string
}

export class UpdateTenantDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, nullable: true, description: 'Bo‘sh satr — izoh o‘chadi' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  notes?: string
}

export class BlockTenantDto {
  @ApiProperty({ maxLength: MAX_NOTE_LENGTH, description: 'Sabab — do‘kon administratori `GET /tenants/current` da ko‘radi' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NOTE_LENGTH)
  reason!: string
}

export class ResetUserPasswordDto {
  @ApiProperty({ description: 'Yangi parol (kamida 8 belgi); foydalanuvchining barcha sessiyalari yopiladi' })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string
}

export class PlatformTenantUserDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Bobur Toshmatov' }) name!: string
  @ApiProperty({ example: 'kassir@crm.uz' }) email!: string
  @ApiProperty({ enum: SystemRole, nullable: true, description: 'Tizim roli kaliti; do‘kon yaratgan rolda — `null`' })
  role!: SystemRole | null
  @ApiProperty({ example: 'Sotuvchi' }) roleName!: string
  @ApiProperty() isActive!: boolean
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastLoginAt!: Date | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}
