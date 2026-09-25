import type { ConfigService } from '@nestjs/config'
import type { Env } from '@/config/env.schema'

/** OFD ga yuboriladigan chek: summalar — so'mda, miqdor — chekdagi birlikda */
export interface FiscalPayload {
  /** Navbat qatori id'si: qayta yuborishda OFD takrorni aniqlaydi (`Idempotency-Key`) */
  externalId: string
  type: 'sale' | 'return'
  number: string
  issuedAt: string
  items: { name: string; unit: string; qty: number; price: number; discount: number; total: number }[]
  subtotal: number
  discount: number
  taxRate: number
  tax: number
  deliveryFee: number
  total: number
  /** Naqd — BERILGANI (qaytim alohida); nasiya — to'lanmagan qism */
  payments: { cash: number; card: number; transfer: number; credit: number; change: number }
  /** Qaytarishda — asl chekning fiskal raqami (bo'lsa) */
  originalFiscalId: string | null
}

export interface FiscalResult {
  fiscalId: string
  qrPayload: string
}

/**
 * Onlayn kassa / OFD provayderi (08 §8.9). Chaqiruv navbat ishchisidan,
 * tranzaksiyadan TASHQARIDA — OFD sekin yoki o'chiq bo'lsa sotuv kutmaydi.
 */
export interface FiscalProvider {
  register(receipt: FiscalPayload): Promise<FiscalResult>
}

/** DI tokeni — `OFD_ENABLED=false` da `null`; testda soxta provayder */
export const FISCAL_PROVIDER = Symbol('FISCAL_PROVIDER')

/** `retryable: false` — OFD chekni rad etdi (qayta yuborish befoyda): qator `failed` */
export class FiscalError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message)
    this.name = 'FiscalError'
  }
}

/** Javob kelmasa shundan keyin uziladi (ish qayta uriniladi) */
const REQUEST_TIMEOUT_MS = 10_000
/** Qayta urinish foydali 4xx: vaqt tugadi, so'rovlar ko'p */
const RETRYABLE_4XX = new Set([408, 429])

/**
 * Umumiy HTTP shartnoma: `POST OFD_ENDPOINT` (Bearer), javob
 * `{ fiscalId, qrPayload }`. Aniq provayder (soliq.uz virtual kassa,
 * OFD operatori) tanlanganda — shu sinf uning formatiga moslanadi.
 */
export class HttpFiscalProvider implements FiscalProvider {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async register(receipt: FiscalPayload): Promise<FiscalResult> {
    const res = await this.http(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': receipt.externalId,
      },
      body: JSON.stringify(receipt),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new FiscalError(`OFD: HTTP ${res.status} ${body.slice(0, 200)}`, res.status >= 500 || RETRYABLE_4XX.has(res.status))
    }
    const json = (await res.json()) as { fiscalId?: unknown; qrPayload?: unknown }
    if (typeof json.fiscalId !== 'string' || json.fiscalId === '') throw new FiscalError('OFD javobida `fiscalId` yo‘q')
    return { fiscalId: json.fiscalId, qrPayload: typeof json.qrPayload === 'string' ? json.qrPayload : '' }
  }
}

/** `OFD_ENABLED=false` — `null`: cheklar navbatga tushmaydi, ilova OFD'siz to'liq ishlaydi */
export function createFiscalProvider(config: ConfigService<Env, true>): FiscalProvider | null {
  if (!config.get('OFD_ENABLED', { infer: true })) return null
  return new HttpFiscalProvider(config.get('OFD_ENDPOINT', { infer: true })!, config.get('OFD_TOKEN', { infer: true })!)
}
