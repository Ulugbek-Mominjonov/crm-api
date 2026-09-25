import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { ExpenseCategory, PayMethod, RecurrencePeriod } from '@prisma/client'
import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { IsDateOnly, IsMoney, ToBoolean, Trim } from '@/common/validation/decorators'

export class CreateExpenseDto {
  @ApiProperty({ enum: ExpenseCategory })
  @IsIn(Object.values(ExpenseCategory))
  category!: ExpenseCategory

  @ApiProperty({ example: 500_000 })
  @IsMoney()
  @Min(1)
  amount!: number

  @ApiProperty({ enum: PayMethod, description: '`cash` — kassadan chiqadi (ochiq smena shart, I8)' })
  @IsIn(Object.values(PayMethod))
  method!: PayMethod

  @ApiPropertyOptional({ example: '2026-09-23', description: 'Berilmasa — bugun' })
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

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

export class ExpenseQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string

  @ApiPropertyOptional({ enum: ExpenseCategory })
  @IsOptional()
  @IsIn(Object.values(ExpenseCategory))
  category?: ExpenseCategory

  @ApiPropertyOptional({ enum: PayMethod })
  @IsOptional()
  @IsIn(Object.values(PayMethod))
  method?: PayMethod

  @ApiPropertyOptional({ description: 'O‘chirilganlar ham (tiklash uchun)' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  withDeleted?: boolean
}

export class ExpenseDto {
  @ApiProperty() id!: string
  @ApiProperty({ enum: ExpenseCategory }) category!: ExpenseCategory
  @ApiProperty() amount!: number
  @ApiProperty({ enum: PayMethod }) method!: PayMethod
  @ApiProperty({ example: '2026-09-23' }) date!: string
  @ApiProperty({ nullable: true, type: String }) note!: string | null
  @ApiProperty({ nullable: true, type: String }) userId!: string | null
  @ApiProperty({ nullable: true, type: String, description: 'Naqd ta’siri yozilgan smena' }) shiftId!: string | null
  @ApiProperty({ nullable: true, type: String, description: 'Takrorlanuvchi shablon' }) templateId!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) deletedAt!: Date | null
}

export class ExpenseCategoryTotalDto {
  @ApiProperty({ enum: ExpenseCategory }) category!: ExpenseCategory
  @ApiProperty({ example: 5_000_000 }) amount!: number
}

export class ExpenseSummaryDto {
  @ApiProperty({ description: 'Bugungi xarajat (filtrsiz)' }) today!: number
  @ApiProperty({ description: 'Joriy oy (filtrsiz)' }) month!: number
  @ApiProperty({ description: 'Barcha vaqt (filtrsiz)' }) total!: number
  @ApiProperty({ type: [ExpenseCategoryTotalDto], description: 'Filtrga mos taqsimot — kattasi birinchi' })
  byCategory!: ExpenseCategoryTotalDto[]
}

export class ExpensePageDto {
  @ApiProperty({ type: [ExpenseDto] }) items!: ExpenseDto[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() pageCount!: number
}

// ─────────────────────────────────────────────── shablonlar (I21)

export class CreateExpenseTemplateDto {
  @ApiProperty({ example: 'Do‘kon ijarasi' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string

  @ApiProperty({ enum: ExpenseCategory })
  @IsIn(Object.values(ExpenseCategory))
  category!: ExpenseCategory

  @ApiProperty({ example: 5_000_000 })
  @IsMoney()
  @Min(1)
  amount!: number

  @ApiProperty({ enum: PayMethod })
  @IsIn(Object.values(PayMethod))
  method!: PayMethod

  @ApiProperty({ enum: RecurrencePeriod })
  @IsIn(Object.values(RecurrencePeriod))
  period!: RecurrencePeriod

  @ApiProperty({ example: 1, description: 'Oylik: 1–28, haftalik: 1–7 (dushanba = 1)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfPeriod!: number

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string
}

export class UpdateExpenseTemplateDto extends PartialType(CreateExpenseTemplateDto) {}

export class ExpenseTemplateDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiProperty({ enum: ExpenseCategory }) category!: ExpenseCategory
  @ApiProperty() amount!: number
  @ApiProperty({ enum: PayMethod }) method!: PayMethod
  @ApiProperty({ enum: RecurrencePeriod }) period!: RecurrencePeriod
  @ApiProperty() dayOfPeriod!: number
  @ApiProperty() active!: boolean
  @ApiProperty({ nullable: true, type: String, example: '2026-09', description: 'Oxirgi ishlagan davr (I21)' }) lastRunKey!: string | null
  @ApiProperty({ nullable: true, type: String }) note!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}

export class RunDueResultDto {
  @ApiProperty({ example: 2, description: 'Yaratilgan xarajatlar soni' }) created!: number
}
