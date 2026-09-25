import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { CashDirection, ShiftStatus } from '@prisma/client'
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { IsDateOnly, IsMoney, Trim } from '@/common/validation/decorators'

export class OpenShiftDto {
  @ApiProperty({ example: 200_000, description: 'Yashikdagi SANALGAN naqd — kassa balansi shunga tenglashadi (I10)' })
  @IsMoney()
  openingBalance!: number
}

export class CloseShiftDto {
  @ApiProperty({ example: 1_450_000, description: 'Yopishda sanalgan naqd' })
  @IsMoney()
  countedBalance!: number

  @ApiPropertyOptional({ example: '5000 kam chiqdi', maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { type: 'integer' },
    example: { '100000': 12, '50000': 4, '1000': 50 },
    description: 'Kupyura → soni. Berilsa, yig‘indisi `countedBalance` ga teng bo‘lishi shart',
  })
  @IsOptional()
  @IsObject()
  denominations?: Record<string, number>
}

export class CashMovementInputDto {
  @ApiProperty({ enum: CashDirection })
  @IsIn(Object.values(CashDirection))
  direction!: CashDirection

  @ApiProperty({ example: 500_000 })
  @IsMoney()
  @Min(1)
  amount!: number

  @ApiProperty({ example: 'Egasi oldi', maxLength: 500 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string
}

export class ShiftQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ShiftStatus })
  @IsOptional()
  @IsIn(Object.values(ShiftStatus))
  status?: ShiftStatus

  @ApiPropertyOptional({ example: '2026-09-01', description: 'Ochilgan kun (Toshkent) — shu kundan' })
  @IsOptional()
  @IsDateOnly()
  dateFrom?: string

  @ApiPropertyOptional({ example: '2026-09-30', description: 'Ochilgan kun (Toshkent) — shu kun ham' })
  @IsOptional()
  @IsDateOnly()
  dateTo?: string
}

export class CashMovementQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Berilmasa — joriy smena' })
  @IsOptional()
  @IsUUID()
  shiftId?: string
}

// ─────────────────────────────────────────────── javoblar

export class ShiftDto {
  @ApiProperty() id!: string
  @ApiProperty({ enum: ShiftStatus }) status!: ShiftStatus
  @ApiProperty({ type: String, format: 'date-time' }) openedAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) closedAt!: Date | null
  @ApiProperty() openingBalance!: number
  @ApiProperty({ description: 'Smena davomidagi naqd kirim' }) cashIn!: number
  @ApiProperty({ description: 'Smena davomidagi naqd chiqim' }) cashOut!: number
  @ApiProperty({ nullable: true, type: Number, description: 'Yopishdagi hisobiy qoldiq' }) expectedBalance!: number | null
  @ApiProperty({ nullable: true, type: Number }) countedBalance!: number | null
  @ApiProperty({ nullable: true, type: Number, description: 'Sanalgan − hisobiy' }) difference!: number | null
  @ApiProperty({ nullable: true, type: String }) note!: string | null
  @ApiProperty({ nullable: true, type: String }) userId!: string | null
  @ApiProperty({ nullable: true, type: String, example: 'Bobur Toshmatov', description: 'Smenani ochgan kassir (xodim ismi)' })
  cashierName!: string | null
}

export class CurrentShiftDto {
  @ApiProperty({ type: ShiftDto, nullable: true, description: 'Ochiq smena yoki null' }) shift!: ShiftDto | null
  @ApiProperty({ example: 1_455_000, description: 'Kassa yashigidagi hisobiy naqd' }) cashBalance!: number
}

export class ShiftPageDto {
  @ApiProperty({ type: [ShiftDto] }) items!: ShiftDto[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() pageCount!: number
}

export class CashMovementDto {
  @ApiProperty() id!: string
  @ApiProperty() shiftId!: string
  @ApiProperty({ enum: CashDirection }) direction!: CashDirection
  @ApiProperty() amount!: number
  @ApiProperty() reason!: string
  @ApiProperty({ nullable: true, type: String }) userId!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
}

export class CashMovementPageDto {
  @ApiProperty({ type: [CashMovementDto] }) items!: CashMovementDto[]
  @ApiProperty() page!: number
  @ApiProperty() pageSize!: number
  @ApiProperty() total!: number
  @ApiProperty() pageCount!: number
}

export class ShiftSalesDto {
  @ApiProperty({ description: 'Cheklar soni (bekor qilinganlarsiz)' }) count!: number
  @ApiProperty({ description: 'Tushum — nasiya cheklar HAM (I4)' }) total!: number
  @ApiProperty({ description: 'Naqd (kassada qolgan)' }) cash!: number
  @ApiProperty() card!: number
  @ApiProperty() transfer!: number
  @ApiProperty({ description: 'Nasiyaga qolgan qism (sotuv paytida)' }) credit!: number
  @ApiProperty({ description: 'Shu smenada yozilib, keyin bekor qilingan cheklar' }) cancelled!: number
}

export class ShiftReturnsDto {
  @ApiProperty() count!: number
  @ApiProperty() total!: number
  @ApiProperty({ description: 'Kassadan qaytarilgan naqd' }) cash!: number
}

export class ShiftReportDto {
  @ApiProperty({ type: ShiftDto }) shift!: ShiftDto
  @ApiProperty({ type: ShiftSalesDto }) sales!: ShiftSalesDto
  @ApiProperty({ type: ShiftReturnsDto }) returns!: ShiftReturnsDto
  @ApiProperty({ description: 'Qo‘lda kiritilgan naqd' }) manualIn!: number
  @ApiProperty({ description: 'Qo‘lda olingan naqd' }) manualOut!: number
  @ApiProperty({ description: 'Naqd xarajatlar' }) expenses!: number
  @ApiProperty({ description: 'Naqd qarz to‘lovlari' }) debtPaymentsCash!: number
  @ApiProperty({ description: 'Bank orqali qarz to‘lovlari (kassaga tegmaydi)' }) debtPaymentsBank!: number
  @ApiProperty({ description: 'Ta’minotchiga naqd to‘lovlar' }) supplierPayments!: number
  @ApiProperty({ description: 'Hisobiy qoldiq: ochiq smenada — joriy, yopilganda — yopish paytidagi' }) expectedBalance!: number
}
