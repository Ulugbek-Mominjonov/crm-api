import { Injectable } from '@nestjs/common'
import { businessDate, businessDayStart } from '@/common/time'
import { SUSPEND_GRACE_DAYS } from '@/modules/tenants/tenant-status.service'
import { PrismaService } from '@/prisma/prisma.service'
import type { PlatformStatsDto, RevenueMonthDto } from './dto/platform-stats.dto'

const EXPIRING_DAYS = 7
const REVENUE_MONTHS = 12
const DAY_MS = 86_400_000

/** Boshqaruv paneli (T-135): do'konlar holati va tushum — bir nechta jamlovchi so'rov, qatorlar emas */
@Injectable()
export class PlatformStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(): Promise<PlatformStatsDto> {
    const now = new Date()
    const thisMonth = monthStart(now, 0)
    const [byStatus, byPlan, newThisMonth, expiringIn7Days, overdue, revenue] = await Promise.all([
      this.prisma.tenant.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.tenant.groupBy({ by: ['plan'], _count: { _all: true } }),
      this.prisma.tenant.count({ where: { createdAt: { gte: thisMonth } } }),
      this.prisma.tenant.count({
        where: { plan: { not: 'free' }, status: 'active', planExpiresAt: { gte: now, lt: new Date(now.getTime() + EXPIRING_DAYS * DAY_MS) } },
      }),
      this.prisma.tenant.count({
        where: { plan: { not: 'free' }, status: 'active', planExpiresAt: { lt: now, gte: new Date(now.getTime() - SUSPEND_GRACE_DAYS * DAY_MS) } },
      }),
      this.prisma.$queryRaw<{ month: Date; amount: bigint; invoices: number }[]>`
        SELECT month, amount, invoices FROM platform_revenue(${monthStart(now, -(REVENUE_MONTHS - 1))}::timestamptz)`,
    ])
    const months: RevenueMonthDto[] = revenue.map((r) => ({ month: r.month.toISOString().slice(0, 10), amount: Number(r.amount), invoices: r.invoices }))
    const amountOf = (month: Date): number => months.find((m) => m.month === businessDate(month))?.amount ?? 0
    return {
      tenants: {
        total: byStatus.reduce((sum, r) => sum + r._count._all, 0),
        byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
        byPlan: Object.fromEntries(byPlan.map((r) => [r.plan, r._count._all])),
        newThisMonth,
        expiringIn7Days,
        overdue,
      },
      revenue: { thisMonth: amountOf(thisMonth), lastMonth: amountOf(monthStart(now, -1)), months },
    }
  }
}

/** Toshkent oyining boshi (`offset` oy surilgan) — UTC lahzasi */
function monthStart(now: Date, offset: number): Date {
  const [year, month] = businessDate(now).split('-').map(Number) as [number, number]
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1))
  return businessDayStart(shifted.toISOString().slice(0, 10))
}
