import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { businessDate } from '@/common/time'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { purchaseApi, seedSupplier } from './helpers/purchases'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/** Kirim buyurtmalari (T-068): CRUD, holat, `BUY-NNNN`, bekor qilish qoidasi */
describe('Kirim buyurtmalari (/purchase-orders)', () => {
  let app: INestApplication
  let a: Tenant
  let auth: string
  let p: string
  let supplier: string
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
    supplier = await seedSupplier(a.tenantId, { paymentTermDays: 30 })
    po = purchaseApi(app, auth)
  })

  it('yaratish: raqam, summa, qator snapshot, to‘lov muddati ta’minotchi shartidan', async () => {
    const res = await po.create({ supplierId: supplier, date: '2026-09-01', items: [{ productId: p, qty: 10, cost: 40_000 }] }).expect(201)
    expect(res.body).toMatchObject({
      number: 'BUY-1001', status: 'ordered', total: 400_000, paid: 0, receivedValue: 0, outstanding: 0,
      dueDate: '2026-10-01', supplier: { id: supplier, name: 'Bekabad Sement' },
    })
    expect(res.body.items[0]).toMatchObject({ productId: p, name: 'Sement M400', qty: 10, receivedQty: 0, cost: 40_000, unit: 'qop' })
    expect((await po.create({ supplierId: supplier, items: [{ productId: p, qty: 1, cost: 1 }] }).expect(201)).body.number).toBe('BUY-1002')
  })

  it('tahrir faqat `ordered` holatida; qatorlar almashtiriladi', async () => {
    const order = (await po.create({ supplierId: supplier, items: [{ productId: p, qty: 10, cost: 40_000 }] }).expect(201)).body
    const edited = await request(app.getHttpServer())
      .patch(`/api/v1/purchase-orders/${order.id}`)
      .set('Authorization', auth)
      .send({ items: [{ productId: p, qty: 5, cost: 42_000 }], note: 'Narx kelishildi' })
      .expect(200)
    expect(edited.body).toMatchObject({ total: 210_000, note: 'Narx kelishildi' })
    expect(edited.body.items).toHaveLength(1)

    await po.receive(order.id, { items: [{ poItemId: edited.body.items[0].id, qty: 1 }] }).expect(200)
    const late = await request(app.getHttpServer()).patch(`/api/v1/purchase-orders/${order.id}`).set('Authorization', auth).send({ note: 'x' }).expect(409)
    expect(late.body.code).toBe('PO_ALREADY_RECEIVED')
  })

  it('bekor qilish faqat `ordered` da; qisman kelgan bekor qilinmaydi (I19)', async () => {
    const a1 = (await po.create({ supplierId: supplier, items: [{ productId: p, qty: 10, cost: 1_000 }] }).expect(201)).body
    const cancelled = await request(app.getHttpServer()).post(`/api/v1/purchase-orders/${a1.id}/cancel`).set('Authorization', auth).expect(200)
    expect(cancelled.body.status).toBe('cancelled')
    expect((await request(app.getHttpServer()).post(`/api/v1/purchase-orders/${a1.id}/cancel`).set('Authorization', auth).expect(409)).body.code).toBe('PO_CANCELLED')

    const a2 = (await po.create({ supplierId: supplier, items: [{ productId: p, qty: 10, cost: 1_000 }] }).expect(201)).body
    await po.receive(a2.id, { items: [{ poItemId: a2.items[0].id, qty: 4 }] }).expect(200)
    expect((await request(app.getHttpServer()).post(`/api/v1/purchase-orders/${a2.id}/cancel`).set('Authorization', auth).expect(409)).body.code).toBe('PO_ALREADY_RECEIVED')
  })

  it('o‘chirish: faqat tovar kelmagan buyurtma; ro‘yxat filtrlari', async () => {
    const a1 = (await po.create({ supplierId: supplier, items: [{ productId: p, qty: 1, cost: 1 }] }).expect(201)).body
    const a2 = (await po.create({ supplierId: supplier, items: [{ productId: p, qty: 1, cost: 1 }] }).expect(201)).body
    await po.receive(a2.id).expect(200)
    await request(app.getHttpServer()).delete(`/api/v1/purchase-orders/${a2.id}`).set('Authorization', auth).expect(409)
    await request(app.getHttpServer()).delete(`/api/v1/purchase-orders/${a1.id}`).set('Authorization', auth).expect(204)
    await po.get(a1.id).expect(404)

    const list = await request(app.getHttpServer()).get('/api/v1/purchase-orders?status=received').set('Authorization', auth).expect(200)
    expect(list.body).toMatchObject({ total: 1, items: [{ id: a2.id }] })
    const bySupplier = await request(app.getHttpServer()).get('/api/v1/purchase-orders?q=bekabad').set('Authorization', auth).expect(200)
    expect(bySupplier.body.total).toBe(1)

    // Undo: o'chirilgan buyurtma avvalgi holatida qaytadi; ikkinchi marta — 404
    const restored = await request(app.getHttpServer()).post(`/api/v1/purchase-orders/${a1.id}/restore`).set('Authorization', auth).expect(200)
    expect(restored.body).toMatchObject({ id: a1.id, status: 'ordered' })
    await request(app.getHttpServer()).post(`/api/v1/purchase-orders/${a1.id}/restore`).set('Authorization', auth).expect(404)
    expect(await testDb.auditEntry.count({ where: { action: 'po.restore' } })).toBe(1)
  })

  it('sana filtri va xulosa: qarz, kutilayotgan, oy va qabul qilingan summa', async () => {
    const month = businessDate().slice(0, 7)
    const old = (await po.create({ supplierId: supplier, date: '2026-01-15', items: [{ productId: p, qty: 10, cost: 1_000 }] }).expect(201)).body
    await po.receive(old.id).expect(200)
    const fresh = (await po.create({ supplierId: supplier, date: `${month}-01`, items: [{ productId: p, qty: 5, cost: 2_000 }] }).expect(201)).body
    const cancelled = (await po.create({ supplierId: supplier, date: `${month}-01`, items: [{ productId: p, qty: 1, cost: 7_000 }] }).expect(201)).body
    await request(app.getHttpServer()).post(`/api/v1/purchase-orders/${cancelled.id}/cancel`).set('Authorization', auth).expect(200)

    const list = (query: string) => request(app.getHttpServer()).get(`/api/v1/purchase-orders?${query}`).set('Authorization', auth).expect(200)
    expect((await list('dateTo=2026-01-31')).body.items.map((o: { id: string }) => o.id)).toEqual([old.id])
    expect((await list(`dateFrom=${month}-01&status=ordered`)).body.items.map((o: { id: string }) => o.id)).toEqual([fresh.id])

    const summary = await request(app.getHttpServer()).get('/api/v1/purchase-orders/summary').set('Authorization', auth).expect(200)
    expect(summary.body).toEqual({ outstanding: 10_000, openOrders: 1, monthTotal: 10_000, receivedTotal: 10_000 })
    // Sotuvchi — faqat soni (summalardan tannarx tiklanadi)
    const seller = await request(app.getHttpServer()).get('/api/v1/purchase-orders/summary').set('Authorization', await bearer(app, a, 'sotuvchi')).expect(200)
    expect(seller.body).toEqual({ openOrders: 1 })
  })

  it('begona havolalar — 422; omborchi buyurtma beradi, sotuvchi — yo‘q', async () => {
    const b = await seedTenant('B do‘kon')
    const bSupplier = await seedSupplier(b.tenantId)
    expect((await po.create({ supplierId: bSupplier, items: [{ productId: p, qty: 1, cost: 1 }] }).expect(422)).body.errors[0].field).toBe('supplierId')
    const bProduct = await seedProduct(b.tenantId, b.warehouseId)
    expect((await po.create({ supplierId: supplier, items: [{ productId: bProduct, qty: 1, cost: 1 }] }).expect(422)).body.errors[0].field).toBe('items[0].productId')

    await po.create({ supplierId: supplier, items: [{ productId: p, qty: 1, cost: 1 }] }, await bearer(app, a, 'omborchi')).expect(201)
    await po.create({ supplierId: supplier, items: [{ productId: p, qty: 1, cost: 1 }] }, await bearer(app, a, 'sotuvchi')).expect(403)
  })
})
