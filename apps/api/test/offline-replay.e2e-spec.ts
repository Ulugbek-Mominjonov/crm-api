import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { addDays, businessDate } from '@/common/time'
import { ReportViewJobs } from '@/modules/reports/report-views.jobs'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

/** Brauzer navbatidagi amal: kalit navbatga qo'yilganda yaratiladi va o'zgarmaydi */
interface Queued {
  path: string
  key: string
  body: Record<string, unknown>
}

/**
 * Offline navbat shartnomasi (T-097, 01 §1.10): brauzer IndexedDB'dagi
 * amallarni ulanish tiklanganda ketma-ket, `Idempotency-Key` bilan
 * yuboradi. Javob yo'qolib qayta yuborilsa — chek ikkilanmaydi; konflikt
 * aniq kod bilan qaytadi (mijoz chekni «tekshirish kerak» deb belgilaydi).
 */
describe('Offline navbatni qayta yuborish', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let product: string

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    a = await seedTenant('A do‘kon')
    auth = await bearer(app, a)
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    product = await seedProduct(a.tenantId, a.warehouseId, { qty: '10', price: 100_000n })
    await openShift(a.tenantId, 0n)
  })

  const send = (op: Queued) =>
    request(app.getHttpServer()).post(`/api/v1/${op.path}`).set('Authorization', auth).set('Idempotency-Key', op.key).send(op.body)
  const cashSale = (qty: number, extra: Record<string, unknown> = {}): Queued => ({
    path: 'sales',
    key: randomUUID(),
    body: { items: [{ productId: product, qty }], paid: { cash: qty * 100_000, card: 0, transfer: 0 }, ...extra },
  })
  const stockLeft = async () =>
    Number((await testDb.productStock.findFirstOrThrow({ where: { productId: product, warehouseId: a.warehouseId } })).qty)
  const cash = async () => Number((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).cashBalance)

  it('navbat qayta yuborilsa (javob yo‘qolgan) — o‘sha javoblar, chek ikkilanmaydi', async () => {
    const outbox = [cashSale(1), cashSale(2), { path: 'cash/movements', key: randomUUID(), body: { direction: 'out', amount: 50_000, reason: 'Yo‘l kira' } }]
    const first: request.Response[] = []
    for (const op of outbox) first.push(await send(op))
    expect(first.map((r) => r.status)).toEqual([201, 201, 201])

    // Ulanish uzilib, mijoz javobni olmadi — butun navbat qayta
    for (const [i, op] of outbox.entries()) {
      const again = await send(op)
      expect(again.status).toBe(first[i]!.status)
      expect(again.headers['idempotent-replay']).toBe('true')
      expect(again.body).toEqual(first[i]!.body)
    }
    expect(await testDb.sale.count()).toBe(2)
    expect(await stockLeft()).toBe(7)
    expect(await cash()).toBe(300_000 - 50_000)
  })

  it('ikki tab bir vaqtda qayta yuborsa — bitta chek', async () => {
    const op = cashSale(1)
    const [x, y] = await Promise.all([send(op), send(op)])
    expect([x.status, y.status]).toEqual([201, 201])
    expect(x.body.id).toBe(y.body.id)
    expect(await testDb.sale.count()).toBe(1)
  })

  it('navbatdagi amal o‘zgartirilib, o‘sha kalit bilan yuborilsa — 409 IDEMPOTENCY_MISMATCH', async () => {
    const op = cashSale(1)
    await send(op).expect(201)
    const res = await send({ ...op, body: { ...op.body, items: [{ productId: product, qty: 2 }] } }).expect(409)
    expect(res.body.code).toBe('IDEMPOTENCY_MISMATCH')
    expect(await testDb.sale.count()).toBe(1)
  })

  it('konflikt: qoldiq offline paytida tugagan — 422 aniq sabab bilan; tuzatilgach o‘sha kalit ishlaydi', async () => {
    const offline = cashSale(4)
    await send(cashSale(8)).expect(201) // boshqa kassa tovarni sotib yubordi

    const conflict = await send(offline).expect(422)
    expect(conflict.body).toMatchObject({
      code: 'STOCK_INSUFFICIENT',
      errors: [{ field: 'items[0].qty', code: 'STOCK_INSUFFICIENT', meta: { productId: product, available: 2, requested: 4 } }],
    })
    // Yiqilgan urinish kalitni band qilmaydi — foydalanuvchi tuzatib, qayta yuboradi
    await send({ ...offline, body: { ...offline.body, items: [{ productId: product, qty: 2 }], paid: { cash: 200_000, card: 0, transfer: 0 } } }).expect(201)
    expect(await stockLeft()).toBe(0)
  })

  it('konflikt: narx offline paytida o‘zgargan — 422 TOTAL_MISMATCH (mijoz va server summasi)', async () => {
    await testDb.product.update({ where: { id: product }, data: { price: 110_000n } })
    const res = await send(cashSale(1, { total: 100_000 })).expect(422)
    expect(res.body).toMatchObject({ code: 'TOTAL_MISMATCH', errors: [{ meta: { client: 100_000, server: 110_000 } }] })
  })

  describe('orqa sanali chek hisobotda darhol ko‘rinadi (ko‘rinish yangilanishini kutmaydi)', () => {
    const today = businessDate()
    const yesterday = addDays(today, -1)
    const revenueOn = async (date: string) =>
      (await request(app.getHttpServer()).get(`/api/v1/reports/pnl?from=${date}&to=${date}`).set('Authorization', auth).expect(200)).body
        .current.revenue as number
    const refresh = () => app.get(ReportViewJobs).refresh()

    it('kechagi sanali offline chek va kechagi chekni bekor qilish — kechagi hisobot darhol to‘g‘ri', async () => {
      const early = await send(cashSale(1, { date: yesterday })).expect(201)
      await refresh() // kecha endi materiallashgan ko'rinishdan
      expect(await revenueOn(yesterday)).toBe(100_000)

      // Offline navbatdan kechikib kelgan kechagi chek
      await send(cashSale(2, { date: yesterday })).expect(201)
      expect(await revenueOn(yesterday)).toBe(300_000)
      // Kechagi chek bugun bekor qilindi
      await request(app.getHttpServer())
        .post(`/api/v1/sales/${early.body.id}/cancel`).set('Authorization', auth).set('Idempotency-Key', randomUUID()).send({})
        .expect(200)
      expect(await revenueOn(yesterday)).toBe(200_000)
      expect(await revenueOn(today)).toBe(0)

      const state = await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })
      expect(state.reportDirtyFrom?.toISOString().slice(0, 10)).toBe(yesterday)
    })

    it('tungi yangilash eski belgini tozalaydi (yangisini — yo‘q), raqam o‘zgarmaydi', async () => {
      await refresh()
      await send(cashSale(1, { date: yesterday })).expect(201)
      await refresh()
      // Belgi yangi (so'nggi soat) — REFRESH ko'rmagan bo'lishi mumkin, qoladi
      expect((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).reportDirtyFrom).not.toBeNull()

      await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { reportDirtyAt: new Date(Date.now() - 2 * 3_600_000) } })
      await refresh()
      expect((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).reportDirtyFrom).toBeNull()
      expect(await revenueOn(yesterday)).toBe(100_000)
    })

    it('kechagi chek qarzini to‘lash (hisobotga ta’sirsiz) va bugungi chek — belgi qo‘ymaydi', async () => {
      const customerId = await seedClient(a.tenantId)
      const credit = await send({
        path: 'sales',
        key: randomUUID(),
        body: { customerId, items: [{ productId: product, qty: 1 }], paid: { cash: 0, card: 0, transfer: 0 }, date: yesterday },
      }).expect(201)
      // Tungi yangilash taqlidi: belgi tozalangan
      await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { reportDirtyFrom: null, reportDirtyAt: null } })

      await send({ path: 'debts/payments', key: randomUUID(), body: { saleId: credit.body.id, amount: 100_000, method: 'cash' } }).expect(201)
      await send(cashSale(1)).expect(201)
      expect((await testDb.sale.findUniqueOrThrow({ where: { id: credit.body.id } })).status).toBe('completed')
      expect((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).reportDirtyFrom).toBeNull()
    })
  })
})
