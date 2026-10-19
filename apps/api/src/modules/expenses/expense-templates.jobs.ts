import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { runWithContext } from '@/common/context/request-context'
import { BUSINESS_TIME_ZONE, businessDate } from '@/common/time'
import { PrismaService } from '@/prisma/prisma.service'
import { ExpenseTemplatesService } from './expense-templates.service'

/**
 * Takrorlanuvchi xarajatlar — har kuni 00:05 (Toshkent). Har tenant o'z
 * tranzaksiyasida: bittasining xatosi boshqalarini to'xtatmaydi. Bir necha
 * instansiya bir vaqtda ishlasa ham davrga bir marta (I21 — shablon qulfi).
 */
@Injectable()
export class ExpenseTemplateJobs {
  private readonly logger = new Logger(ExpenseTemplateJobs.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: ExpenseTemplatesService,
  ) {}

  @Cron('5 0 * * *', { name: 'recurring-expenses', timeZone: BUSINESS_TIME_ZONE })
  async runAll(now: Date = new Date()): Promise<number> {
    let created = 0
    // Faqat muddati kelgan shabloni bor tenantlar (I21 qoidasi bilan bir xil ro'yxat); servis qayta tekshiradi
    const due = await this.prisma.$queryRaw<{ id: string }[]>`SELECT tenants_with_due_templates(${businessDate(now)}::date) AS id`
    const failures = await this.prisma.forEachTenant((_tx, tenantId) =>
      // Audit jurnali tenantni kontekstdan oladi — fon ishida ham yozilsin
      runWithContext({ requestId: 'cron:recurring-expenses', tenantId }, async () => {
        created += await this.templates.runDue(now)
      }), due.map((t) => t.id),
    )
    for (const { tenantId, error } of failures) {
      this.logger.error({ err: error, tenantId }, 'Takrorlanuvchi xarajatlar yaratilmadi')
    }
    return created
  }
}
