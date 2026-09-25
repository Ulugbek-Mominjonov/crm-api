import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger'
import { PayMethod, SaleStatus } from '@prisma/client'
import { IsBoolean, IsIn, IsOptional, IsUUID, Min } from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { IsMoney, ToBoolean } from '@/common/validation/decorators'

export const DEBT_VIEWS = ['customers', 'receipts'] as const
export type DebtView = (typeof DEBT_VIEWS)[number]

/** Eskirish: qarz necha kunlik (chek sanasidan) — 0–30, 31–60, 60+ */
export const AGING_BUCKETS = ['d30', 'd60', 'd60plus'] as const
export type AgingBucket = (typeof AGING_BUCKETS)[number]

export class DebtPaymentInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  saleId!: string

  @ApiProperty({ example: 100_000 })
  @IsMoney()
  @Min(1)
  amount!: number

  @ApiProperty({ enum: PayMethod, description: '`cash` — kassaga kiradi (ochiq smena shart, I8)' })
  @IsIn(Object.values(PayMethod))
  method!: PayMethod
}

export class DebtQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: DEBT_VIEWS, default: 'customers' })
  @IsOptional()
  @IsIn(DEBT_VIEWS)
  view: DebtView = 'customers'

  @ApiPropertyOptional({ enum: AGING_BUCKETS, description: 'Mijozlar: ENG ESKI qarzi bo‘yicha; cheklar: chek sanasi' })
  @IsOptional()
  @IsIn(AGING_BUCKETS)
  aging?: AgingBucket

  @ApiPropertyOptional({ description: 'Faqat muddati o‘tganlar' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  overdue?: boolean

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string
}

export class DebtPaymentQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  saleId?: string

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  customerId?: string
}

export class DebtPartyDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiProperty() phone!: string
}

export class CustomerDebtDto {
  @ApiProperty({ type: DebtPartyDto }) customer!: DebtPartyDto
  @ApiProperty({ example: 1_250_000 }) debt!: number
  @ApiProperty({ example: 3, description: 'Qarzi bor cheklar soni' }) receipts!: number
  @ApiProperty({ example: '2026-07-01' }) oldestDate!: string
  @ApiProperty({ nullable: true, type: String }) oldestDue!: string | null
  @ApiProperty({ description: 'Muddati o‘tgan qarzi bor' }) overdue!: boolean
  @ApiProperty({ nullable: true, type: Number, description: 'Nasiya limiti (null — cheklanmagan)' }) creditLimit!: number | null
}

export class DebtReceiptDto {
  @ApiProperty() saleId!: string
  @ApiProperty() number!: string
  @ApiProperty({ type: DebtPartyDto, nullable: true }) customer!: DebtPartyDto | null
  @ApiProperty() date!: string
  @ApiProperty({ nullable: true, type: String }) dueDate!: string | null
  @ApiProperty() total!: number
  @ApiProperty() outstanding!: number
  @ApiProperty({ description: 'Chek sanasidan beri kun' }) ageDays!: number
  @ApiProperty() overdue!: boolean
}

export class DebtSummaryDto {
  @ApiProperty({ description: 'Jami qarz (`customerId` bo‘lsa — shu mijozniki)' }) debt!: number
  @ApiProperty({ description: 'Shundan muddati o‘tgani' }) overdue!: number
  @ApiProperty({ description: 'Qarzdor mijozlar soni' }) customers!: number
  @ApiProperty({ nullable: true, type: String, example: '2026-07-01', description: 'Eng eski qarzli chek sanasi' })
  oldestDate!: string | null
}

@ApiExtraModels(CustomerDebtDto, DebtReceiptDto)
export class DebtPageDto {
  @ApiProperty({
    type: 'array',
    items: { oneOf: [{ $ref: getSchemaPath(CustomerDebtDto) }, { $ref: getSchemaPath(DebtReceiptDto) }] },
    description: '`view` ga qarab: `customers` — CustomerDebtDto[], `receipts` — DebtReceiptDto[]',
  })
  items!: (CustomerDebtDto | DebtReceiptDto)[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() pageCount!: number
  @ApiProperty({ type: DebtSummaryDto }) summary!: DebtSummaryDto
}

export class DebtSaleStateDto {
  @ApiProperty() id!: string
  @ApiProperty() number!: string
  @ApiProperty({ enum: SaleStatus }) status!: SaleStatus
  @ApiProperty() debtPaid!: number
  @ApiProperty({ description: 'To‘lovdan keyingi qarz' }) outstanding!: number
}

export class DebtPaymentDto {
  @ApiProperty() id!: string
  @ApiProperty() saleId!: string
  @ApiProperty({ nullable: true, type: String }) customerId!: string | null
  @ApiProperty() amount!: number
  @ApiProperty({ enum: PayMethod }) method!: PayMethod
  @ApiProperty() date!: string
  @ApiProperty({ nullable: true, type: String }) shiftId!: string | null
  @ApiProperty({ nullable: true, type: String }) userId!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}

export class DebtPaymentResultDto {
  @ApiProperty({ type: DebtPaymentDto }) payment!: DebtPaymentDto
  @ApiProperty({ type: DebtSaleStateDto }) sale!: DebtSaleStateDto
}

export class DebtPaymentPageDto {
  @ApiProperty({ type: [DebtPaymentDto] }) items!: DebtPaymentDto[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() pageCount!: number
}
