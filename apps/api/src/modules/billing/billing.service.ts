import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma, type InvoiceState } from '@prisma/client'
import {
  BILLING_PERIODS, PAID_PLANS, PLAN_INFO, PLAN_MONTHLY_PRICE, PLAN_NAMES, planLimits, planPrice, prepayDiscountPct, TRIAL_DAYS, TRIAL_PLAN,
  type PlanName,
} from '@crm/shared'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { DomainError, NotFoundError, PermissionDeniedError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import type { Env } from '@/config/env.schema'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { bucketOf } from '@/modules/files/files.service'
import { S3Service } from '@/modules/files/s3.service'
import { PlatformSettingsService } from '@/modules/platform/platform-settings.service'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { OwnerNotifierService } from '@/modules/telegram/owner-notifier.service'
import type { TelegramFile } from '@/modules/telegram/telegram.client'
import { TenantStatusService } from '@/modules/tenants/tenant-status.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { onCommit, requireTenantTx } from '@/prisma/tenant-tx'
import type { CardClaimDto, CheckoutDto, CreateInvoiceDto, InvoiceDto, PlanCatalogDto, PlanOfferDto } from './dto/billing.dto'

const INVOICE_SELECT = {
  id: true, plan: true, months: true, amount: true, state: true, provider: true,
  payerCard: true, payerNote: true, transferredAt: true, claimedAt: true, receiptFileId: true, rejectReason: true,
  createdAt: true, paidAt: true,
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

/** Karta to'lovi cheki — egasiga Telegram'da fayl sifatida (T-149) */
interface ReceiptFile {
  id: string
  key: string
  bucket: string
  mime: string
  originalName: string | null
}

const HISTORY_LIMIT = 50
/** Onlayn provayderlar — to'lovi haqida egasiga Telegram xabar ketadi (T-137); qo'lda yozilganlar (`cash` …) emas */
const ONLINE_PROVIDERS: ReadonlySet<string> = new Set(['payme', 'click'])
/** O'tkazma vaqti: soat farqi uchun bir oz kelajak, eskisi — oy ichida (egasi bank tarixidan topa olsin) */
const TRANSFER_CLOCK_SKEW_MS = 5 * 60_000
const TRANSFER_MAX_AGE_MS = 30 * 86_400_000

/**
 * Obuna (T-126, T-149): hisob-faktura → to'lov (Payme/Click yoki egasining
 * kartasiga o'tkazma) → tasdiq. Tarif FAQAT to'lov tasdiqlanganda
 * (`applyPayment`) o'zgaradi; takroriy tasdiq (webhook qayta keladi)
 * ikkinchi marta uzaytirmaydi — holat `pending` dan `paid` ga faqat bir
 * marta o'tadi (qator qulfi ostida).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly statuses: TenantStatusService,
    private readonly ownerNotifier: OwnerNotifierService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly events: DomainEvents,
    private readonly s3: S3Service,
  ) {}

  /** Tariflar, narxlar va ishlaydigan to'lov usullari (T-148) — ochiq: ro'yxatdan o'tish sahifasi ham ko'rsatadi */
  async catalog(): Promise<PlanCatalogDto> {
    const card = await this.platformSettings.paymentCard()
    return {
      plans: PLAN_NAMES.map(planOffer),
      trial: { plan: TRIAL_PLAN, days: TRIAL_DAYS },
      methods: { card: card !== null, payme: this.paymeConfigured(), click: this.clickConfigured() },
      sms: this.config.get('SMS_PROVIDER', { infer: true }) !== 'none',
    }
  }

  async createInvoice(dto: CreateInvoiceDto, user: AuthContext): Promise<CheckoutDto> {
    assertAdmin(user)
    const { tenantId } = requireTenantTx()
    const amount = planPrice(dto.plan as PlanName, dto.months)
    const invoice = await this.prisma.scoped.billingInvoice.create({
      data: { id: uuidv7(), tenantId, plan: dto.plan, months: dto.months, amount: BigInt(amount), createdById: user.userId },
      select: INVOICE_SELECT,
    })
    await this.audit.log({ action: 'billing.invoice', entityType: 'invoice', entityId: invoice.id, diff: { plan: dto.plan, months: dto.months, amount } })
    return {
      invoice: toInvoiceDto(invoice),
      payme: this.paymeUrl(invoice.id, amount),
      click: this.clickUrl(invoice.id, amount),
      card: await this.platformSettings.paymentCard(),
    }
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

  /**
   * «To'ladim» (T-149): administrator egasining kartasiga o'tkazdi. Hisob-faktura
   * `pending` (`provider: card`) — tarif hali o'zgarmaydi; egasi bankdagi
   * tushum bilan solishtirib tasdiqlaydi yoki rad etadi. Bir do'konda bir
   * vaqtda bitta tekshiruvdagi da'vo (qisman noyob indeks — poyga uchun ham).
   */
  async claimCard(id: string, dto: CardClaimDto, user: AuthContext): Promise<InvoiceDto> {
    assertAdmin(user)
    const { tenantId } = requireTenantTx()
    const tx = this.prisma.scoped
    const transferredAt = transferTime(dto.transferredAt)
    const invoice = await this.lock(tx, tenantId, id)
    if (!invoice) throw new NotFoundError('Hisob-faktura', id)
    if (!(await this.platformSettings.paymentCard())) {
      throw new DomainError('PAYMENT_METHOD_UNAVAILABLE', 'Karta orqali to‘lov hozir yoqilmagan — platforma egasiga murojaat qiling', [
        { code: 'PAYMENT_METHOD_UNAVAILABLE', meta: { method: 'card' } },
      ])
    }
    if (invoice.state !== 'created') {
      throw new DomainError('INVALID_STATUS_TRANSITION', 'Hisob-faktura to‘langan, tekshiruvda yoki bekor qilingan — yangisini oching', [
        { code: 'INVALID_STATUS_TRANSITION', meta: { state: invoice.state } },
      ])
    }
    const review = await tx.billingInvoice.findFirst({ where: { state: 'pending', provider: 'card' }, select: { id: true } })
    if (review) {
      throw new DomainError('ALREADY_EXISTS', 'Avvalgi karta to‘lovi egasi tekshiruvida — natijasini kuting', [
        { code: 'ALREADY_EXISTS', meta: { invoiceId: review.id } },
      ])
    }
    const receipt = dto.receiptFileId ? await this.receipt(tx, dto.receiptFileId) : null
    const row = await tx.billingInvoice
      .update({
        where: { id },
        data: {
          state: 'pending', provider: 'card', payerCard: dto.payerCard, payerNote: dto.note ?? null,
          transferredAt, claimedAt: new Date(), receiptFileId: receipt?.id ?? null,
        },
        select: INVOICE_SELECT,
      })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: 'Hisob-faktura', id }))
    await this.audit.log({
      action: 'billing.cardClaimed', entityType: 'invoice', entityId: id,
      diff: { amount: Number(row.amount), payerCard: dto.payerCard, transferredAt: transferredAt.toISOString(), receipt: receipt !== null },
    })
    onCommit(() => this.notifyCardClaim(tenantId, row, receipt))
    return toInvoiceDto(row)
  }

  /** Hisob-faktura qulfi (webhook va egasi — tenant tranzaksiyasida) */
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
   * joriy muddat oxiridan (sinovdagi qolgan kunlar ham saqlanadi), boshqa
   * tarif bo'lsa hozirdan uzayadi; sinov belgisi tozalanadi, to'xtatilgan
   * do'kon ochiladi. Chaqiruvchi `pending` holatni tekshirgan.
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
             trial_ends_at = NULL,
             status = CASE WHEN status = 'suspended' THEN 'active' ELSE status END
       WHERE id = ${invoice.tenantId}::uuid`
    await this.audit.log(
      { action: 'billing.paid', entityType: 'invoice', entityId: invoice.id, diff: { plan: invoice.plan, months: invoice.months, amount: Number(invoice.amount), provider: invoice.provider } },
      tx,
    )
    onCommit(() => this.statuses.invalidate(invoice.tenantId))
    this.events.publish('billing.invoice', { invoiceId: invoice.id, state: 'paid' })
    // Egasiga xabar (T-137) — faqat onlayn to'lov: qo'lda yozilganini va kartanikini egasi o'zi tasdiqlagan
    if (invoice.provider && ONLINE_PROVIDERS.has(invoice.provider)) {
      const { tenantId, months, provider } = invoice
      const [amount, plan] = [Number(invoice.amount), planLabel(invoice.plan)]
      onCommit(() => this.ownerNotifier.paymentReceived({ tenantId, amount, plan, months, provider }))
    }
    Object.assign(invoice, { state: 'paid', paidAt: paid!.paidAt })
    return paid!.paidAt
  }

  /**
   * Egasi karta to'lovini bankda ko'rdi (T-149): kim tasdiqlagani va izohi
   * yoziladi, tarif `applyPayment` bilan (Payme/Click bilan bir xil qoida).
   * Chaqiruvchi holatni (`pending`, `card`) tekshirgan.
   */
  async confirmCard(tx: TenantTx, invoice: LockedInvoice, adminId: string, note?: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE billing_invoices SET platform_admin_id = ${adminId}::uuid, note = COALESCE(${note ?? null}, note)
       WHERE tenant_id = ${invoice.tenantId}::uuid AND id = ${invoice.id}::uuid`
    await this.applyPayment(tx, invoice)
  }

  /** Egasi tushumni topmadi (T-149): hisob-faktura `cancelled`, sabab — do'konga ko'rinadi; tarif o'zgarmaydi */
  async rejectCard(tx: TenantTx, invoice: LockedInvoice, adminId: string, reason: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE billing_invoices SET state = 'cancelled', cancelled_at = now(), reject_reason = ${reason}, platform_admin_id = ${adminId}::uuid
       WHERE tenant_id = ${invoice.tenantId}::uuid AND id = ${invoice.id}::uuid`
    await this.audit.log({ action: 'billing.cardRejected', entityType: 'invoice', entityId: invoice.id, detail: 'Platforma', diff: { reason } }, tx)
    this.events.publish('billing.invoice', { invoiceId: invoice.id, state: 'cancelled' })
    Object.assign(invoice, { state: 'cancelled' })
  }

  async cancel(tx: TenantTx, invoice: LockedInvoice, reason: number): Promise<Date> {
    const [row] = await tx.$queryRaw<{ cancelledAt: Date }[]>`
      UPDATE billing_invoices SET state = 'cancelled', cancelled_at = now(), cancel_reason = ${reason}
       WHERE tenant_id = ${invoice.tenantId}::uuid AND id = ${invoice.id}::uuid
      RETURNING cancelled_at AS "cancelledAt"`
    Object.assign(invoice, { state: 'cancelled', cancelledAt: row!.cancelledAt, cancelReason: reason })
    return row!.cancelledAt
  }

  /** Webhook va egasi uchun: hisob-faktura qaysi do'konniki (faqat id) */
  async tenantOfInvoice(id: string): Promise<string | undefined> {
    if (!UUID.test(id)) return undefined
    const [row] = await this.prisma.$queryRaw<{ tenantId: string | null }[]>`SELECT billing_invoice_tenant(${id}::uuid) AS "tenantId"`
    return row?.tenantId ?? undefined
  }

  async tenantOfTransaction(provider: 'payme' | 'click', txId: string): Promise<string | undefined> {
    const [row] = await this.prisma.$queryRaw<{ tenantId: string | null }[]>`SELECT billing_tx_tenant(${provider}, ${txId}) AS "tenantId"`
    return row?.tenantId ?? undefined
  }

  /** Chek — shu do'konning tasdiqlangan `payment_receipt` fayli; boshqa tenantniki RLS ostida ko'rinmaydi */
  private async receipt(tx: TenantTx, fileId: string): Promise<ReceiptFile> {
    const file = await tx.file.findFirst({
      where: { id: fileId, kind: 'payment_receipt', status: 'ready', deletedAt: null },
      select: { id: true, key: true, bucket: true, mime: true, originalName: true },
    })
    if (file) return file
    throw new DomainError('REFERENCE_NOT_FOUND', 'Chek topilmadi yoki hali tasdiqlanmagan', [
      { field: 'receiptFileId', code: 'REFERENCE_NOT_FOUND' },
    ])
  }

  /** Egasiga xabar (COMMIT'dan keyin, chaqiruvchi kutmaydi); chekni o'qib bo'lmasa — chek siz */
  private async notifyCardClaim(tenantId: string, invoice: InvoiceRow, receipt: ReceiptFile | null): Promise<void> {
    let document: TelegramFile | null = null
    if (receipt) {
      try {
        const content = await this.s3.getBuffer(bucketOf(receipt), receipt.key)
        document = { name: receipt.originalName ?? `chek-${receipt.id}`, content, mime: receipt.mime }
      } catch (err) {
        this.logger.error({ err, invoiceId: invoice.id }, 'Karta to‘lovi cheki o‘qilmadi — xabar cheksiz ketadi')
      }
    }
    this.ownerNotifier.cardClaimed({
      tenantId, invoiceId: invoice.id, amount: Number(invoice.amount), plan: planLabel(invoice.plan), months: invoice.months,
      payerCard: invoice.payerCard!, transferredAt: invoice.transferredAt!, note: invoice.payerNote, receipt: document,
    })
  }

  private paymeConfigured(): boolean {
    return !!this.config.get('PAYME_MERCHANT_ID', { infer: true })
  }

  private clickConfigured(): boolean {
    return !!this.config.get('CLICK_SERVICE_ID', { infer: true }) && !!this.config.get('CLICK_MERCHANT_ID', { infer: true })
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

/** Mijozga ko'rinadigan tarif nomi (`business` → `Biznes`); noma'lum kalit — o'zi */
export function planLabel(plan: string): string {
  return (PLAN_INFO as Record<string, { label: string } | undefined>)[plan]?.label ?? plan
}

/** O'tkazma vaqti: berilmasa — hozir; kelajakda yoki 30 kundan eski — 400 */
function transferTime(value: string | undefined): Date {
  if (value === undefined) return new Date()
  const at = new Date(value)
  const now = Date.now()
  if (at.getTime() > now + TRANSFER_CLOCK_SKEW_MS || at.getTime() < now - TRANSFER_MAX_AGE_MS) {
    throw new DomainError('VALIDATION_FAILED', 'O‘tkazma vaqti kelajakda yoki 30 kundan eski bo‘lmasin', [
      { field: 'transferredAt', code: 'VALIDATION_FAILED' },
    ])
  }
  return at
}

function planOffer(key: PlanName): PlanOfferDto {
  const sellable = PAID_PLANS.includes(key)
  return {
    key,
    ...PLAN_INFO[key],
    sellable,
    monthlyPrice: PLAN_MONTHLY_PRICE[key],
    prices: sellable ? BILLING_PERIODS.map((months) => ({ months, amount: planPrice(key, months), discountPct: prepayDiscountPct(months) })) : [],
    limits: planLimits(key),
  }
}

function toInvoiceDto(row: InvoiceRow): InvoiceDto {
  return { ...row, amount: Number(row.amount) }
}
