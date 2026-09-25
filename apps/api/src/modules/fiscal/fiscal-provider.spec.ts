import { ConfigService } from '@nestjs/config'
import type { Env } from '@/config/env.schema'
import { retryDelaySec } from './fiscal-dispatcher'
import { createFiscalProvider, FiscalError, HttpFiscalProvider, type FiscalPayload } from './fiscal.provider'

/** OFD provayderi (T-129): so'rov shakli, xato turlari, qayta urinish oralig'i — HTTP soxta */
const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }))

const RECEIPT: FiscalPayload = {
  externalId: '0199a000-0000-7000-8000-000000000001',
  type: 'sale',
  number: 'CHEK-1001',
  issuedAt: '2026-09-24T09:00:00.000Z',
  items: [{ name: 'Sement M400', unit: 'qop', qty: 2, price: 60_000, discount: 0, total: 120_000 }],
  subtotal: 120_000,
  discount: 0,
  taxRate: 0,
  tax: 0,
  deliveryFee: 0,
  total: 120_000,
  payments: { cash: 150_000, card: 0, transfer: 0, credit: 0, change: 30_000 },
  originalFiscalId: null,
}

describe('OFD provayderi (fiscal-provider)', () => {
  it('Bearer token, takror kaliti — navbat qatori id, JSON tana; javobdagi fiskal raqam va QR', async () => {
    const http = reply(200, { fiscalId: 'FP-42', qrPayload: 'https://ofd.uz/check?FP-42' })
    const result = await new HttpFiscalProvider('https://ofd.test/receipts', 'tok', http).register(RECEIPT)
    expect(result).toEqual({ fiscalId: 'FP-42', qrPayload: 'https://ofd.uz/check?FP-42' })
    const [url, init] = http.mock.calls[0]!
    expect(url).toBe('https://ofd.test/receipts')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer tok', 'Idempotency-Key': RECEIPT.externalId })
    expect(JSON.parse(String(init?.body))).toEqual(RECEIPT)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('5xx, 408, 429 va javobsiz tana — qayta urinish mumkin; boshqa 4xx — OFD rad etdi', async () => {
    for (const status of [500, 503, 408, 429]) {
      await expect(new HttpFiscalProvider('u', 't', reply(status, {})).register(RECEIPT)).rejects.toMatchObject({ retryable: true })
    }
    await expect(new HttpFiscalProvider('u', 't', reply(200, { ok: true })).register(RECEIPT)).rejects.toMatchObject({ retryable: true })
    const rejected = await new HttpFiscalProvider('u', 't', reply(422, { error: 'MXIK kodi noto‘g‘ri' })).register(RECEIPT).catch((e: unknown) => e)
    expect(rejected).toBeInstanceOf(FiscalError)
    expect(rejected).toMatchObject({ retryable: false, message: expect.stringContaining('422') })
  })

  it('qayta urinish oralig‘i: 1, 2, 4 … daqiqa, soatdan oshmaydi', () => {
    expect([1, 2, 3, 4, 7, 20].map(retryDelaySec)).toEqual([60, 120, 240, 480, 3_600, 3_600])
  })

  it('sozlama: `OFD_ENABLED=false` — provayder yo‘q', () => {
    const config = (env: Partial<Env>) => new ConfigService<Env, true>(env)
    expect(createFiscalProvider(config({ OFD_ENABLED: false }))).toBeNull()
    expect(createFiscalProvider(config({ OFD_ENABLED: true, OFD_ENDPOINT: 'https://ofd.test', OFD_TOKEN: 't' }))).toBeInstanceOf(HttpFiscalProvider)
  })
})
