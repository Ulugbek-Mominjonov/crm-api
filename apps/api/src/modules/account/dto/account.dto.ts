import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength } from 'class-validator'
import { MAX_PASSWORD_LENGTH } from '@/modules/auth/password.service'

export class PlanLimitsDto {
  @ApiProperty() users!: number
  @ApiProperty() warehouses!: number
  @ApiProperty() storageBytes!: number
  @ApiProperty() fileBytes!: number
  @ApiProperty() smsPerDay!: number
}

export class PlanUsageDto {
  @ApiProperty() users!: number
  @ApiProperty() warehouses!: number
  @ApiProperty() storageBytes!: number
  @ApiProperty({ description: 'Bugun (Toshkent kuni)' }) smsToday!: number
}

export class TenantAccountDto {
  @ApiProperty() id!: string
  @ApiProperty() name!: string
  @ApiProperty({ enum: ['free', 'basic', 'pro'] }) plan!: string
  @ApiProperty({ enum: ['active', 'suspended', 'deleting'], description: '`suspended`/`deleting` — faqat o‘qish' }) status!: string
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) planExpiresAt!: Date | null
  @ApiProperty({ nullable: true, type: String, format: 'date-time', description: 'Shu vaqtdan keyin ma’lumot to‘liq o‘chadi' })
  deletionScheduledAt!: Date | null
  @ApiProperty({ type: PlanLimitsDto }) limits!: PlanLimitsDto
  @ApiProperty({ type: PlanUsageDto }) usage!: PlanUsageDto
}

export class DeleteTenantDto {
  @ApiProperty({ description: 'Administrator paroli — tasdiq uchun' })
  @IsString()
  @MaxLength(MAX_PASSWORD_LENGTH)
  password!: string
}
