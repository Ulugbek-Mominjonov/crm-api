import { ApiProperty } from '@nestjs/swagger'
import { InvoiceState } from '@prisma/client'
import { IsIn, IsInt, Max, Min } from 'class-validator'
import { PAID_PLANS } from '@crm/shared'

export const MAX_INVOICE_MONTHS = 12

export class CreateInvoiceDto {
  @ApiProperty({ enum: PAID_PLANS })
  @IsIn(PAID_PLANS)
  plan!: string

  @ApiProperty({ example: 1, minimum: 1, maximum: MAX_INVOICE_MONTHS })
  @IsInt()
  @Min(1)
  @Max(MAX_INVOICE_MONTHS)
  months!: number
}

export class InvoiceDto {
  @ApiProperty() id!: string
  @ApiProperty({ enum: PAID_PLANS }) plan!: string
  @ApiProperty() months!: number
  @ApiProperty({ description: 'So‘m' }) amount!: number
  @ApiProperty({ enum: InvoiceState }) state!: InvoiceState
  @ApiProperty({ nullable: true, type: String, enum: ['payme', 'click'] }) provider!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) paidAt!: Date | null
}

export class CheckoutDto {
  @ApiProperty({ type: InvoiceDto }) invoice!: InvoiceDto
  @ApiProperty({ nullable: true, type: String, description: 'Payme to‘lov sahifasi (kassa sozlangan bo‘lsa)' })
  payme!: string | null
  @ApiProperty({ nullable: true, type: String, description: 'Click to‘lov sahifasi' })
  click!: string | null
}
