import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '@/prisma/prisma.service'
import { IDEMPOTENCY_TTL_MS } from './idempotency.service'

/**
 * Eski idempotentlik kalitlarini tozalash (04 §4.3: 24 soat) — BITTA global
 * `DELETE` (SECURITY DEFINER `purge_idempotency_keys`, `created_at` indeksi):
 * har tenant uchun alohida tranzaksiya ochilmaydi.
 */
@Injectable()
export class IdempotencyJobs {
  private readonly logger = new Logger(IdempotencyJobs.name)

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'idempotency-purge' })
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - IDEMPOTENCY_TTL_MS)
    try {
      const [row] = await this.prisma.$queryRaw<{ removed: number }[]>`SELECT purge_idempotency_keys(${cutoff}) AS removed`
      return row?.removed ?? 0
    } catch (err) {
      this.logger.error({ err }, 'Idempotentlik kalitlari tozalanmadi')
      return 0
    }
  }
}
