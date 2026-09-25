import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/** Yetkazib berish (T-074): narx chekdan (D3), holat faqat oldinga, haydovchi — xodim */
describe('Yetkazib berish (/deliveries)', () => {
  let app: INestApplication
  let a: Tenant
  let auth: string
  let driver: string

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
    driver = (await testDb.employee.create({
      data: { tenantId: a.tenantId, name: 'Jasur haydovchi', position: 'Haydovchi', phone: '+998901110000', hiredAt: new Date() },
    })).id
  })

  const api = () => request(app.getHttpServer())
  const create = (body: Record<string, unknown>) => api().post('/api/v1/deliveries').set('Authorization', auth).send(body)
  const status = (id: string, value: string, token = auth) =>
    api().post(`/api/v1/deliveries/${id}/status`).set('Authorization', token).send({ status: value })
  const base = { address: 'Chilonzor 7', phone: '+998901234567', scheduledDate: '2026-09-24' }

  it('chekli yetkazish: narx va mijoz chekdan (D3); ikkinchi yetkazish — 409', async () => {
    await openShift(a.tenantId)
    const p = await seedProduct(a.tenantId, a.warehouseId)
    const c = await seedClient(a.tenantId, { name: 'Bahrom' })
    const sale = (await api()
      .post('/api/v1/sales')
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send({ customerId: c, items: [{ productId: p, qty: 1 }], delivery: { ...base, fee: 25_000 }, paid: { cash: 92_200, card: 0, transfer: 0 } })
      .expect(201)).body
    const res = await api().get(`/api/v1/deliveries/${sale.delivery.id}`).set('Authorization', auth).expect(200)
    expect(res.body).toMatchObject({ saleId: sale.id, saleNumber: 'CHEK-1001', fee: 25_000, customer: { id: c, name: 'Bahrom' }, status: 'pending' })
    expect((await create({ ...base, saleId: sale.id }).expect(409)).body.code).toBe('ALREADY_EXISTS')
    // Chekli yetkazishga alohida narx berilmaydi
    expect((await create({ ...base, saleId: sale.id, fee: 1 }).expect(400)).body.errors[0].field).toBe('fee')
  })

  it('chekSIZ yetkazish: alohida narx; haydovchi — xodim (begona — 422)', async () => {
    const res = await create({ ...base, fee: 30_000, driverId: driver }).expect(201)
    expect(res.body).toMatchObject({ saleId: null, fee: 30_000, driver: { id: driver, name: 'Jasur haydovchi' } })
    // Tahrirda `null` — haydovchi va joylashuv olib tashlanadi
    const cleared = await api().patch(`/api/v1/deliveries/${res.body.id}`).set('Authorization', auth).send({ driverId: null, lat: null, lng: null }).expect(200)
    expect(cleared.body).toMatchObject({ driver: null, lat: null, lng: null })
    const b = await seedTenant('B do‘kon')
    expect((await create({ ...base, driverId: b.employeeId }).expect(422)).body.errors[0].field).toBe('driverId')
  })

  it('holat faqat oldinga: pending → on_way → delivered; teskari va sakrash — 422', async () => {
    const d = (await create(base).expect(201)).body
    expect((await status(d.id, 'delivered').expect(422)).body).toMatchObject({
      code: 'INVALID_STATUS_TRANSITION', errors: [{ meta: { from: 'pending', to: 'delivered' } }],
    })
    await status(d.id, 'on_way').expect(200)
    await status(d.id, 'pending').expect(422)
    const done = await status(d.id, 'delivered').expect(200)
    expect(done.body.deliveredAt).not.toBeNull()
    await status(d.id, 'cancelled').expect(422)
    // Yetkazilgan — tahrirlanmaydi, o'chirilmaydi
    await api().patch(`/api/v1/deliveries/${d.id}`).set('Authorization', auth).send({ note: 'x' }).expect(422)
    await api().delete(`/api/v1/deliveries/${d.id}`).set('Authorization', auth).expect(422)
  })

  it('ro‘yxat: holat, haydovchi, muddati o‘tgan filtri', async () => {
    await create({ ...base, scheduledDate: '2020-01-01', driverId: driver }).expect(201)
    const d2 = (await create(base).expect(201)).body
    await status(d2.id, 'cancelled').expect(200)
    const overdue = await api().get('/api/v1/deliveries?overdue=true').set('Authorization', auth).expect(200)
    expect(overdue.body.items.map((d: { overdue: boolean }) => d.overdue)).toEqual([true])
    expect((await api().get(`/api/v1/deliveries?driverId=${driver}`).set('Authorization', auth).expect(200)).body.total).toBe(1)
    expect((await api().get('/api/v1/deliveries?status=cancelled').set('Authorization', auth).expect(200)).body.total).toBe(1)
  })

  it('xulosa: holatlar, yetkazilganlar narxi (chekli — chekdan), haydovchi yuki', async () => {
    await openShift(a.tenantId)
    const p = await seedProduct(a.tenantId, a.warehouseId)
    const c = await seedClient(a.tenantId)
    const sale = (await api()
      .post('/api/v1/sales')
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send({ customerId: c, items: [{ productId: p, qty: 1 }], delivery: { ...base, fee: 25_000 }, paid: { cash: 92_200, card: 0, transfer: 0 } })
      .expect(201)).body
    await status(sale.delivery.id, 'on_way').expect(200)
    await status(sale.delivery.id, 'delivered').expect(200)
    const standalone = (await create({ ...base, fee: 30_000 }).expect(201)).body
    await status(standalone.id, 'on_way').expect(200)
    await status(standalone.id, 'delivered').expect(200)
    await create({ ...base, driverId: driver }).expect(201)
    await create({ ...base, driverId: driver }).expect(201)
    const unassigned = (await create(base).expect(201)).body
    await status(unassigned.id, 'on_way').expect(200)

    const summary = await api().get('/api/v1/deliveries/summary').set('Authorization', auth).expect(200)
    expect(summary.body).toEqual({
      pending: 2, onWay: 1, delivered: 2, feeRevenue: 55_000,
      workload: [{ driver: { id: driver, name: 'Jasur haydovchi' }, count: 2 }, { driver: null, count: 1 }],
    })
  })

  it('o‘chirish va undo: tiklangan yetkazish qaytadi; ikkinchi tiklash — 404', async () => {
    const d = (await create(base).expect(201)).body
    await api().delete(`/api/v1/deliveries/${d.id}`).set('Authorization', auth).expect(204)
    await api().get(`/api/v1/deliveries/${d.id}`).set('Authorization', auth).expect(404)
    const restored = await api().post(`/api/v1/deliveries/${d.id}/restore`).set('Authorization', auth).expect(200)
    expect(restored.body).toMatchObject({ id: d.id, status: 'pending' })
    await api().post(`/api/v1/deliveries/${d.id}/restore`).set('Authorization', auth).expect(404)
    expect(await testDb.auditEntry.count({ where: { action: 'delivery.restore' } })).toBe(1)
  })
})
