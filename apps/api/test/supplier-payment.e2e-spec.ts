import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { purchaseApi, seedSupplier } from './helpers/purchases'
import { captureQueries } from './helpers/queries'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/**
 * Ta'minotchiga to'lov (T-070), kreditorlik (T-071, I18), ta'minotchi
 * kartasi (T-072) va audit (T-073).
 */
describe('Ta’minotchiga to‘lov va kreditorlik', () => {
  let app: INestApplication
  let a: Tenant
  let auth: string
  let p: string
  let supplier: string
  let shiftId: string
  let po: ReturnType<typeof purchaseApi>

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
    p = await seedProduct(a.tenantId, a.warehouseId, { qty: '0' })
    supplier = await seedSupplier(a.tenantId)
    shiftId = await openShift(a.tenantId, 1_000_000n)
    po = purchaseApi(app, auth)
  })

  const order = async (qty = 10, cost = 40_000) =>
    (await po.create({ supplierId: supplier, items: [{ productId: p, qty, cost }] }).expect(201)).body
  const cash = async () => Number((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).cashBalance)

  describe('Kreditorlik (T-071, I18)', () => {
    it('buyurtma holatida qarz yo‘q — to‘lab bo‘lmaydi', async () => {
      const o = await order()
      expect(o.outstanding).toBe(0)
      const res = await po.pay(o.id, { amount: 1, method: 'bank' }).expect(422)
      expect(res.body).toMatchObject({ code: 'PAYMENT_EXCEEDS_DEBT', errors: [{ meta: { outstanding: 0 } }] })
    })

    it('qisman qabulda faqat kelgan qism qarz', async () => {
      const o = await order()
      const received = await po.receive(o.id, { items: [{ poItemId: o.items[0].id, qty: 7 }] }).expect(200)
      expect(received.body).toMatchObject({ outstanding: 280_000, receivedValue: 280_000 })
      expect((await po.pay(o.id, { amount: 280_001, method: 'bank' }).expect(422)).body.code).toBe('PAYMENT_EXCEEDS_DEBT')
    })
  })

  describe('To‘lov (T-070)', () => {
    it('I18: naqd to‘lov kassadan chiqadi va smena hisobotida ko‘rinadi', async () => {
      const o = await order(10, 40_000)
      await po.receive(o.id).expect(200)
      const res = await po.pay(o.id, { amount: 400_000, method: 'cash' }).expect(201)
      expect(res.body.payment).toMatchObject({ amount: 400_000, method: 'cash', shiftId })
      expect(res.body.order).toMatchObject({ paid: 400_000, outstanding: 0 })

      expect(await cash()).toBe(600_000)
      expect(Number((await testDb.cashShift.findUniqueOrThrow({ where: { id: shiftId } })).cashOut)).toBe(400_000)
      const report = await request(app.getHttpServer()).get(`/api/v1/cash/shifts/${shiftId}/report`).set('Authorization', auth).expect(200)
      expect(report.body).toMatchObject({ supplierPayments: 400_000, expectedBalance: 600_000 })
    })

    it('bank to‘lovi kassaga tegmaydi; naqd — smenasiz 423; omborchi to‘lay olmaydi', async () => {
      const o = await order(1, 100_000)
      await po.receive(o.id).expect(200)
      await po.pay(o.id, { amount: 30_000, method: 'bank' }).expect(201)
      expect(await cash()).toBe(1_000_000)
      await po.pay(o.id, { amount: 1_000, method: 'cash' }, await bearer(app, a, 'omborchi')).expect(403)
      await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeShiftId: null } })
      expect((await po.pay(o.id, { amount: 1_000, method: 'cash' }).expect(423)).body.code).toBe('SHIFT_REQUIRED')
    })
  })

  describe('Ta’minotchi kartasi (T-072)', () => {
    it('tarix, jami qarz, oxirgi to‘lovlar — bitta so‘rovda', async () => {
      const first = await order(10, 40_000)
      await po.receive(first.id).expect(200)
      await po.pay(first.id, { amount: 100_000, method: 'bank' }).expect(201)
      const second = await order(5, 10_000)
      await po.receive(second.id, { items: [{ poItemId: second.items[0].id, qty: 2 }] }).expect(200)
      await order(1, 1) // hali kelmagan

      const { result, queries } = await captureQueries(() =>
        request(app.getHttpServer()).get(`/api/v1/suppliers/${supplier}`).set('Authorization', auth),
      )
      expect(result.status).toBe(200)
      expect(queries).toHaveLength(1)
      expect(result.body).toMatchObject({
        id: supplier, name: 'Bekabad Sement',
        // 400 000 − 100 000 + 20 000 (5 tadan 2 tasi kelgan)
        debt: 320_000,
        // Kelgan tovar qiymati: 400 000 + 20 000 (kelmagan buyurtma — 0)
        totalPurchased: 420_000,
        openOrders: 2,
      })
      expect(result.body.orders.map((o: { number: string; outstanding: number }) => [o.number, o.outstanding])).toEqual([
        ['BUY-1003', 0], ['BUY-1002', 20_000], ['BUY-1001', 300_000],
      ])
      expect(result.body.payments).toEqual([
        expect.objectContaining({ poId: first.id, amount: 100_000, method: 'bank' }),
      ])
    })
  })

  describe('Audit (T-073)', () => {
    it('buyurtma, qabul va to‘lov jurnalda summa bilan', async () => {
      const o = await order(10, 40_000)
      await po.receive(o.id, { items: [{ poItemId: o.items[0].id, qty: 3 }] }).expect(200)
      await po.receive(o.id).expect(200)
      await po.pay(o.id, { amount: 150_000, method: 'cash' }).expect(201)

      const entries = await testDb.auditEntry.findMany({ where: { entityId: o.id }, orderBy: { createdAt: 'asc' } })
      expect(entries.map((e) => e.action)).toEqual(['po.create', 'po.receivePartial', 'po.receive', 'po.pay'])
      expect(entries.map((e) => e.diff)).toEqual([
        expect.objectContaining({ number: 'BUY-1001', total: 400_000 }),
        expect.objectContaining({ value: 120_000 }),
        expect.objectContaining({ value: 280_000 }),
        expect.objectContaining({ amount: 150_000, method: 'cash', outstanding: 250_000 }),
      ])
    })
  })
})
