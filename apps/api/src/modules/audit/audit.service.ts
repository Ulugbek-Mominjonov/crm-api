import { Injectable, Optional } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { tryContext } from '@/common/context/request-context'
import { redact } from '@/common/logging/redaction'
import { ReportCache } from '@/modules/reports/report-cache.service'

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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly reports?: ReportCache,
  ) {}

  /**
   * Jurnalga yozadi — JORIY tenant tranzaksiyasida (so'rovniki yoki `tx`).
   *
   * Xato yutilmaydi: yozuv amal bilan bitta tranzaksiyada, ya'ni jurnal
   * yozilmasa amal ham saqlanmaydi. Tenantsiz kontekstda (login) —
   * jurnal yo'q.
   */
  async log(input: AuditInput, tx?: TenantTx): Promise<void> {
    const ctx = tryContext()
    if (!ctx?.tenantId) return

    const client = tx ?? this.prisma.scoped
    await client.auditEntry.create({ data: auditRow(ctx.tenantId, ctx.userId, input) })
    // Har pul/ombor amali jurnalga tushadi (I22) — hisobot keshi shu yerda
    // bekor qilinadi (T-085). Tranzaksiya yiqilsa ham zarar yo'q: faqat kesh o'tkazib yuboriladi
    this.reports?.invalidate(ctx.tenantId)
  }

  /** Bir amal bir nechta yozuvga tegsa (masalan bir raqamli mijozlar) — bitta INSERT */
  async logMany(inputs: readonly AuditInput[], tx?: TenantTx): Promise<void> {
    const ctx = tryContext()
    if (!ctx?.tenantId || inputs.length === 0) return

    const client = tx ?? this.prisma.scoped
    await client.auditEntry.createMany({ data: inputs.map((input) => auditRow(ctx.tenantId!, ctx.userId, input)) })
    this.reports?.invalidate(ctx.tenantId)
  }
}

function auditRow(tenantId: string, userId: string | undefined, input: AuditInput): Prisma.AuditEntryCreateManyInput {
  return {
    tenantId,
    userId: userId ?? null,
    action: input.action,
    detail: input.detail?.slice(0, 500),
    entityType: input.entityType,
    entityId: input.entityId,
    diff: input.diff ? (redact(input.diff) as Prisma.InputJsonValue) : undefined,
  }
}
