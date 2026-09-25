import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { Trim } from '@/common/validation/decorators'

export const DEFAULT_PAGE_SIZE = 20
/** 04 §4.1: katta sahifa bazani ham, brauzerni ham qiynaydi */
export const MAX_PAGE_SIZE = 200
const MAX_QUERY_LENGTH = 100

/**
 * Ro'yxat so'rovining umumiy parametrlari (04 §4.1).
 *
 * Resurs DTO'si shu sinfni kengaytiradi: o'z filtrlarini va `sort` ni
 * qo'shadi — saralash kalitlari har resursda o'z oq ro'yxati bilan
 * (`sortValues(...)`), shuning uchun u bu yerda yo'q.
 */
export class ListQueryDto {
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

  @ApiPropertyOptional({ description: 'Matn qidiruvi', maxLength: MAX_QUERY_LENGTH })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_QUERY_LENGTH)
  q?: string
}
