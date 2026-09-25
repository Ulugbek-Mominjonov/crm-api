import { timingSafeEqual } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { enrichContext } from '@/common/context/request-context'
import type { Env } from '@/config/env.schema'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { BillingService, type LockedInvoice } from './billing.service'

/** Payme xato kodlari (Merchant API) */
export const PAYME = {
  UNAUTHORIZED: -32504,
  METHOD_NOT_FOUND: -32601,
  INVALID_REQUEST: -32600,
  WRONG_AMOUNT: -31001,
  TX_NOT_FOUND: -31003,
  CANNOT_CANCEL: -31007,
  CANNOT_PERFORM: -31008,
  /** Hisob (`account`) xatolari oralig'i: -31050…-31099 */
  ORDER_NOT_FOUND: -31050,
  ORDER_BUSY: -31051,
} as const

/** Payme tranzaksiya holatlari */
const STATE = { CREATED: 1, PERFORMED: 2, CANCELLED: -1, CANCELLED_AFTER_PERFORM: -2 } as const
/** Yaratilgan, lekin bajarilmagan tranzaksiya shuncha vaqtdan keyin eskiradi (Payme qoidasi) */
const TX_TIMEOUT_MS = 12 * 3_600_000
/** Payme bekor qilish sababi: vaqt tugadi */
const REASON_TIMEOUT = 4
/** So'm → tiyin */
const TIYIN = 100n

export interface PaymeRequest {
  id: unknown
  method: string
  params: Record<string, unknown>
}

type Result = Record<string, unknown>
export type PaymeResponse = { id: unknown; result: Result } | { id: unknown; error: { code: number; message: Record<string, string>; data?: string } }

class PaymeError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: string,
  ) {
    super(message)
  }
}

/**
 * Payme Merchant API (T-126): JSON-RPC, HTTP har doim 200. Kirish —
 * `Authorization: Basic base64("Paycom:" + PAYME_KEY)`. Summa — tiyinda.
 * Barcha usullar idempotent: takroriy so'rov o'sha javobni oladi, tarif
 * faqat `PerformTransaction` da va bir marta uzayadi.
 */
