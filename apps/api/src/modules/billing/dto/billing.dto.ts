import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { InvoiceState } from '@prisma/client'
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import { BILLING_PERIODS, PAID_PLANS, PLAN_NAMES } from '@crm/shared'
import { Trim } from '@/common/validation/decorators'
import { PlanLimitsDto } from '@/modules/account/dto/account.dto'
import { PaymentCardDto } from '@/modules/platform/dto/platform-settings.dto'

/** Egasi qo'lda bir martada beradigan eng uzun muddat (do'kon esa faqat `BILLING_PERIODS` dan tanlaydi) */
export const MAX_INVOICE_MONTHS = 12
/** To'lovchi izohi — qisqa: «akamning kartasidan», «Click orqali» */
export const MAX_PAYER_NOTE_LENGTH = 300

const PROVIDERS = ['payme', 'click', 'card', 'cash', 'transfer', 'bonus'] as const

export class CreateInvoiceDto {
  @ApiProperty({ enum: PAID_PLANS })
  @IsIn(PAID_PLANS)
  plan!: string

  @ApiProperty({ enum: BILLING_PERIODS, example: 1, description: 'Oy: 1, 3, 6 yoki 12 — uzoqroq muddatga chegirma (`GET /billing/plans`)' })
  @IsIn(BILLING_PERIODS)
  months!: number
}

export class InvoiceDto {
  @ApiProperty() id!: string
  @ApiProperty({ enum: PAID_PLANS }) plan!: string
  @ApiProperty() months!: number
  @ApiProperty({ description: 'So‘m' }) amount!: number
  @ApiProperty({ enum: InvoiceState, description: '`pending` — provayder boshladi yoki karta to‘lovi egasi tekshiruvida (`provider: card`)' })
  state!: InvoiceState
  @ApiProperty({
    nullable: true, type: String, enum: PROVIDERS,
    description: '`payme`/`click` — onlayn; `card` — egasining kartasiga o‘tkazma; `cash`/`transfer`/`bonus` — platforma qo‘lda yozgan (naqd, o‘tkazma, bonus muddat)',
  })
  provider!: string | null
  @ApiProperty({ nullable: true, type: String, example: '6311', description: 'Karta to‘lovi: to‘lovchi kartasining oxirgi 4 raqami' })
  payerCard!: string | null
  @ApiProperty({ nullable: true, type: String, description: 'Karta to‘lovi: administrator izohi' }) payerNote!: string | null
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'Karta to‘lovi: o‘tkazma vaqti (administrator aytgani)' })
  transferredAt!: Date | null
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'Karta to‘lovi: «to‘ladim» bosilgan vaqt' }) claimedAt!: Date | null
  @ApiProperty({ nullable: true, type: String, description: 'Karta to‘lovi: chek fayli (`payment_receipt`)' }) receiptFileId!: string | null
  @ApiProperty({ nullable: true, type: String, description: 'Egasi karta to‘lovini rad etgan sabab (`state: cancelled`)' })
  rejectReason!: string | null
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) paidAt!: Date | null
}

export class CheckoutDto {
  @ApiProperty({ type: InvoiceDto }) invoice!: InvoiceDto
  @ApiProperty({ nullable: true, type: String, description: 'Payme to‘lov sahifasi (kassa sozlangan bo‘lsa)' })
  payme!: string | null
  @ApiProperty({ nullable: true, type: String, description: 'Click to‘lov sahifasi' })
  click!: string | null
  @ApiProperty({
    type: PaymentCardDto, nullable: true,
    description: 'Egasining kartasi: shu kartaga `invoice.amount` o‘tkaziladi, keyin `POST /billing/invoices/:id/card-payment`; `null` — usul o‘chiq',
  })
  card!: PaymentCardDto | null
}

/**
 * «To'ladim» (T-149): administrator egasining kartasiga o'tkazdi — egasi
 * bankdagi tushum bilan solishtiradi (summa, vaqt, karta oxirgi raqamlari).
 */
export class CardClaimDto {
  @ApiProperty({ example: '6311', description: 'Qaysi kartadan o‘tkazildi — oxirgi 4 raqam' })
  @Matches(/^\d{4}$/, { message: 'Karta raqamining oxirgi 4 ta raqami' })
  payerCard!: string

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'O‘tkazma vaqti; berilmasa — hozir. Kelajakda emas, 30 kundan eski emas' })
  @IsOptional()
  @IsISO8601({ strict: true })
  transferredAt?: string

  @ApiPropertyOptional({ format: 'uuid', description: 'Chek (skrinshot yoki PDF) — `POST /files/presign` `kind: payment_receipt` bilan yuklangan, tasdiqlangan fayl' })
  @IsOptional()
  @IsUUID()
  receiptFileId?: string

  @ApiPropertyOptional({ maxLength: MAX_PAYER_NOTE_LENGTH, example: 'Akamning kartasidan o‘tkazdim' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_PAYER_NOTE_LENGTH)
  note?: string
}

export class PlanPriceDto {
  @ApiProperty({ enum: BILLING_PERIODS }) months!: number
  @ApiProperty({ description: 'Jami summa (so‘m), chegirma bilan — hisob-faktura aynan shu' }) amount!: number
  @ApiProperty({ example: 20, description: 'Oldindan to‘lov chegirmasi, %' }) discountPct!: number
}

export class PlanOfferDto {
  @ApiProperty({ enum: PLAN_NAMES }) key!: string
  @ApiProperty({ example: 'Start' }) label!: string
  @ApiProperty({ example: '1–3 kishilik do‘kon: savdo joyi va ombor' }) audience!: string
  @ApiProperty({ description: '`false` — sotilmaydi (`free`: platforma egasi beradi); narxlar bo‘sh' }) sellable!: boolean
  @ApiProperty({ example: 99_000, description: 'Oylik narx (so‘m)' }) monthlyPrice!: number
  @ApiProperty({ type: [PlanPriceDto], description: 'Har muddat uchun summa' }) prices!: PlanPriceDto[]
  @ApiProperty({ type: PlanLimitsDto }) limits!: PlanLimitsDto
}

export class TrialDto {
  @ApiProperty({ enum: PAID_PLANS, example: 'business' }) plan!: string
  @ApiProperty({ example: 14 }) days!: number
}

export class PaymentMethodsDto {
  @ApiProperty({ description: 'Egasining kartasiga o‘tkazma (egasi tasdiqlaydi)' }) card!: boolean
  @ApiProperty() payme!: boolean
  @ApiProperty() click!: boolean
}

/** Tariflar va narxlar (T-148) — do'kon ilovasi, ro'yxatdan o'tish sahifasi va egasi paneli shu yerdan oladi */
export class PlanCatalogDto {
  @ApiProperty({ type: [PlanOfferDto], description: 'Hamma tariflar, arzonidan; do‘konga `sellable` lari ko‘rsatiladi' }) plans!: PlanOfferDto[]
  @ApiProperty({ type: TrialDto, description: 'Yangi do‘kon shu tarifda shuncha kun bepul ishlaydi' }) trial!: TrialDto
  @ApiProperty({ type: PaymentMethodsDto, description: 'Hozir ishlaydigan to‘lov usullari' }) methods!: PaymentMethodsDto
  @ApiProperty({ description: '`false` — SMS provayderi ulanmagan: tarif kartasida SMS qatorini yashiring (Telegram ishlaydi)' }) sms!: boolean
}
