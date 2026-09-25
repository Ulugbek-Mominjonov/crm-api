import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDefined, IsObject, IsOptional, IsString, MaxLength } from 'class-validator'

/** Payme JSON-RPC so'rovi */
export class PaymeRequestDto {
  @ApiPropertyOptional({ example: '2.0' })
  @IsOptional()
  @IsString()
  jsonrpc?: string

  @ApiProperty({ example: 1, description: 'So‘rov id — javobda aynan qaytadi' })
  @IsDefined()
  id!: unknown

  @ApiProperty({ example: 'CheckPerformTransaction' })
  @IsString()
  @MaxLength(64)
  method!: string

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  params!: Record<string, unknown>
}

/** Click SHOP API — `application/x-www-form-urlencoded`, hamma maydon matn */
export class ClickRequestDto {
  @ApiProperty() @IsString() @MaxLength(64) click_trans_id!: string
  @ApiProperty() @IsString() @MaxLength(64) service_id!: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) click_paydoc_id?: string
  @ApiProperty({ description: 'Bizdagi hisob-faktura id' }) @IsString() @MaxLength(64) merchant_trans_id!: string
  @ApiPropertyOptional({ description: 'Faqat complete' }) @IsOptional() @IsString() @MaxLength(64) merchant_prepare_id?: string
  @ApiProperty({ example: '99000.00' }) @IsString() @MaxLength(32) amount!: string
  @ApiProperty({ example: '0', description: '0 — prepare, 1 — complete' }) @IsString() @MaxLength(4) action!: string
  @ApiProperty({ example: '0' }) @IsString() @MaxLength(16) error!: string
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) error_note?: string
  @ApiProperty({ example: '2026-09-23 12:00:00' }) @IsString() @MaxLength(32) sign_time!: string
  @ApiProperty() @IsString() @MaxLength(64) sign_string!: string
}
