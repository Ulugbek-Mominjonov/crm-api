import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, type InvoiceState } from '@prisma/client'
import { PLAN_MONTHLY_PRICE, type PlanName } from '@crm/shared'
import { PermissionDeniedError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import type { Env } from '@/config/env.schema'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { TenantStatusService } from '@/modules/tenants/tenant-status.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { onCommit, requireTenantTx } from '@/prisma/tenant-tx'
import type { CheckoutDto, CreateInvoiceDto, InvoiceDto } from './dto/billing.dto'

const INVOICE_SELECT = {
  id: true, plan: true, months: true, amount: true, state: true, provider: true, createdAt: true, paidAt: true,
} satisfies Prisma.BillingInvoiceSelect

type InvoiceRow = Prisma.BillingInvoiceGetPayload<{ select: typeof INVOICE_SELECT }>

/** Webhook qulflagan hisob-faktura (provayder maydonlari bilan) */
export interface LockedInvoice {
  id: string
  tenantId: string
  plan: string
  months: number
  amount: bigint
  state: InvoiceState
  provider: string | null
  providerTxId: string | null
  providerTime: bigint | null
  paidAt: Date | null
  cancelledAt: Date | null
  cancelReason: number | null
}

const HISTORY_LIMIT = 50

/**
 * Obuna (T-126): hisob-faktura → provayder (Payme/Click) → tasdiq. Tarif
 * FAQAT to'lov tasdiqlanganda (`applyPayment`) o'zgaradi; takroriy tasdiq
 * (webhook qayta keladi) ikkinchi marta uzaytirmaydi — holat `pending`
 * dan `paid` ga faqat bir marta o'tadi (qator qulfi ostida).
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly statuses: TenantStatusService,
  ) {}

  async createInvoice(dto: CreateInvoiceDto, user: AuthContext): Promise<CheckoutDto> {
    assertAdmin(user)
    const { tenantId } = requireTenantTx()
    const amount = PLAN_MONTHLY_PRICE[dto.plan as PlanName] * dto.months
    const invoice = await this.prisma.scoped.billingInvoice.create({
      data: { id: uuidv7(), tenantId, plan: dto.plan, months: dto.months, amount: BigInt(amount), createdById: user.userId },
      select: INVOICE_SELECT,
    })
    await this.audit.log({ action: 'billing.invoice', entityType: 'invoice', entityId: invoice.id, diff: { plan: dto.plan, months: dto.months, amount } })
    return { invoice: toInvoiceDto(invoice), payme: this.paymeUrl(invoice.id, amount), click: this.clickUrl(invoice.id, amount) }
  }

  async invoices(user: AuthContext): Promise<InvoiceDto[]> {
    assertAdmin(user)
    const rows = await this.prisma.scoped.billingInvoice.findMany({
      select: INVOICE_SELECT,
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    })
    return rows.map(toInvoiceDto)
  }

  /** Hisob-faktura qulfi (webhook — tenant tranzaksiyasida) */
  async lock(tx: TenantTx, tenantId: string, id: string): Promise<LockedInvoice | undefined> {
    const [row] = await tx.$queryRaw<LockedInvoice[]>`
      SELECT id, tenant_id AS "tenantId", plan, months, amount, state, provider, provider_tx_id AS "providerTxId",
             provider_time AS "providerTime", paid_at AS "paidAt", cancelled_at AS "cancelledAt", cancel_reason AS "cancelReason"
        FROM billing_invoices WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`
    return row
  }

  /** Provayder tranzaksiyasi boshlandi: hisob-faktura shu tranzaksiyaga band */
  async bind(tx: TenantTx, invoice: LockedInvoice, provider: 'payme' | 'click', txId: string, time: bigint): Promise<void> {
    await tx.$executeRaw`
      UPDATE billing_invoices SET state = 'pending', provider = ${provider}, provider_tx_id = ${txId}, provider_time = ${time}
       WHERE tenant_id = ${invoice.tenantId}::uuid AND id = ${invoice.id}::uuid`
    Object.assign(invoice, { state: 'pending', provider, providerTxId: txId, providerTime: time })
  }

  /**
   * To'lov tasdiqlandi: hisob-faktura `paid`; tarif — o'sha tarif bo'lsa
   * joriy muddat oxiridan, boshqa tarif bo'lsa hozirdan uzayadi;
   * to'xtatilgan do'kon ochiladi. Chaqiruvchi `pending` holatni tekshirgan.
   */
  async applyPayment(tx: TenantTx, invoice: LockedInvoice): Promise<Date> {
    const [paid] = await tx.$queryRaw<{ paidAt: Date }[]>`
      UPDATE billing_invoices SET state = 'paid', paid_at = now()
       WHERE tenant_id = ${invoice.tenantId}::uuid AND id = ${invoice.id}::uuid
      RETURNING paid_at AS "paidAt"`
    await tx.$executeRaw`
      UPDATE tenants
         SET plan_expires_at = CASE WHEN plan = ${invoice.plan} AND plan_expires_at > now() THEN plan_expires_at ELSE now() END
                               + make_interval(months => ${invoice.months}::int),
             plan = ${invoice.plan},
             status = CASE WHEN status = 'suspended' THEN 'active' ELSE status END
       WHERE id = ${invoice.tenantId}::uuid`
    await this.audit.log(
      { action: 'billing.paid', entityType: 'invoice', entityId: invoice.id, diff: { plan: invoice.plan, months: invoice.months, amount: Number(invoice.amount), provider: invoice.provider } },
      tx,
    )
    onCommit(() => this.statuses.invalidate(invoice.tenantId))
    Object.assign(invoice, { state: 'paid', paidAt: paid!.paidAt })
    return paid!.paidAt
  }

  async cancel(tx: TenantTx, invoice: LockedInvoice, reason: number): Promise<Date> {
    const [row] = await tx.$queryRaw<{ cancelledAt: Date }[]>`
      UPDATE billing_invoices SET state = 'cancelled', cancelled_at = now(), cancel_reason = ${reason}
       WHERE tenant_id = ${invoice.tenantId}::uuid AND id = ${invoice.id}::uuid
      RETURNING cancelled_at AS "cancelledAt"`
    Object.assign(invoice, { state: 'cancelled', cancelledAt: row!.cancelledAt, cancelReason: reason })
    return row!.cancelledAt
  }

  /** Webhook uchun: hisob-faktura qaysi do'konniki (faqat id) */
  async tenantOfInvoice(id: string): Promise<string | undefined> {
    if (!UUID.test(id)) return undefined
    const [row] = await this.prisma.$queryRaw<{ tenantId: string | null }[]>`SELECT billing_invoice_tenant(${id}::uuid) AS "tenantId"`
    return row?.tenantId ?? undefined
  }

  async tenantOfTransaction(provider: 'payme' | 'click', txId: string): Promise<string | undefined> {
    const [row] = await this.prisma.$queryRaw<{ tenantId: string | null }[]>`SELECT billing_tx_tenant(${provider}, ${txId}) AS "tenantId"`
    return row?.tenantId ?? undefined
  }

  private paymeUrl(invoiceId: string, amount: number): string | null {
    const merchant = this.config.get('PAYME_MERCHANT_ID', { infer: true })
    if (!merchant) return null
    // Payme summasi tiyinda
    const params = `m=${merchant};ac.order_id=${invoiceId};a=${amount * 100}`
    return `https://checkout.paycom.uz/${Buffer.from(params).toString('base64')}`
  }

  private clickUrl(invoiceId: string, amount: number): string | null {
    const service = this.config.get('CLICK_SERVICE_ID', { infer: true })
    const merchant = this.config.get('CLICK_MERCHANT_ID', { infer: true })
    if (!service || !merchant) return null
    const query = new URLSearchParams({ service_id: service, merchant_id: merchant, amount: String(amount), transaction_param: invoiceId })
    return `https://my.click.uz/services/pay?${query.toString()}`
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertAdmin(user: AuthContext): void {
  if (user.role !== 'admin') throw new PermissionDeniedError('Obuna — faqat administrator')
}

function toInvoiceDto(row: InvoiceRow): InvoiceDto {
  return { ...row, amount: Number(row.amount) }
}
