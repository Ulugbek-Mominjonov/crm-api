import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import type { FiscalReceipt } from '@prisma/client'
import request from 'supertest'
import { TenantLifecycleJobs } from '@/modules/account/tenant-lifecycle.jobs'
import { FiscalDispatcher } from '@/modules/fiscal/fiscal-dispatcher'
import { FISCAL_PROVIDER, FiscalError, type FiscalPayload, type FiscalProvider, type FiscalResult } from '@/modules/fiscal/fiscal.provider'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { connect, listen, record } from './helpers/realtime'

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** Soxta OFD: ishlaydi, o'chiq (tarmoq xatosi), osilib qolgan (javob kutilmoqda) yoki chekni rad etadi */
class FakeOfd implements FiscalProvider {
  mode: 'up' | 'down' | 'hang' | 'reject' = 'up'
  readonly calls: FiscalPayload[] = []
  private release?: () => void

  async register(receipt: FiscalPayload): Promise<FiscalResult> {
    this.calls.push(receipt)
    if (this.mode === 'down') throw new TypeError('fetch failed: connect ECONNREFUSED 10.0.0.1:443')
    if (this.mode === 'reject') throw new FiscalError('OFD: HTTP 422 MXIK kodi noto‘g‘ri', false)
    if (this.mode === 'hang') await new Promise<void>((resolve) => (this.release = resolve))
    const fiscalId = `FP-${this.calls.length}`
    return { fiscalId, qrPayload: `https://ofd.test/check/${fiscalId}` }
  }

  /** Osilgan so'rovga javob keladi */
  answer(): void {
    this.mode = 'up'
    this.release?.()
  }
}

/** Fon ishi (COMMIT'dan keyin) asinxron — shart bajarilguncha kutadi */
async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 3_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await read()
    if (done(value)) return value
    if (Date.now() > deadline) throw new Error(`Kutilgan holat bo‘lmadi: ${JSON.stringify(value)}`)
    await new Promise((r) => setTimeout(r, 25))
  }
}

async function setupShop(app: INestApplication) {
  const shop = await seedTenant('A do‘kon')
  await testDb.settings.update({ where: { tenantId: shop.tenantId }, data: { taxEnabled: false } })
  const productId = await seedProduct(shop.tenantId, shop.warehouseId, { qty: '50' })
  await openShift(shop.tenantId)
  return { ...shop, productId, auth: await bearer(app, shop) }
}

type Shop = Awaited<ReturnType<typeof setupShop>>

const sell = (app: INestApplication, shop: Shop, qty = 2) =>
  request(app.getHttpServer()).post('/api/v1/sales').set('Authorization', shop.auth).set('Idempotency-Key', randomUUID())
    .send({ items: [{ productId: shop.productId, qty }], paid: { cash: 150_000, card: 0, transfer: 0 } })

const receipt = async (app: INestApplication, shop: Shop, saleId: string) =>
  (await request(app.getHttpServer()).get(`/api/v1/sales/${saleId}/receipt`).set('Authorization', shop.auth).expect(200)).body

const fiscalOf = (saleId: string) => testDb.fiscalReceipt.findUnique({ where: { saleId } })

/**
 * Fiskal chek (T-129, 08 §8.9): OFD o'chiq bo'lsa ilova to'liq ishlaydi;
 * yoqilganda chek fiskal ma'lumot bilan boyitiladi; OFD ishlamasa sotuv
 * TO'XTAMAYDI — chek navbatda qoladi va keyin fiskallanadi.
 */
describe('OFD o‘chiq (OFD_ENABLED=false)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
  })

  it('sotuv odatdagidek; chekda fiskal ma’lumot yo‘q, navbat bo‘sh', async () => {
    resetThrottle(app)
    await truncateAll()
    const shop = await setupShop(app)
    const sale = (await sell(app, shop).expect(201)).body
    expect((await receipt(app, shop, sale.id)).fiscal).toBeNull()
    expect(await testDb.fiscalReceipt.count()).toBe(0)
    expect(await app.get(FiscalDispatcher).dispatch()).toEqual({ confirmed: 0, retried: 0, failed: 0 })
  })
})

