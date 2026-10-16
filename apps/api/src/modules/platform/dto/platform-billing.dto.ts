import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { InvoiceState } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator'
import { PAID_PLANS, PLAN_NAMES } from '@crm/shared'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/common/crud/list-query.dto'
import { IsDateOnly, IsMoney, Trim } from '@/common/validation/decorators'
import { MAX_INVOICE_MONTHS } from '@/modules/billing/dto/billing.dto'
import { MAX_NOTE_LENGTH } from './platform-tenant.dto'

/** Egasi qo'lda yozadigan to'lov turlari (`billing_invoices.provider`) */
export const MANUAL_PROVIDERS = ['cash', 'transfer', 'bonus'] as const
export type ManualProvider = (typeof MANUAL_PROVIDERS)[number]
const ALL_PROVIDERS = ['payme', 'click', ...MANUAL_PROVIDERS] as const

/**
 * Tarif berish: pullik tarif — hisob-faktura `paid` holatda yoziladi va
 * tarif Payme/Click to'lovi bilan bir xil qoidada uzayadi; `free` — tarif
 * darhol bepulga tushadi (muddat o'chadi).
 */
export class GrantPlanDto {
  @ApiProperty({ enum: PLAN_NAMES })
  @IsIn(PLAN_NAMES)
  plan!: string

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_INVOICE_MONTHS, description: 'Pullik tarifda SHART' })
  @ValidateIf((dto: GrantPlanDto) => PAID_PLANS.includes(dto.plan as (typeof PAID_PLANS)[number]))
  @IsInt()
  @Min(1)
  @Max(MAX_INVOICE_MONTHS)
  months?: number

  @ApiPropertyOptional({ enum: MANUAL_PROVIDERS, description: 'Pullik tarifda SHART: `cash` naqd, `transfer` o‘tkazma, `bonus` — bepul muddat (summa 0)' })
  @ValidateIf((dto: GrantPlanDto) => PAID_PLANS.includes(dto.plan as (typeof PAID_PLANS)[number]))
  @IsIn(MANUAL_PROVIDERS)
  provider?: ManualProvider

  @ApiPropertyOptional({ description: 'Olingan summa (so‘m). Berilmasa — tarif narxi × oy; `bonus` — 0' })
  @IsOptional()
  @IsMoney()
  amount?: number

  @ApiPropertyOptional({ maxLength: MAX_NOTE_LENGTH, description: 'Kvitansiya raqami, kelishuv …' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_NOTE_LENGTH)
  note?: string
}

export class PlatformInvoicesQueryDto {
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

  @ApiPropertyOptional({ format: 'uuid', description: 'Bitta do‘kon' })
  @IsOptional()
  @IsUUID()
  tenantId?: string

  @ApiPropertyOptional({ enum: InvoiceState })
  @IsOptional()
  @IsIn(Object.values(InvoiceState))
  state?: InvoiceState

  @ApiPropertyOptional({ enum: ALL_PROVIDERS })
  @IsOptional()
  @IsIn(ALL_PROVIDERS)
  provider?: string

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Yaratilgan sana, Toshkent kuni (shu kundan)' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-10-31', description: 'Shu kungacha (kiradi)' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string
}

export class PlatformInvoiceDto {
  @ApiProperty() id!: string
  @ApiProperty() tenantId!: string
  @ApiProperty({ example: 'Qurilish Mollari' }) tenantName!: string
  @ApiProperty({ enum: PAID_PLANS }) plan!: string
  @ApiProperty() months!: number
  @ApiProperty({ description: 'So‘m' }) amount!: number
  @ApiProperty({ enum: InvoiceState }) state!: InvoiceState
  @ApiProperty({ nullable: true, type: String, enum: ALL_PROVIDERS }) provider!: string | null
  @ApiProperty({ nullable: true, type: String }) note!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) paidAt!: Date | null
}
