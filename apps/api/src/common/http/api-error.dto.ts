import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

/** Bitta maydon bo'yicha xato (validatsiya yoki biznes qoidasi) */
export class FieldErrorDto {
  @ApiPropertyOptional({ example: 'items[0].qty' })
  field?: string

  @ApiProperty({ example: 'STOCK_INSUFFICIENT' })
  code!: string

  @ApiPropertyOptional({ example: { available: 12, requested: 20 } })
  meta?: Record<string, unknown>
}

/**
 * Barcha xatolar uchun yagona javob shakli (RFC 9457 ga yaqin).
 * `code` — mashina uchun, `title`/`detail` — odam uchun.
 */
export class ApiErrorDto {
  @ApiProperty({ example: 'https://api.example.uz/errors/stock-insufficient' })
  type!: string

  @ApiProperty({ example: 'Omborda yetarli tovar yo‘q' })
  title!: string

  @ApiProperty({ example: 422 })
  status!: number

  @ApiProperty({ example: 'STOCK_INSUFFICIENT' })
  code!: string

  @ApiPropertyOptional({ example: 'Sement M400: kerak 20, mavjud 12' })
  detail?: string

  @ApiProperty({ example: '/api/v1/sales' })
  instance!: string

  @ApiProperty({ example: '01J9F3K8QW2M4X7Y' })
  traceId!: string

  @ApiPropertyOptional({ type: [FieldErrorDto] })
  errors?: FieldErrorDto[]
}
