import { Injectable, type OnModuleInit } from '@nestjs/common'
import type { InvoiceState, Prisma } from '@prisma/client'
import { PAID_PLANS, planPrice, type PlanName } from '@crm/shared'
import { withTenant } from '@/common/context/request-context'
import { toPaged, type Paged } from '@/common/crud/paging'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { addDays, businessDayStart } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import { BillingService, planLabel } from '@/modules/billing/billing.service'
import { FilesService } from '@/modules/files/files.service'
import { PRESIGN_TTL_SEC } from '@/modules/files/s3.service'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { OwnerActionsService, type OwnerActionResult, type OwnerActor } from '@/modules/telegram/owner-actions.service'
import { PAYMENT_ACTION } from '@/modules/telegram/owner-notifier.service'
import { OWNER_ACTION_TEXT } from '@/modules/telegram/owner-texts'
import { TenantStatusService } from '@/modules/tenants/tenant-status.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { onCommit } from '@/prisma/tenant-tx'
import type { GrantPlanDto, PlatformInvoiceDto, PlatformInvoicesQueryDto, ReceiptUrlDto } from './dto/platform-billing.dto'
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
  payerCard: string | null
  payerNote: string | null
  transferredAt: Date | null
  claimedAt: Date | null
  hasReceipt: boolean
  rejectReason: string | null
  createdAt: Date
  paidAt: Date | null
  total: bigint
}

const INVOICE_SELECT = {
  id: true, tenantId: true, plan: true, months: true, amount: true, state: true, provider: true, note: true,
  payerCard: true, payerNote: true, transferredAt: true, claimedAt: true, receiptFileId: true, rejectReason: true,
  createdAt: true, paidAt: true,
} satisfies Prisma.BillingInvoiceSelect

type InvoiceRecord = Prisma.BillingInvoiceGetPayload<{ select: typeof INVOICE_SELECT }>

/** Karta to'lovi bo'yicha egasi qarori (T-149): tasdiqlash (izoh bilan) yoki rad etish (sabab do'konga ko'rinadi) */
export type CardDecision = { action: 'confirm'; note?: string } | { action: 'reject'; reason: string }

/** Qaror natijasi — panel (HTTP xato) va Telegram tugmasi (matn) o'zicha talqin qiladi */
type ReviewResult =
  | { outcome: 'done'; invoice: PlatformInvoiceDto; planExpiresAt: Date | null }
  | { outcome: 'closed'; invoice: PlatformInvoiceDto }
  | { outcome: 'missing' }

/** Telegram tugmasi bilan rad etilganda do'kon ko'radigan sabab (panelda egasi o'zi yozadi) */
const TELEGRAM_REJECT_REASON = 'Tushum topilmadi — karta raqami, summa va vaqtni tekshirib, qayta yuboring yoki egasiga murojaat qiling'

/**
 * Egasi to'lov nazorati (T-135, T-149): qo'lda to'lov (naqd, karta,
 * o'tkazma, bonus) ham HISOB-FAKTURA — tarix bir joyda, tarif Payme/Click
 * bilan bir xil `applyPayment` orqali uzayadi (joriy muddat oxiridan yoki
 * hozirdan, `suspended` ochiladi, `blocked` ochilMAYDI). Do'kon «to'ladim»
 * degan karta to'lovini egasi panelda yoki Telegram tugmasi bilan
 * tasdiqlaydi/rad etadi — ikkalasi bitta yo'l (`review`).
 */
