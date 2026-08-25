import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { tryContext } from '@/common/context/request-context'
import { redact } from '@/common/logging/redaction'

export interface AuditInput {
  action: string
  detail?: string
  entityType?: string
  entityId?: string
  diff?: Prisma.InputJsonValue
}

/**
 * Audit jurnali.
 *
 * Jadval APPEND-ONLY (trigger bilan) — yozilgan narsani o'zgartirib ham,
 * o'chirib ham bo'lmaydi. Shuning uchun bu yerga faqat kerakli va tozalangan
 * ma'lumot tushishi kerak.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Jurnalga yozadi. Xato bo'lsa ASOSIY amal buzilmaydi — audit yozuvining
   * yiqilishi sotuvni bekor qilishi mumkin emas. Lekin xato jimgina
   * yutilmaydi: u logga `error` darajasida tushadi.
   */
  async log(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    const ctx = tryContext()
    if (!ctx?.tenantId) return

    const data = {
      tenantId: ctx.tenantId,
      userId: ctx.userId ?? null,
      action: input.action,
      detail: input.detail?.slice(0, 500),
      entityType: input.entityType,
      entityId: input.entityId,
      diff: input.diff ? (redact(input.diff) as Prisma.InputJsonValue) : undefined,
    }

    try {
      const client = tx ?? this.prisma
      await client.auditEntry.create({ data })
    } catch (err) {
      this.logger.error({ err, action: input.action }, 'Audit yozuvi saqlanmadi')
    }
  }
}
