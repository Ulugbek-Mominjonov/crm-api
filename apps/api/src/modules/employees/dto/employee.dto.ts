import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { EmployeeStatus, type Prisma } from '@prisma/client'
import { MAX_SALARY_DAY, MIN_SALARY_DAY } from '@crm/shared'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { byField, sortValues, type SortMap } from '@/common/crud/sort'
import { IsDateOnly, IsMoney, Trim } from '@/common/validation/decorators'
import { IsPhone } from '@/common/validation/phone'

export const EMPLOYEE_SORT = {
  id: byField('id'),
  name: byField('name'),
  hiredAt: byField('hiredAt'),
  createdAt: byField('createdAt'),
} satisfies SortMap<Prisma.EmployeeOrderByWithRelationInput>

/** Xodim — SHAXS haqidagi yagona manba (D1): ism va lavozim faqat shu yerda */
export class EmployeeDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Bobur Toshmatov' }) name!: string
  @ApiProperty({ example: 'Kassir' }) position!: string
  @ApiProperty({ example: '+998901234567' }) phone!: string
  @ApiProperty({ enum: EmployeeStatus }) status!: EmployeeStatus
  @ApiPropertyOptional({ example: 4_500_000, description: 'Oylik maosh, butun so‘m; 0 — avtomatik hisoblanmaydi' }) salary?: number
  @ApiPropertyOptional({ example: 1, description: 'Maosh hisoblanadigan kun (1–28): shu kuni o‘tgan oy uchun maosh va bonus yoziladi ([10.22](README.md#payroll))' })
  salaryDay?: number
  @ApiPropertyOptional({ example: 2, description: 'Savdodan bonus, %: o‘tgan oy sotuvlari (qaytarishlar ayrilgan) × shu / 100' })
  salesBonusPct?: number
  @ApiPropertyOptional({ example: '2026-10-01', description: 'Maosh hisobi shu sanadan — oldingi oylar avtomatik hisoblanmaydi' })
  payrollFrom?: string
  @ApiProperty({ example: '2026-01-15', description: 'YYYY-MM-DD' }) hiredAt!: string
  @ApiProperty({ nullable: true, type: String, description: 'Kirish hisobi (bo‘lsa)' }) userId!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ type: String, format: 'date-time', description: 'Versiya — tahrirda `If-Match` ga qo‘yiladi' })
  updatedAt!: Date
}

export class CreateEmployeeDto {
  @ApiProperty({ example: 'Bobur Toshmatov', maxLength: 200 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string

  @ApiProperty({ example: 'Kassir', maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  position!: string

  @ApiProperty({ example: '+998 90 123 45 67' })
  @IsPhone()
  phone!: string

  @ApiPropertyOptional({ enum: EmployeeStatus, default: EmployeeStatus.active })
  @IsOptional()
  @IsIn(Object.values(EmployeeStatus))
  status?: EmployeeStatus

  @ApiPropertyOptional({ example: 4_500_000, description: 'Butun so‘m' })
  @IsOptional()
  @IsMoney()
  salary?: number

  @ApiPropertyOptional({ example: 1, default: 1, description: 'Maosh hisoblanadigan kun, 1–28' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_SALARY_DAY)
  @Max(MAX_SALARY_DAY)
  salaryDay?: number

  @ApiPropertyOptional({ example: 2, default: 0, description: 'Savdodan bonus, % (0–100, 2 kasrgacha)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  salesBonusPct?: number

  @ApiPropertyOptional({ example: '2026-10-01', description: 'Maosh hisobi shu sanadan; berilmasa — ishga olingan sana' })
  @IsOptional()
  @IsDateOnly()
  payrollFrom?: string

  @ApiProperty({ example: '2026-01-15' })
  @IsDateOnly()
  hiredAt!: string
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export class EmployeeListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: sortValues(EMPLOYEE_SORT), default: 'name' })
  @IsOptional()
  @IsIn(sortValues(EMPLOYEE_SORT))
  sort?: string

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsOptional()
  @IsIn(Object.values(EmployeeStatus))
  status?: EmployeeStatus
}
