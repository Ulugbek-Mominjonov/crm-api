import { createHash, timingSafeEqual } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { enrichContext } from '@/common/context/request-context'
import type { Env } from '@/config/env.schema'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { BillingService, type LockedInvoice } from './billing.service'

/** Click SHOP API xato kodlari */
export const CLICK = {
  SUCCESS: 0,
  SIGN_FAILED: -1,
  WRONG_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  ORDER_NOT_FOUND: -5,
  TX_NOT_FOUND: -6,
  BAD_REQUEST: -8,
  CANCELLED: -9,
} as const

const ACTION_PREPARE = '0'
const ACTION_COMPLETE = '1'

export interface ClickRequest {
  click_trans_id: string
  service_id: string
  merchant_trans_id: string
  merchant_prepare_id?: string
  amount: string
  action: string
  error: string
  sign_time: string
  sign_string: string
}

export interface ClickResponse {
  click_trans_id: string
  merchant_trans_id: string
  merchant_prepare_id?: string
  merchant_confirm_id?: string
  error: number
  error_note: string
}

/**
 * Click SHOP API (T-126): `prepare` hisob-fakturani shu to'lovga bog'laydi,
 * `complete` tasdiqlaydi (tarif uzayadi) yoki Click xatosida bekor qiladi.
 * Imzo: `md5(click_trans_id + service_id + SECRET + merchant_trans_id
 * [+ merchant_prepare_id] + amount + action + sign_time)`. Takroriy
 * `complete` — o'sha muvaffaqiyatli javob (tarif ikki marta uzaymaydi).
 */
@Injectable()
export class ClickService {
  private readonly logger = new Logger(ClickService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  prepare(req: ClickRequest): Promise<ClickResponse> {
    return this.handle(req, ACTION_PREPARE, async (tx, invoice) => {
      if (invoice.state === 'paid') return this.fail(req, CLICK.ALREADY_PAID, 'Already paid')
      if (invoice.state === 'cancelled') return this.fail(req, CLICK.CANCELLED, 'Transaction cancelled')
      if (!sameAmount(req.amount, invoice.amount)) return this.fail(req, CLICK.WRONG_AMOUNT, 'Incorrect parameter amount')
      if (invoice.state === 'pending' && invoice.providerTxId !== req.click_trans_id) {
        return this.fail(req, CLICK.CANCELLED, 'Invoice is awaiting another payment')
      }
      if (invoice.state === 'created') await this.billing.bind(tx, invoice, 'click', req.click_trans_id, BigInt(Date.now()))
      return { ...this.ok(req), merchant_prepare_id: String(invoice.providerTime) }
    })
  }

  complete(req: ClickRequest): Promise<ClickResponse> {
    return this.handle(req, ACTION_COMPLETE, async (tx, invoice) => {
      if (invoice.providerTxId !== req.click_trans_id || String(invoice.providerTime) !== req.merchant_prepare_id) {
        return this.fail(req, CLICK.TX_NOT_FOUND, 'Transaction does not exist')
      }
      const confirm = { ...this.ok(req), merchant_confirm_id: String(invoice.providerTime) }
      if (invoice.state === 'paid') return confirm
      if (invoice.state === 'cancelled') return this.fail(req, CLICK.CANCELLED, 'Transaction cancelled')
      if (Number(req.error) < 0) {
        // Click tomonida to'lov amalga oshmadi — hisob-faktura bekor
        await this.billing.cancel(tx, invoice, Number(req.error))
        return this.fail(req, CLICK.CANCELLED, 'Transaction cancelled')
      }
      if (!sameAmount(req.amount, invoice.amount)) return this.fail(req, CLICK.WRONG_AMOUNT, 'Incorrect parameter amount')
      await this.billing.applyPayment(tx, invoice)
      return confirm
    })
  }

  private async handle(
    req: ClickRequest,
    action: string,
    fn: (tx: TenantTx, invoice: LockedInvoice) => Promise<ClickResponse>,
  ): Promise<ClickResponse> {
    const secret = this.config.get('CLICK_SECRET_KEY', { infer: true })
    if (!secret || req.service_id !== this.config.get('CLICK_SERVICE_ID', { infer: true })) {
      return this.fail(req, CLICK.BAD_REQUEST, 'Error in request from click')
    }
    if (!this.signatureValid(req, secret, action)) {
      this.logger.warn({ clickTransId: req.click_trans_id }, 'Click: imzo mos emas')
      return this.fail(req, CLICK.SIGN_FAILED, 'SIGN CHECK FAILED!')
    }
    if (req.action !== action) return this.fail(req, CLICK.ACTION_NOT_FOUND, 'Action not found')

    const tenantId = await this.billing.tenantOfInvoice(req.merchant_trans_id)
    if (!tenantId) return this.fail(req, CLICK.ORDER_NOT_FOUND, 'User does not exist')
    enrichContext({ tenantId })
    return this.prisma.inTenantTransaction(tenantId, async (tx) => {
      const invoice = await this.billing.lock(tx, tenantId, req.merchant_trans_id)
      if (!invoice) return this.fail(req, CLICK.ORDER_NOT_FOUND, 'User does not exist')
      return fn(tx, invoice)
    })
  }

  private signatureValid(req: ClickRequest, secret: string, action: string): boolean {
    const prepareId = action === ACTION_COMPLETE ? (req.merchant_prepare_id ?? '') : ''
    const expected = createHash('md5')
      .update(`${req.click_trans_id}${req.service_id}${secret}${req.merchant_trans_id}${prepareId}${req.amount}${req.action}${req.sign_time}`)
      .digest('hex')
    const given = Buffer.from(String(req.sign_string ?? '').toLowerCase())
    return given.length === expected.length && timingSafeEqual(given, Buffer.from(expected))
  }

  private ok(req: ClickRequest): ClickResponse {
    return { click_trans_id: req.click_trans_id, merchant_trans_id: req.merchant_trans_id, error: CLICK.SUCCESS, error_note: 'Success' }
  }

  private fail(req: ClickRequest, error: number, note: string): ClickResponse {
    return { click_trans_id: req.click_trans_id, merchant_trans_id: req.merchant_trans_id, error, error_note: note }
  }
}

/** Click summani so'mda, kasr bilan yuboradi ("99000.00") */
function sameAmount(given: string, amount: bigint): boolean {
  const value = Number(given)
  return Number.isFinite(value) && Math.round(value * 100) === Number(amount) * 100
}
