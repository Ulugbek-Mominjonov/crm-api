import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { EmployeeStatus, type Prisma } from '@prisma/client'
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
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
  @ApiPropertyOptional({ example: 4_500_000, description: 'Oylik maosh, butun so‘m' }) salary?: number
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
