import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { EmployeeStatus, PayMethod, PayrollEntryType } from '@prisma/client'
import { PAYROLL_ACCRUAL_TYPES, PAYROLL_PAYMENT_TYPES, type PayrollAccrualType, type PayrollPaymentType } from '@crm/shared'
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { IsDateOnly, IsMoney, ToBoolean, Trim } from '@/common/validation/decorators'

/** `YYYY-MM` */
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export class PayrollEntryDto {
  @ApiProperty() id!: string
  @ApiProperty() employeeId!: string
  @ApiProperty({ enum: PayrollEntryType, description: 'Hisoblash: `salary`, `bonus`, `award`, `penalty`; to‘lov: `advance`, `payment`' })
  type!: PayrollEntryType
  @ApiProperty({ example: 3_000_000, description: 'Doim musbat; jarima ishlab topilganidan ayriladi' }) amount!: number
  @ApiProperty({ example: '2026-09-30', description: 'Avtomatik hisoblashda — davr (o‘tgan oy) oxirgi kuni' }) date!: string
  @ApiProperty({ example: '2026-09', description: 'Yozuv qaysi oyga tegishli (sanadan)' }) period!: string
  @ApiProperty({ nullable: true, enum: PayMethod, description: 'Faqat to‘lovda' }) method!: PayMethod | null
  @ApiProperty({ nullable: true, type: String, description: 'Naqd to‘lov yozilgan smena' }) shiftId!: string | null
  @ApiProperty({ description: 'Tungi ish hisoblagan (xodim + davr + tur bo‘yicha bir marta)' }) auto!: boolean
  @ApiProperty({ nullable: true, type: Number, description: 'Hisoblash asosi: bonus — davr savdosi, maosh — oylik maosh' })
  baseAmount!: number | null
  @ApiProperty({ nullable: true, type: Number, description: 'Bonus foizi (hisoblangan paytdagi)' }) rate!: number | null
  @ApiProperty({ nullable: true, type: String }) note!: string | null
  @ApiProperty({ nullable: true, type: String }) userId!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) deletedAt!: Date | null
}

export class PayrollEntryPageDto {
  @ApiProperty({ type: [PayrollEntryDto] }) items!: PayrollEntryDto[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() pageCount!: number
}

export class PayrollEntryQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ description: 'Xodim varag‘i' })
  @IsOptional()
  @IsUUID()
  employeeId?: string

  @ApiPropertyOptional({ enum: PayrollEntryType })
  @IsOptional()
  @IsIn(Object.values(PayrollEntryType))
  type?: PayrollEntryType

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string

  @ApiPropertyOptional({ description: 'O‘chirilganlar ham (tiklash uchun)' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  withDeleted?: boolean
}

class PayrollEntryInput {
  @ApiProperty()
  @IsUUID()
  employeeId!: string

  @ApiProperty({ example: 500_000 })
  @IsMoney()
  @Min(1)
  amount!: number

  @ApiPropertyOptional({ example: '2026-10-05', description: 'Berilmasa — bugun; yozuv shu oy varag‘iga tushadi' })
  @IsOptional()
  @IsDateOnly()
  date?: string

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string
}

/** Hisoblash — ishlab topilganiga: maosh (qo‘lda), bonus, mukofot (+) yoki jarima (−) */
export class CreateAccrualDto extends PayrollEntryInput {
  @ApiProperty({ enum: PAYROLL_ACCRUAL_TYPES, description: '`penalty` — ishlab topilganidan ayriladi' })
  @IsIn(PAYROLL_ACCRUAL_TYPES)
  type!: PayrollAccrualType
}

/** To‘lov — xodimga berilgan pul: avans (oy ichida) yoki maosh to‘lovi */
export class CreatePaymentDto extends PayrollEntryInput {
  @ApiProperty({ enum: PAYROLL_PAYMENT_TYPES })
  @IsIn(PAYROLL_PAYMENT_TYPES)
  type!: PayrollPaymentType

  @ApiProperty({ enum: PayMethod, description: '`cash` — kassadan chiqadi (ochiq smena shart, I8)' })
  @IsIn(Object.values(PayMethod))
  method!: PayMethod
}

export class PayrollSheetQueryDto {
  @ApiPropertyOptional({ example: '2026-10', description: '`YYYY-MM`; berilmasa — joriy oy' })
  @IsOptional()
  @Matches(PERIOD_RE, { message: 'period — YYYY-MM' })
  period?: string
}

/** Varaq qatori: xodim sozlamalari, davr boshidagi qoldiq, davr yozuvlari, davr oxiridagi qoldiq */
export class PayrollSheetRowDto {
  @ApiProperty() employeeId!: string
  @ApiProperty() name!: string
  @ApiProperty() position!: string
  @ApiProperty({ enum: EmployeeStatus }) status!: EmployeeStatus
  @ApiProperty({ description: 'Oylik maosh (sozlama)' }) salary!: number
  @ApiProperty() salaryDay!: number
  @ApiProperty() salesBonusPct!: number
  @ApiProperty({ example: '2026-10-01' }) payrollFrom!: string
  @ApiProperty({ description: 'Davr boshidagi qoldiq (oldingi oylardan): musbat — do‘kon qarzi' }) opening!: number
  @ApiProperty({ description: 'Davrda hisoblangan maosh' }) accruedSalary!: number
  @ApiProperty({ description: 'Savdodan bonus' }) bonus!: number
  @ApiProperty({ description: 'Mukofot' }) award!: number
  @ApiProperty({ description: 'Jarima' }) penalty!: number
  @ApiProperty({ description: 'Ishlab topilgani: maosh + bonus + mukofot − jarima' }) earned!: number
  @ApiProperty({ description: 'Avanslar' }) advance!: number
  @ApiProperty({ description: 'Maosh to‘lovlari' }) payment!: number
  @ApiProperty({ description: 'To‘langani: avans + to‘lov' }) paid!: number
  @ApiProperty({ description: 'Davr oxiridagi qoldiq: opening + earned − paid' }) closing!: number
  @ApiProperty({ description: 'Shu davr uchun avtomatik hisoblash bo‘lgan' }) accrued!: boolean
}

export class PayrollSheetTotalsDto {
  @ApiProperty() opening!: number
  @ApiProperty() accruedSalary!: number
  @ApiProperty() bonus!: number
  @ApiProperty() award!: number
  @ApiProperty() penalty!: number
  @ApiProperty() earned!: number
  @ApiProperty() advance!: number
  @ApiProperty() payment!: number
  @ApiProperty() paid!: number
  @ApiProperty() closing!: number
}

export class PayrollSheetDto {
  @ApiProperty({ example: '2026-10' }) period!: string
  @ApiProperty({ example: '2026-10-01' }) start!: string
  @ApiProperty({ example: '2026-10-31' }) end!: string
  @ApiProperty({ type: [PayrollSheetRowDto], description: 'Faol va ta’tildagi xodimlar + davrda yozuvi bor bo‘shatilganlar' })
  rows!: PayrollSheetRowDto[]
  @ApiProperty({ type: PayrollSheetTotalsDto }) totals!: PayrollSheetTotalsDto
}

export class PayrollRunResultDto {
  @ApiProperty({ example: 4, description: 'Yaratilgan yozuvlar soni (maosh + bonus)' }) created!: number
}
