import { Injectable } from '@nestjs/common'
import type { InvoiceState } from '@prisma/client'
import { PAID_PLANS, PLAN_MONTHLY_PRICE, type PlanName } from '@crm/shared'
import { toPaged, type Paged } from '@/common/crud/paging'
import { uuidv7 } from '@/common/ids'
import { addDays, businessDayStart } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import { BillingService } from '@/modules/billing/billing.service'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { TenantStatusService } from '@/modules/tenants/tenant-status.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { onCommit } from '@/prisma/tenant-tx'
import type { GrantPlanDto, PlatformInvoiceDto, PlatformInvoicesQueryDto } from './dto/platform-billing.dto'
import { PlatformAuditService } from './platform-audit.service'

interface InvoiceRow {
  id: string
  tenantId: string
  tenantName: string
  plan: string
  months: number
  amount: bigint
  state: InvoiceState
  provider: string | null
  note: string | null
  createdAt: Date
  paidAt: Date | null
  total: bigint
}

/**
 * Egasi to'lov nazorati (T-135): qo'lda to'lov (naqd, o'tkazma, bonus)
 * ham HISOB-FAKTURA — tarix bir joyda, tarif Payme/Click bilan bir xil
 * `applyPayment` orqali uzayadi (joriy muddat oxiridan yoki hozirdan,
 * `suspended` ochiladi, `blocked` ochilMAYDI).
 */
@Injectable()
export class PlatformBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly statuses: TenantStatusService,
    private readonly audit: AuditService,
    private readonly platformAudit: PlatformAuditService,
    private readonly events: DomainEvents,
  ) {}

  /** Do'kon tranzaksiyasi ichida (chaqiruvchi `withTenant` bilan ochgan) */
  async grant(tx: TenantTx, tenantId: string, dto: GrantPlanDto, adminId: string): Promise<void> {
    const plan = dto.plan as PlanName
    if (!PAID_PLANS.includes(plan)) {
      await this.toFree(tx, tenantId, dto.note)
    } else {
      const amount = dto.amount ?? (dto.provider === 'bonus' ? 0 : PLAN_MONTHLY_PRICE[plan] * dto.months!)
      const id = uuidv7()
      await tx.billingInvoice.create({
        data: {
          id, tenantId, plan, months: dto.months!, amount: BigInt(amount), state: 'pending',
          provider: dto.provider, note: dto.note, platformAdminId: adminId,
        },
      })
      const invoice = (await this.billing.lock(tx, tenantId, id))!
      await this.billing.applyPayment(tx, invoice)
    }
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { status: true, plan: true, planExpiresAt: true } })
    this.events.publish('tenant.status', { status: tenant.status, plan: tenant.plan })
    await this.platformAudit.log({
      action: 'tenant.plan', targetTenantId: tenantId, entityType: 'tenant', entityId: tenantId,
      diff: { plan: dto.plan, months: dto.months ?? null, provider: dto.provider ?? null, amount: dto.amount ?? null, note: dto.note ?? null, planExpiresAt: tenant.planExpiresAt?.toISOString() ?? null },
    }, tx)
  }

  /** Bepulga tushirish: muddat o'chadi; to'lanmagani uchun to'xtatilgan bo'lsa — ochiladi (endi bepul) */
  private async toFree(tx: TenantTx, tenantId: string, note?: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE tenants SET plan = 'free', plan_expires_at = NULL,
             status = CASE WHEN status = 'suspended' THEN 'active' ELSE status END
       WHERE id = ${tenantId}::uuid`
    await this.audit.log({ action: 'billing.planChanged', entityType: 'tenant', entityId: tenantId, detail: 'Platforma', diff: { plan: 'free', note: note ?? null } }, tx)
    onCommit(() => this.statuses.invalidate(tenantId))
  }

  async invoices(query: PlatformInvoicesQueryDto): Promise<Paged<PlatformInvoiceDto>> {
    const from = query.dateFrom ? businessDayStart(query.dateFrom) : null
    const to = query.dateTo ? businessDayStart(addDays(query.dateTo, 1)) : null
    const rows = await this.prisma.$queryRaw<InvoiceRow[]>`
      SELECT id, tenant_id AS "tenantId", tenant_name AS "tenantName", plan, months, amount, state, provider, note,
             created_at AS "createdAt", paid_at AS "paidAt", total
        FROM platform_invoices(${query.tenantId ?? null}::uuid, ${query.state ?? null}::"InvoiceState", ${query.provider ?? null},
                               ${from}::timestamptz, ${to}::timestamptz, ${query.pageSize}::int, ${(query.page - 1) * query.pageSize}::int)`
    const total = rows.length > 0 ? Number(rows[0]!.total) : await this.countWhenPageEmpty(query, from, to)
    return toPaged(rows.map(({ total: _total, amount, ...row }) => ({ ...row, amount: Number(amount) })), total, query)
  }

  /** Sahifa bo'sh (chegaradan tashqari) — `total` oynali funksiyadan kelmaydi, birinchi sahifadan olinadi */
  private async countWhenPageEmpty(query: PlatformInvoicesQueryDto, from: Date | null, to: Date | null): Promise<number> {
    if (query.page === 1) return 0
    const [first] = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT total FROM platform_invoices(${query.tenantId ?? null}::uuid, ${query.state ?? null}::"InvoiceState", ${query.provider ?? null},
                                          ${from}::timestamptz, ${to}::timestamptz, 1, 0)`
    return first ? Number(first.total) : 0
  }
}
