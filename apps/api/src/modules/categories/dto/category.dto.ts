import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import type { Prisma } from '@prisma/client'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { ListQueryDto } from '@/common/crud/list-query.dto'
import { byField, sortValues, type SortMap } from '@/common/crud/sort'
import { Trim } from '@/common/validation/decorators'

/** Sukut `sortOrder`: foydalanuvchi belgilagan tartib */
export const CATEGORY_SORT = {
  id: byField('id'),
  name: byField('name'),
  sortOrder: byField('sortOrder'),
} satisfies SortMap<Prisma.CategoryOrderByWithRelationInput>

const MAX_SORT_ORDER = 10_000

export class CategoryDto {
  @ApiProperty() id!: string
  @ApiProperty({ example: 'Sement va aralashmalar' }) name!: string
  @ApiProperty({ example: 0 }) sortOrder!: number
  @ApiProperty({ example: 12, description: 'O‘chirilmagan mahsulotlar soni' }) productCount!: number
  @ApiProperty({ type: String, format: 'date-time', description: 'Versiya — tahrirda `If-Match` ga qo‘yiladi' })
  updatedAt!: Date
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'Tom yopish materiallari', maxLength: 60 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string

  @ApiPropertyOptional({ description: 'Berilmasa — ro‘yxat oxiriga qo‘shiladi', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_SORT_ORDER)
  sortOrder?: number
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CategoryListQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: sortValues(CATEGORY_SORT), default: 'sortOrder' })
  @IsOptional()
  @IsIn(sortValues(CATEGORY_SORT))
  sort?: string
}