describe('OFD yoqilgan (fiskal navbat)', () => {
  let app: INestApplication
  let ofd: FakeOfd
  let shop: Shop
  let dispatcher: FiscalDispatcher

  beforeAll(async () => {
    ofd = new FakeOfd()
    app = await createTestApp((builder) => builder.overrideProvider(FISCAL_PROVIDER).useValue(ofd))
    dispatcher = app.get(FiscalDispatcher)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    ofd.mode = 'up'
    ofd.calls.length = 0
    shop = await setupShop(app)
  })

  it('OFD ishlaydi: chek darhol fiskallanadi — raqam, QR, `sale.fiscalized`; qaytarish asl chekka bog‘lanadi', async () => {
    const socket = await connect(await listen(app), { token: shop.auth.replace('Bearer ', '') })
    const events = record(socket)
    try {
      const sale = (await sell(app, shop).expect(201)).body
      const fiscal = await waitFor(() => fiscalOf(sale.id), (f) => f?.status === 'confirmed')
      expect(fiscal).toMatchObject({ fiscalId: 'FP-1', qrPayload: 'https://ofd.test/check/FP-1', attempts: 1, lastError: null })
      expect((await receipt(app, shop, sale.id)).fiscal).toEqual({
        status: 'confirmed', fiscalId: 'FP-1', qrPayload: 'https://ofd.test/check/FP-1', fiscalizedAt: expect.any(String),
      })
      // OFD ga — chekdagi ma'lumot: naqd BERILGANI va qaytim, takror kaliti — navbat qatori
      expect(ofd.calls[0]).toMatchObject({
        externalId: fiscal!.id, type: 'sale', number: sale.number, total: 120_000,
        payments: { cash: 150_000, card: 0, transfer: 0, credit: 0, change: 30_000 },
        items: [{ qty: 2, price: 60_000, discount: 0, total: 120_000 }], originalFiscalId: null,
      })
      await waitFor(async () => events, (e) => e.some((x) => x.type === 'sale.fiscalized'))
      expect(events.find((x) => x.type === 'sale.fiscalized')!.payload).toEqual({ saleId: sale.id })

      // Tasdiqlangan chek qayta yuborilmaydi
      expect(await dispatcher.dispatch(new Date(Date.now() + HOUR_MS))).toEqual({ confirmed: 0, retried: 0, failed: 0 })

      const saleItemId = (await testDb.saleItem.findFirstOrThrow({ where: { saleId: sale.id } })).id
      const returned = (await request(app.getHttpServer()).post(`/api/v1/sales/${sale.id}/return`).set('Authorization', shop.auth)
        .set('Idempotency-Key', randomUUID()).send({ items: [{ saleItemId, qty: 1 }], reason: 'Ortiqcha' }).expect(201)).body
      await waitFor(() => fiscalOf(returned.id), (f) => f?.status === 'confirmed')
      expect(ofd.calls[1]).toMatchObject({ type: 'return', number: returned.number, originalFiscalId: 'FP-1' })
    } finally {
      socket.close()
    }
  })

  it('OFD ishlamaydi: sotuv to‘xtamaydi — chek navbatda, kechikish bilan qayta uriniladi, tiklangach fiskallanadi', async () => {
    ofd.mode = 'down'
    const sales: { id: string }[] = []
    for (let i = 0; i < 3; i += 1) sales.push((await sell(app, shop, 1).expect(201)).body)
    const first = await waitFor(() => fiscalOf(sales[0]!.id), (f) => f?.attempts === 1 && f.status === 'pending')
    expect(first!.lastError).toContain('ECONNREFUSED')
    expect(first!.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(50_000)
    expect((await receipt(app, shop, sales[0]!.id)).fiscal).toMatchObject({ status: 'pending', fiscalId: null })
    await waitFor(() => testDb.fiscalReceipt.findMany(), (rows) => rows.length === 3 && rows.every((r) => r.attempts === 1))

    // Kechikish tugamagan — urinilmaydi; tugagach — yana (keyingi oraliq ikki barobar)
    expect(await dispatcher.dispatch()).toEqual({ confirmed: 0, retried: 0, failed: 0 })
    const calls = ofd.calls.length
    expect(await dispatcher.dispatch(new Date(Date.now() + 2 * MINUTE_MS))).toEqual({ confirmed: 0, retried: 3, failed: 0 })
    expect(ofd.calls.length).toBe(calls + 3)
    const second = (await fiscalOf(sales[0]!.id))!
    expect(second.attempts).toBe(2)
    expect(second.nextAttemptAt.getTime() - Date.now()).toBeGreaterThan(3 * MINUTE_MS)

    ofd.mode = 'up'
    expect(await dispatcher.dispatch(new Date(Date.now() + 10 * MINUTE_MS))).toEqual({ confirmed: 3, retried: 0, failed: 0 })
    expect((await receipt(app, shop, sales[0]!.id)).fiscal).toMatchObject({ status: 'confirmed', fiscalId: expect.stringMatching(/^FP-/) })
  })

  it('OFD javob bermay qolsa ham sotuv kutmaydi (fiskallash — COMMIT’dan keyin)', async () => {
    ofd.mode = 'hang'
    const sale = (await sell(app, shop).expect(201)).body
    const inFlight = await waitFor(() => fiscalOf(sale.id), (f) => f?.status === 'sent')
    expect(inFlight!.attempts).toBe(1)
    // Keyingi sotuv ham to'siqsiz
    await sell(app, shop, 1).expect(201)

    ofd.answer()
    await waitFor(() => fiscalOf(sale.id), (f) => f?.status === 'confirmed')
  })

  it('24 soatdan beri o‘tmagan chek — administratorga ogohlantirish bir marta; urinish davom etadi', async () => {
    ofd.mode = 'down'
    const sale = (await sell(app, shop).expect(201)).body
    await waitFor(() => fiscalOf(sale.id), (f) => f?.attempts === 1)
    await testDb.fiscalReceipt.update({ where: { saleId: sale.id }, data: { createdAt: new Date(Date.now() - 25 * HOUR_MS) } })
    const alerts = () => testDb.auditEntry.findMany({ where: { tenantId: shop.tenantId, action: 'fiscal.overdue' } })

    await dispatcher.dispatch(new Date(Date.now() + 2 * HOUR_MS))
    expect(await alerts()).toEqual([
      expect.objectContaining({ userId: null, entityType: 'sale', entityId: sale.id, detail: expect.stringContaining('ECONNREFUSED') }),
    ])
    const alerted: FiscalReceipt = (await fiscalOf(sale.id))!
    expect(alerted).toMatchObject({ status: 'pending', attempts: 2, alertedAt: expect.any(Date) })

    await dispatcher.dispatch(new Date(Date.now() + 4 * HOUR_MS))
    expect(await alerts()).toHaveLength(1)
    expect((await fiscalOf(sale.id))!.attempts).toBe(3)
  })

  it('OFD chekni rad etsa — `failed`, ogohlantirish; qayta yuborilmaydi', async () => {
    ofd.mode = 'reject'
    const sale = (await sell(app, shop).expect(201)).body
    const failed = await waitFor(() => fiscalOf(sale.id), (f) => f?.status === 'failed')
    expect(failed).toMatchObject({ lastError: expect.stringContaining('422'), alertedAt: expect.any(Date) })
    // Fon ishi sotuv so'rovidan keyin ishlasa ham — "Tizim" nomidan
    expect(await testDb.auditEntry.findMany({ where: { tenantId: shop.tenantId, action: 'fiscal.rejected' } }))
      .toEqual([expect.objectContaining({ entityId: sale.id, userId: null })])
    expect(await dispatcher.dispatch(new Date(Date.now() + 2 * HOUR_MS))).toEqual({ confirmed: 0, retried: 0, failed: 0 })
    expect(ofd.calls).toHaveLength(1)
  })

  it('do‘kon to‘liq o‘chirilsa — fiskal navbat ham o‘chadi', async () => {
    ofd.mode = 'down'
    const sale = (await sell(app, shop).expect(201)).body
    await waitFor(() => fiscalOf(sale.id), (f) => f?.attempts === 1)
    await testDb.tenant.update({ where: { id: shop.tenantId }, data: { status: 'deleting', deletionScheduledAt: new Date(Date.now() - 1_000) } })
    expect(await app.get(TenantLifecycleJobs).purgeDeleted()).toEqual([shop.tenantId])
    expect(await testDb.fiscalReceipt.count()).toBe(0)
  })
})
