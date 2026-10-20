import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength } from 'class-validator'
import { PLAN_NAMES } from '@crm/shared'
import { MAX_PASSWORD_LENGTH } from '@/modules/auth/password.service'
import { PaymentCardDto, PlatformSupportDto } from '@/modules/platform/dto/platform-settings.dto'

export class PlanLimitsDto {
  @ApiProperty({ description: 'Faol kirish hisoblari' }) users!: number
  @ApiProperty({ description: 'Arxivlanmagan omborlar' }) warehouses!: number
  @ApiProperty() storageBytes!: number
  @ApiProperty() fileBytes!: number
  @ApiProperty({ description: 'Oyiga SMS (Toshkent oyi); Telegram xabarlari cheklanmaydi' }) smsPerMonth!: number
}

export class PlanUsageDto {
  @ApiProperty() users!: number
  @ApiProperty() warehouses!: number
  @ApiProperty() storageBytes!: number
  @ApiProperty({ description: 'Shu oyda yuborilgan SMS (Toshkent oyi)' }) smsThisMonth!: number
}

export class TenantAccountDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiProperty({ enum: PLAN_NAMES }) plan!: string
  @ApiProperty({ enum: ['active', 'suspended', 'blocked', 'deleting'], description: '`suspended`/`blocked`/`deleting` — faqat o‘qish' }) status!: string
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) planExpiresAt!: Date | null
  @ApiProperty({
    nullable: true, type: String, format: 'date-time',
    description: 'Sinov muddati oxiri (T-148): `null` emas — do‘kon hali to‘lamagan (sinovda yoki sinovi tugagan); birinchi to‘lov tozalaydi',
  })
  trialEndsAt!: Date | null
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'Shu vaqtdan keyin ma’lumot to‘liq o‘chadi' })
  deletionScheduledAt!: Date | null
  @ApiProperty({ nullable: true, type: String, description: 'Platforma bloklagan bo‘lsa — sababi (bannerda ko‘rsating); to‘lov blokni ochmaydi' })
  blockedReason!: string | null
  @ApiProperty({ type: PlanLimitsDto }) limits!: PlanLimitsDto
  @ApiProperty({ type: PlanUsageDto }) usage!: PlanUsageDto
  @ApiProperty({ type: PlatformSupportDto, description: 'Platforma egasining aloqasi — bannerda va murojaat oynasida (T-140)' })
  support!: PlatformSupportDto
  @ApiProperty({ type: PaymentCardDto, nullable: true, description: 'Karta orqali to‘lov uchun egasining kartasi (T-149); `null` — usul o‘chiq' })
  paymentCard!: PaymentCardDto | null
}

export class DeleteTenantDto {
  @ApiProperty({ description: 'Administrator paroli — tasdiq uchun' })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string
}
