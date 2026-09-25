import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '@/prisma/prisma.service'
import { IDEMPOTENCY_TTL_MS } from './idempotency.service'

/** Eski idempotentlik kalitlarini tozalash (04 §4.3: 24 soat) */
@Injectable()
export class IdempotencyJobs {
  private readonly logger = new Logger(IdempotencyJobs.name)

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'idempotency-purge' })
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - IDEMPOTENCY_TTL_MS)
    let removed = 0
    const failures = await this.prisma.forEachTenant(async (tx) => {
      const { count } = await tx.idempotencyKey.deleteMany({ where: { createdAt: { lt: cutoff } } })
      removed += count
    })
    for (const { tenantId, error } of failures) {
      this.logger.error({ err: error, tenantId }, 'Idempotentlik kalitlari tozalanmadi')
    }
    return removed
  }
}