@Injectable()
export class PlatformBillingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly statuses: TenantStatusService,
    private readonly audit: AuditService,
    private readonly platformAudit: PlatformAuditService,
    private readonly events: DomainEvents,
    private readonly files: FilesService,
    private readonly ownerActions: OwnerActionsService,
  ) {}

  /** Egasi xabaridagi tugma (`pay:ok|no:<invoiceId>`) — Telegram moduli bizni chaqiradi */
  onModuleInit(): void {
    this.ownerActions.register(PAYMENT_ACTION, (args, actor) => this.reviewFromTelegram(args, actor))
  }

  /** Do'kon tranzaksiyasi ichida (chaqiruvchi `withTenant` bilan ochgan) */
  async grant(tx: TenantTx, tenantId: string, dto: GrantPlanDto, adminId: string): Promise<void> {
    const plan = dto.plan as PlanName
    if (!PAID_PLANS.includes(plan)) {
      await this.toFree(tx, tenantId, dto.note)
    } else {
      const amount = dto.amount ?? (dto.provider === 'bonus' ? 0 : planPrice(plan, dto.months!))
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

  /** Bepulga tushirish: muddat va sinov belgisi o'chadi; to'lanmagani uchun to'xtatilgan bo'lsa — ochiladi (endi bepul) */
  private async toFree(tx: TenantTx, tenantId: string, note?: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE tenants SET plan = 'free', plan_expires_at = NULL, trial_ends_at = NULL,
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
             payer_card AS "payerCard", payer_note AS "payerNote", transferred_at AS "transferredAt", claimed_at AS "claimedAt",
             has_receipt AS "hasReceipt", reject_reason AS "rejectReason", created_at AS "createdAt", paid_at AS "paidAt", total
        FROM platform_invoices(${query.tenantId ?? null}::uuid, ${query.state ?? null}::"InvoiceState", ${query.provider ?? null},
                               ${from}::timestamptz, ${to}::timestamptz, ${query.pageSize}::int, ${(query.page - 1) * query.pageSize}::int)`
    const total = rows.length > 0 ? Number(rows[0]!.total) : await this.countWhenPageEmpty(query, from, to)
    return toPaged(rows.map(({ total: _total, amount, ...row }) => ({ ...row, amount: Number(amount) })), total, query)
  }

  /**
   * Karta to'lovi (T-149), panel: tasdiqlash — tarif uzayadi; rad etish —
   * hisob-faktura bekor, sabab do'konga. Tekshiruvda bo'lmagani — 422.
   */
  async reviewCard(id: string, decision: CardDecision, adminId: string): Promise<PlatformInvoiceDto> {
    const result = await this.review(id, decision, adminId, 'panel')
    if (result.outcome === 'missing') throw new NotFoundError('Hisob-faktura', id)
    if (result.outcome === 'closed') {
      throw new DomainError('INVALID_STATUS_TRANSITION', 'Bu to‘lov tekshiruvda emas (tasdiqlangan, rad etilgan yoki karta to‘lovi emas)', [
        { code: 'INVALID_STATUS_TRANSITION', meta: { state: result.invoice.state, provider: result.invoice.provider } },
      ])
    }
    return result.invoice
  }

  /** Karta to'lovi cheki — qisqa muddatli havola (fayl do'kon tenantida, o'sha tranzaksiyada imzolanadi) */
  async receipt(id: string): Promise<ReceiptUrlDto> {
    const tenantId = await this.billing.tenantOfInvoice(id)
    if (!tenantId) throw new NotFoundError('Hisob-faktura', id)
    return this.inTenant(tenantId, async (tx) => {
      const invoice = await tx.billingInvoice.findFirst({ where: { id }, select: { receiptFile: { select: { id: true, mime: true, deletedAt: true } } } })
      const file = invoice?.receiptFile
      if (!file || file.deletedAt) throw new NotFoundError('Chek', id)
      return { url: await this.files.downloadUrl(file.id), mime: file.mime, expiresAt: new Date(Date.now() + PRESIGN_TTL_SEC * 1000) }
    })
  }

  /**
   * Qarorning yagona yo'li: hisob-faktura qulfi ostida holat tekshiriladi
   * (ikki egasi birdan bossa — biri bajaradi, ikkinchisi `closed`), keyin
   * `BillingService` (tarif mantig'i), egasi jurnali va do'konga hodisa.
   */
  private async review(id: string, decision: CardDecision, adminId: string, via: 'panel' | 'telegram'): Promise<ReviewResult> {
    const tenantId = await this.billing.tenantOfInvoice(id)
    if (!tenantId) return { outcome: 'missing' }
    return this.inTenant(tenantId, async (tx): Promise<ReviewResult> => {
      const invoice = await this.billing.lock(tx, tenantId, id)
      if (!invoice) return { outcome: 'missing' }
      if (invoice.state !== 'pending' || invoice.provider !== 'card') return { outcome: 'closed', invoice: await this.invoiceDto(tx, id) }
      if (decision.action === 'confirm') await this.billing.confirmCard(tx, invoice, adminId, decision.note)
      else await this.billing.rejectCard(tx, invoice, adminId, decision.reason)
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { status: true, plan: true, planExpiresAt: true } })
      if (decision.action === 'confirm') this.events.publish('tenant.status', { status: tenant.status, plan: tenant.plan })
      await this.platformAudit.log({
        action: decision.action === 'confirm' ? 'invoice.confirm' : 'invoice.reject',
        adminId, targetTenantId: tenantId, entityType: 'invoice', entityId: id,
        diff: {
          plan: invoice.plan, months: invoice.months, amount: Number(invoice.amount), via,
          ...(decision.action === 'confirm'
            ? { note: decision.note ?? null, planExpiresAt: tenant.planExpiresAt?.toISOString() ?? null }
            : { reason: decision.reason }),
        },
      }, tx)
      return { outcome: 'done', invoice: await this.invoiceDto(tx, id), planExpiresAt: tenant.planExpiresAt }
    })
  }

  private async reviewFromTelegram([verdict, id]: string[], actor: OwnerActor): Promise<OwnerActionResult> {
    if ((verdict !== 'ok' && verdict !== 'no') || !id) return { text: OWNER_ACTION_TEXT.notFound, settled: false }
    const decision: CardDecision = verdict === 'ok' ? { action: 'confirm' } : { action: 'reject', reason: TELEGRAM_REJECT_REASON }
    const result = await this.review(id, decision, actor.id, 'telegram')
    if (result.outcome === 'missing') return { text: OWNER_ACTION_TEXT.notFound, settled: true }
    const { tenantName, state, plan } = result.invoice
    if (result.outcome === 'closed') {
      return { text: state === 'paid' ? OWNER_ACTION_TEXT.alreadyPaid(tenantName) : OWNER_ACTION_TEXT.alreadyClosed(tenantName), settled: true }
    }
    return {
      text: decision.action === 'confirm' ? OWNER_ACTION_TEXT.confirmed(tenantName, planLabel(plan), result.planExpiresAt!) : OWNER_ACTION_TEXT.rejected(tenantName),
      settled: true,
    }
  }

  /** Bitta hisob-faktura — ro'yxat qatori bilan bir xil shakl (do'kon nomi global jadvaldan) */
  private async invoiceDto(tx: TenantTx, id: string): Promise<PlatformInvoiceDto> {
    const row: InvoiceRecord = await tx.billingInvoice.findUniqueOrThrow({ where: { id }, select: INVOICE_SELECT })
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: row.tenantId }, select: { name: true } })
    const { receiptFileId, amount, ...rest } = row
    return { ...rest, tenantName: tenant.name, amount: Number(amount), hasReceipt: receiptFileId !== null }
  }

  /** Do'kon ichidagi amal: o'sha do'kon konteksti + tranzaksiyasi */
  private inTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenant(tenantId, () => this.prisma.inTenantTransaction(tenantId, fn))
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
