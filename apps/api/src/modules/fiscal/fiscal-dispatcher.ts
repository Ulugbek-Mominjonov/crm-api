import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { lineTotal } from '@crm/shared'
import { runWithContext } from '@/common/context/request-context'
import { moneyFromDb, qtyFromDb } from '@/common/crud/convert'
import type { Env } from '@/config/env.schema'
import { AuditService } from '@/modules/audit/audit.service'
import { JobQueue } from '@/modules/queue/job-queue'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { FISCAL_PROVIDER, FiscalError, type FiscalPayload, type FiscalProvider } from './fiscal.provider'

/** Bir aylanishda bir tenantdan: 20 × 10 s (so'rov chegarasi) ijaradan qisqa */
const BATCH_SIZE = 20
/** Yuborilayotgan chek "ijarasi": ishchi o'lsa, shundan keyin boshqasi oladi */
const LEASE_SEC = 300
/** Qayta urinish: 1, 2, 4 … daqiqa, ko'pi bilan soatiga bir — OFD tiklanguncha (chek — qonuniy talab) */
const RETRY_BASE_SEC = 60
const RETRY_MAX_SEC = 3_600
/** Shuncha vaqt fiskallanmagan chek — administratorga ogohlantirish (08 §8.9) */
export const ALERT_AFTER_MS = 24 * 3_600_000
const ERROR_MAX = 500

const SALE_SELECT = {
  id: true, number: true, type: true, createdAt: true, subtotal: true, discount: true, taxRate: true, tax: true,
  deliveryFee: true, total: true, paidCash: true, paidCard: true, paidTransfer: true, change: true, outstanding: true,
  relatedSaleId: true,
  items: { select: { name: true, unit: true, qty: true, price: true, discount: true }, orderBy: { lineNo: 'asc' } },
} satisfies Prisma.SaleSelect

type FiscalSale = Prisma.SaleGetPayload<{ select: typeof SALE_SELECT }>

interface Claimed {
  id: string
  saleId: string
  attempts: number
  createdAt: Date
  alertedAt: Date | null
}

interface Outcome {
  id: string
  saleId: string
  status: 'confirmed' | 'pending' | 'failed'
  fiscal_id: string | null
  qr_payload: string | null
  error: string | null
  retry_in: number
  alert: boolean
}

export interface FiscalDispatchResult {
  confirmed: number
  retried: number
  failed: number
}

/**
 * Fiskallash ishchisi (T-129): navbatdan (`fiscal_receipts`) oladi, OFD ga
 * yuboradi, fiskal raqam va QR ni saqlaydi. SMS navbati bilan bir naqsh:
 *
 * - Olish — qisqa tranzaksiyada `FOR UPDATE SKIP LOCKED` va "ijara"
 *   (`sent`, `next_attempt_at`): bir necha instansiya chekni ikki marta
 *   yubormaydi; takror bo'lsa ham OFD `Idempotency-Key` bo'yicha taniydi
 * - OFD ga — tranzaksiyadan TASHQARIDA (sekin OFD qulf/ulanish ushlamaydi)
 * - Natija — yana qisqa tranzaksiyada; tasdiqlansa `sale.fiscalized`
 * - Xato: eksponensial kechikish bilan qayta; 24 soatdan beri o'tmasa yoki
 *   OFD rad etsa — administratorga ogohlantirish (jurnal) bir marta
 */
