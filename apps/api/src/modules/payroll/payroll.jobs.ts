import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { runWithContext } from '@/common/context/request-context'
import { BUSINESS_TIME_ZONE, businessDate } from '@/common/time'
import { PrismaService } from '@/prisma/prisma.service'
import { PayrollAccrualService } from './payroll-accrual.service'

/**
 * Maosh hisoblash — har kuni 00:10 (Toshkent), shablon xarajatlaridan keyin.
 * Har tenant o'z tranzaksiyasida: bittasining xatosi boshqalarini
 * to'xtatmaydi. Bir necha instansiya bir vaqtda ishlasa ham davrga bir marta
 * (qisman noyob indeks).
 */
@Injectable()
export class PayrollJobs {
  private readonly logger = new Logger(PayrollJobs.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly accrual: PayrollAccrualService,
  ) {}

  @Cron('10 0 * * *', { name: 'payroll-accrual', timeZone: BUSINESS_TIME_ZONE })
  async runAll(now: Date = new Date()): Promise<number> {
    let created = 0
    // Faqat kuni kelgan, hali hisoblanmagan xodimi bor tenantlar (nomzod sharti bilan bir xil ro'yxat)
    const due = await this.prisma.$queryRaw<{ id: string }[]>`SELECT tenants_with_due_payroll(${businessDate(now)}::date) AS id`
    const failures = await this.prisma.forEachTenant((_tx, tenantId) =>
      // Audit jurnali tenantni kontekstdan oladi — fon ishida ham yozilsin
      runWithContext({ requestId: 'cron:payroll-accrual', tenantId }, async () => {
        created += await this.accrual.runDue(now)
      }), due.map((t) => t.id),
    )
    for (const { tenantId, error } of failures) {
      this.logger.error({ err: error, tenantId }, 'Maosh hisoblanmadi')
    }
    return created
  }
}
