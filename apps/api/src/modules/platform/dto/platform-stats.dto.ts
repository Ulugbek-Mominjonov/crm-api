import { ApiProperty } from '@nestjs/swagger'

export class TenantCountsDto {
  @ApiProperty({ description: 'Barcha do‘konlar' }) total!: number
  @ApiProperty({ example: { active: 10, suspended: 2, blocked: 1, deleting: 0 }, description: 'Holat bo‘yicha' })
  byStatus!: Record<string, number>
  @ApiProperty({ example: { free: 8, basic: 3, pro: 2 }, description: 'Tarif bo‘yicha' })
  byPlan!: Record<string, number>
  @ApiProperty({ description: 'Shu oyda ochilganlar (Toshkent oyi)' }) newThisMonth!: number
  @ApiProperty({ description: 'Pullik tarifi 7 kun ichida tugaydiganlar' }) expiringIn7Days!: number
  @ApiProperty({ description: 'Muddati o‘tgan, hali to‘xtatilmagan (3 kunlik imtiyozda)' }) overdue!: number
}

export class RevenueMonthDto {
  @ApiProperty({ example: '2026-10-01', description: 'Oy boshi' }) month!: string
  @ApiProperty({ description: 'To‘langan summa (so‘m)' }) amount!: number
  @ApiProperty({ description: 'To‘langan hisob-fakturalar soni' }) invoices!: number
}

export class RevenueDto {
  @ApiProperty({ description: 'Joriy oy (so‘m)' }) thisMonth!: number
  @ApiProperty({ description: 'O‘tgan oy (so‘m)' }) lastMonth!: number
  @ApiProperty({ type: [RevenueMonthDto], description: 'So‘nggi 12 oy — to‘lov bo‘lmagan oy ro‘yxatda yo‘q' })
  months!: RevenueMonthDto[]
}

export class PlatformStatsDto {
  @ApiProperty({ type: TenantCountsDto }) tenants!: TenantCountsDto
  @ApiProperty({ type: RevenueDto }) revenue!: RevenueDto
  @ApiProperty({ description: 'Egasi javobini kutayotgan do‘kon murojaatlari (menyuda belgi; T-140)' }) openRequests!: number
}