@Injectable()
export class FiscalDispatcher implements OnApplicationBootstrap {
  private readonly logger = new Logger(FiscalDispatcher.name)
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly queue: JobQueue,
    private readonly audit: AuditService,
    private readonly events: DomainEvents,
    @Optional() @Inject(FISCAL_PROVIDER) private readonly provider: FiscalProvider | null,
  ) {}

  /** Chekdan keyin navbat darhol uyg'otadi; interval — qayta urinishlar uchun (0 — o'chiq, testlar) */
  onApplicationBootstrap(): void {
    if (!this.provider) return
    this.queue.register('fiscalize', () => this.tick())
    const every = this.config.get('OFD_DISPATCH_INTERVAL_MS', { infer: true })
    if (every > 0) this.scheduler.addInterval('fiscalize', setInterval(() => void this.tick(), every))
  }

  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.dispatch()
    } catch (err) {
      this.logger.error({ err }, 'Fiskal navbat aylanishi yiqildi')
    } finally {
      this.running = false
    }
  }

  async dispatch(now: Date = new Date()): Promise<FiscalDispatchResult> {
    const total: FiscalDispatchResult = { confirmed: 0, retried: 0, failed: 0 }
    if (!this.provider) return total
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT tenants_with_due_fiscal(${now}) AS id`
    for (const { id } of tenants) {
      // Ketma-ket ATAYLAB: OFD ga bir vaqtda bitta so'rov
      const result = await this.dispatchTenant(id, this.provider, now)
      total.confirmed += result.confirmed
      total.retried += result.retried
      total.failed += result.failed
    }
    return total
  }

  /** O'z konteksti: jurnal aynan shu do'konga, "Tizim" nomidan (sotuv so'rovi konteksti meros qolmasin) */
  private dispatchTenant(tenantId: string, provider: FiscalProvider, now: Date): Promise<FiscalDispatchResult> {
    return runWithContext({ requestId: `job:fiscalize:${tenantId}`, tenantId }, () => this.processTenant(tenantId, provider, now))
  }

  private async processTenant(tenantId: string, provider: FiscalProvider, now: Date): Promise<FiscalDispatchResult> {
    const batch = await this.prisma.inTenantTransaction(tenantId, async (tx) => {
      const claimed = await tx.$queryRaw<Claimed[]>`
        UPDATE fiscal_receipts f
           SET status = 'sent', attempts = f.attempts + 1, next_attempt_at = ${now}::timestamptz + make_interval(secs => ${LEASE_SEC})
         WHERE f.id IN (
                 SELECT id FROM fiscal_receipts
                  WHERE tenant_id = ${tenantId}::uuid AND status IN ('pending', 'sent') AND next_attempt_at <= ${now}
                  ORDER BY next_attempt_at
                  LIMIT ${BATCH_SIZE}
                    FOR UPDATE SKIP LOCKED)
        RETURNING f.id, f.sale_id AS "saleId", f.attempts, f.created_at AS "createdAt", f.alerted_at AS "alertedAt"`
      return claimed.length === 0 ? [] : this.payloads(tx, claimed)
    })
    if (batch.length === 0) return { confirmed: 0, retried: 0, failed: 0 }

    const outcomes: Outcome[] = []
    for (const item of batch) outcomes.push(await this.registerOne(provider, item.claimed, item.payload, now))

    await this.prisma.inTenantTransaction(tenantId, async (tx) => {
      await tx.$executeRaw`
        UPDATE fiscal_receipts f
           SET status = o.status::"FiscalStatus", fiscal_id = COALESCE(o.fiscal_id, f.fiscal_id),
               qr_payload = COALESCE(o.qr_payload, f.qr_payload), last_error = o.error,
               fiscalized_at = CASE WHEN o.status = 'confirmed' THEN ${now} ELSE f.fiscalized_at END,
               next_attempt_at = ${now}::timestamptz + make_interval(secs => o.retry_in),
               alerted_at = CASE WHEN o.alert THEN ${now} ELSE f.alerted_at END
          FROM jsonb_to_recordset(${JSON.stringify(outcomes)}::jsonb)
            AS o(id uuid, status text, fiscal_id text, qr_payload text, error text, retry_in int, alert boolean)
         WHERE f.tenant_id = ${tenantId}::uuid AND f.id = o.id`
      for (const o of outcomes) if (o.status === 'confirmed') this.events.publish('sale.fiscalized', { saleId: o.saleId })
      await Promise.all(
        outcomes.filter((o) => o.alert).map((o) =>
          this.audit.log(
            {
              action: o.status === 'failed' ? 'fiscal.rejected' : 'fiscal.overdue',
              entityType: 'sale',
              entityId: o.saleId,
              detail: o.status === 'failed' ? `OFD chekni rad etdi: ${o.error}` : `24 soatdan beri fiskallanmagan: ${o.error}`,
            },
            tx,
          ),
        ),
      )
    })
    return {
      confirmed: outcomes.filter((o) => o.status === 'confirmed').length,
      retried: outcomes.filter((o) => o.status === 'pending').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
    }
  }

  /** Olingan cheklar OFD shaklida; qaytarishga — asl chekning fiskal raqami */
  private async payloads(tx: TenantTx, claimed: Claimed[]): Promise<{ claimed: Claimed; payload: FiscalPayload }[]> {
    const sales = await tx.sale.findMany({ where: { id: { in: claimed.map((c) => c.saleId) } }, select: SALE_SELECT })
    const originalIds = sales.flatMap((s) => (s.relatedSaleId ? [s.relatedSaleId] : []))
    const originals = originalIds.length === 0 ? [] : await tx.fiscalReceipt.findMany({
      where: { saleId: { in: originalIds } },
      select: { saleId: true, fiscalId: true },
    })
    const bySale = new Map(sales.map((s) => [s.id, s]))
    const fiscalIdOf = new Map(originals.map((o) => [o.saleId, o.fiscalId]))
    return claimed.map((c) => {
      const sale = bySale.get(c.saleId)!
      return { claimed: c, payload: toPayload(c.id, sale, sale.relatedSaleId ? (fiscalIdOf.get(sale.relatedSaleId) ?? null) : null) }
    })
  }

  private async registerOne(provider: FiscalProvider, row: Claimed, payload: FiscalPayload, now: Date): Promise<Outcome> {
    const base = { id: row.id, saleId: row.saleId }
    try {
      const { fiscalId, qrPayload } = await provider.register(payload)
      return { ...base, status: 'confirmed', fiscal_id: fiscalId, qr_payload: qrPayload, error: null, retry_in: 0, alert: false }
    } catch (err) {
      const retryable = !(err instanceof FiscalError) || err.retryable
      const error = err instanceof Error ? err.message.slice(0, ERROR_MAX) : String(err)
      const overdue = now.getTime() - row.createdAt.getTime() >= ALERT_AFTER_MS
      const alert = row.alertedAt === null && (!retryable || overdue)
      if (alert) this.logger.error({ saleId: row.saleId, attempts: row.attempts }, `Fiskal chek o‘tmadi: ${error}`)
      if (!retryable) return { ...base, status: 'failed', fiscal_id: null, qr_payload: null, error, retry_in: 0, alert }
      return { ...base, status: 'pending', fiscal_id: null, qr_payload: null, error, retry_in: retryDelaySec(row.attempts), alert }
    }
  }
}

/** 1-urinishdan keyin 1 daqiqa, keyin ikki barobar — soatdan oshmaydi */
export function retryDelaySec(attempts: number): number {
  return Math.min(RETRY_BASE_SEC * 2 ** Math.max(attempts - 1, 0), RETRY_MAX_SEC)
}

function toPayload(externalId: string, s: FiscalSale, originalFiscalId: string | null): FiscalPayload {
  return {
    externalId,
    type: s.type,
    number: s.number,
    issuedAt: s.createdAt.toISOString(),
    items: s.items.map((i) => {
      const qty = qtyFromDb(i.qty)
      const price = moneyFromDb(i.price)
      const discount = moneyFromDb(i.discount)
      return { name: i.name, unit: i.unit, qty, price, discount, total: lineTotal(price, qty, discount) }
    }),
    subtotal: moneyFromDb(s.subtotal),
    discount: moneyFromDb(s.discount),
    taxRate: s.taxRate,
    tax: moneyFromDb(s.tax),
    deliveryFee: moneyFromDb(s.deliveryFee),
    total: moneyFromDb(s.total),
    // Bazada naqd — kassada QOLGANI (Q35); chekda — berilgani va qaytim
    payments: {
      cash: moneyFromDb(s.paidCash + s.change),
      card: moneyFromDb(s.paidCard),
      transfer: moneyFromDb(s.paidTransfer),
      credit: moneyFromDb(s.outstanding),
      change: moneyFromDb(s.change),
    },
    originalFiscalId,
  }
}