@Injectable()
export class PaymeService {
  private readonly logger = new Logger(PaymeService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async handle(req: PaymeRequest, authorization: string | undefined): Promise<PaymeResponse> {
    try {
      this.authorize(authorization)
      return { id: req.id, result: await this.dispatch(req.method, req.params ?? {}) }
    } catch (err) {
      if (!(err instanceof PaymeError)) throw err
      if (err.code === PAYME.UNAUTHORIZED) this.logger.warn('Payme: kirish kaliti noto‘g‘ri')
      return { id: req.id, error: { code: err.code, message: { uz: err.message, ru: err.message, en: err.message }, ...(err.data && { data: err.data }) } }
    }
  }

  private authorize(authorization: string | undefined): void {
    const key = this.config.get('PAYME_KEY', { infer: true })
    const expected = key ? Buffer.from(`Basic ${Buffer.from(`Paycom:${key}`).toString('base64')}`) : undefined
    const given = Buffer.from(authorization ?? '')
    if (!expected || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new PaymeError(PAYME.UNAUTHORIZED, 'Ruxsat yo‘q')
    }
  }

  private dispatch(method: string, params: Record<string, unknown>): Promise<Result> {
    switch (method) {
      case 'CheckPerformTransaction':
        return this.byOrder(params, async (_tx, invoice) => {
          this.assertPayable(invoice, params)
          return { allow: true }
        })
      case 'CreateTransaction':
        return this.byOrder(params, (tx, invoice) => this.create(tx, invoice, params))
      case 'PerformTransaction':
        return this.byTransaction(params, (tx, invoice) => this.perform(tx, invoice))
      case 'CancelTransaction':
        return this.byTransaction(params, (tx, invoice) => this.cancel(tx, invoice, Number(params.reason ?? 0)))
      case 'CheckTransaction':
        return this.byTransaction(params, async (_tx, invoice) => transactionView(invoice))
      case 'GetStatement':
        return this.statement(Number(params.from), Number(params.to))
      default:
        throw new PaymeError(PAYME.METHOD_NOT_FOUND, `Noma’lum usul: ${method}`)
    }
  }

  private async create(tx: TenantTx, invoice: LockedInvoice, params: Record<string, unknown>): Promise<Result> {
    const txId = String(params.id ?? '')
    if (invoice.providerTxId === txId) {
      // Takroriy so'rov: holati o'zgarmagan bo'lsa — o'sha javob
      if (invoice.state !== 'pending') throw new PaymeError(PAYME.CANNOT_PERFORM, 'Tranzaksiya yakunlangan')
      if (Date.now() - Number(invoice.providerTime) > TX_TIMEOUT_MS) {
        await this.billing.cancel(tx, invoice, REASON_TIMEOUT)
        throw new PaymeError(PAYME.CANNOT_PERFORM, 'Tranzaksiya muddati o‘tdi')
      }
      return { create_time: Number(invoice.providerTime), transaction: invoice.id, state: STATE.CREATED }
    }
    this.assertPayable(invoice, params)
    await this.billing.bind(tx, invoice, 'payme', txId, BigInt(Number(params.time ?? Date.now())))
    return { create_time: Number(invoice.providerTime), transaction: invoice.id, state: STATE.CREATED }
  }

  private async perform(tx: TenantTx, invoice: LockedInvoice): Promise<Result> {
    if (invoice.state === 'pending') {
      if (Date.now() - Number(invoice.providerTime) > TX_TIMEOUT_MS) {
        await this.billing.cancel(tx, invoice, REASON_TIMEOUT)
        throw new PaymeError(PAYME.CANNOT_PERFORM, 'Tranzaksiya muddati o‘tdi')
      }
      await this.billing.applyPayment(tx, invoice)
    }
    if (invoice.state !== 'paid') throw new PaymeError(PAYME.CANNOT_PERFORM, 'Bekor qilingan tranzaksiyani bajarib bo‘lmaydi')
    return { transaction: invoice.id, perform_time: invoice.paidAt!.getTime(), state: STATE.PERFORMED }
  }

  /** Bajarilgan to'lovni qaytarish (tarifni orqaga surish) qo'llanmaydi — -31007 */
  private async cancel(tx: TenantTx, invoice: LockedInvoice, reason: number): Promise<Result> {
    if (invoice.state === 'paid') throw new PaymeError(PAYME.CANNOT_CANCEL, 'Tarif faollashgan — bekor qilib bo‘lmaydi')
    if (invoice.state === 'pending') await this.billing.cancel(tx, invoice, reason)
    return { transaction: invoice.id, cancel_time: invoice.cancelledAt!.getTime(), state: STATE.CANCELLED }
  }

  /** Buyurtma (`account.order_id`) bo'yicha: summa va holat tekshiruvi */
  private assertPayable(invoice: LockedInvoice, params: Record<string, unknown>): void {
    if (BigInt(Math.round(Number(params.amount ?? -1))) !== invoice.amount * TIYIN) {
      throw new PaymeError(PAYME.WRONG_AMOUNT, 'Summa noto‘g‘ri')
    }
    if (invoice.state === 'paid' || invoice.state === 'cancelled') {
      throw new PaymeError(PAYME.CANNOT_PERFORM, 'Hisob-faktura yopilgan')
    }
    if (invoice.state === 'pending') throw new PaymeError(PAYME.ORDER_BUSY, 'Boshqa tranzaksiya kutilmoqda', 'order_id')
  }

  private async byOrder(params: Record<string, unknown>, fn: (tx: TenantTx, invoice: LockedInvoice) => Promise<Result>): Promise<Result> {
    const account = (params.account ?? {}) as Record<string, unknown>
    const orderId = String(account.order_id ?? '')
    const tenantId = await this.billing.tenantOfInvoice(orderId)
    if (!tenantId) throw new PaymeError(PAYME.ORDER_NOT_FOUND, 'Buyurtma topilmadi', 'order_id')
    return this.inTenant(tenantId, orderId, PAYME.ORDER_NOT_FOUND, fn)
  }

  private async byTransaction(params: Record<string, unknown>, fn: (tx: TenantTx, invoice: LockedInvoice) => Promise<Result>): Promise<Result> {
    const txId = String(params.id ?? '')
    const tenantId = await this.billing.tenantOfTransaction('payme', txId)
    if (!tenantId) throw new PaymeError(PAYME.TX_NOT_FOUND, 'Tranzaksiya topilmadi')
    const [row] = await this.prisma.inTenantTransaction(tenantId, (tx) =>
      tx.billingInvoice.findMany({ where: { provider: 'payme', providerTxId: txId }, select: { id: true } }),
    )
    return this.inTenant(tenantId, row!.id, PAYME.TX_NOT_FOUND, fn)
  }

  /**
   * Do'kon tranzaksiyasi, hisob-faktura qulfi ostida; jurnal shu do'konga.
   * Payme xatosi QIYMAT sifatida qaytadi — tranzaksiya COMMIT bo'ladi:
   * muddati o'tgan tranzaksiyani bekor qilish xato javob bilan birga saqlansin.
   */
  private async inTenant(
    tenantId: string,
    invoiceId: string,
    missing: number,
    fn: (tx: TenantTx, invoice: LockedInvoice) => Promise<Result>,
  ): Promise<Result> {
    enrichContext({ tenantId })
    const outcome = await this.prisma.inTenantTransaction(tenantId, async (tx): Promise<{ result: Result } | { error: PaymeError }> => {
      const invoice = await this.billing.lock(tx, tenantId, invoiceId)
      if (!invoice) return { error: new PaymeError(missing, 'Topilmadi') }
      try {
        return { result: await fn(tx, invoice) }
      } catch (err) {
        if (err instanceof PaymeError) return { error: err }
        throw err
      }
    })
    if ('error' in outcome) throw outcome.error
    return outcome.result
  }

  private async statement(from: number, to: number): Promise<Result> {
    const rows = await this.prisma.$queryRaw<
      { id: string; amount: bigint; providerTxId: string; providerTime: bigint; state: string; paidAt: Date | null; cancelledAt: Date | null; cancelReason: number | null }[]
    >`SELECT id, amount, provider_tx_id AS "providerTxId", provider_time AS "providerTime", state::text AS state,
             paid_at AS "paidAt", cancelled_at AS "cancelledAt", cancel_reason AS "cancelReason"
        FROM billing_statement('payme', ${from}::bigint, ${to}::bigint)`
    return {
      transactions: rows.map((r) => ({
        id: r.providerTxId,
        time: Number(r.providerTime),
        amount: Number(r.amount * TIYIN),
        account: { order_id: r.id },
        ...transactionView({ ...r, id: r.id, state: r.state } as unknown as LockedInvoice),
      })),
    }
  }
}

function paymeState(invoice: LockedInvoice): number {
  if (invoice.state === 'paid') return STATE.PERFORMED
  if (invoice.state === 'cancelled') return invoice.paidAt ? STATE.CANCELLED_AFTER_PERFORM : STATE.CANCELLED
  return STATE.CREATED
}

function transactionView(invoice: LockedInvoice): Result {
  return {
    create_time: Number(invoice.providerTime ?? 0),
    perform_time: invoice.paidAt?.getTime() ?? 0,
    cancel_time: invoice.cancelledAt?.getTime() ?? 0,
    transaction: invoice.id,
    state: paymeState(invoice),
    reason: invoice.cancelReason ?? null,
  }
}
