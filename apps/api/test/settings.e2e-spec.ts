import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries } from './helpers/queries'

describe('Sozlamalar (/settings)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>

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
    b = await seedTenant('B do‘kon')
  })

  const http = () => request(app.getHttpServer())

  it('har qanday rol o‘qiy oladi — kassaga QQS va chegirma chegarasi kerak', async () => {
    const res = await http()
      .get('/api/v1/settings')
      .set('Authorization', await bearer(app, a, 'sotuvchi'))
      .expect(200)
    expect(res.body).toMatchObject({ taxEnabled: true, taxRate: 12, maxDiscountPct: 100 })
    expect(res.body).not.toHaveProperty('tenantId')
  })

  it('faqat `settings` huquqi bor rol o‘zgartiradi', async () => {
    for (const role of ['sotuvchi', 'omborchi'] as const) {
      const res = await http()
        .patch('/api/v1/settings')
        .set('Authorization', await bearer(app, a, role))
        .send({ taxRate: 15 })
        .expect(403)
      expect(res.body.code).toBe('PERMISSION_DENIED')
    }
    const ok = await http()
      .patch('/api/v1/settings')
      .set('Authorization', await bearer(app, a, 'manager'))
      .send({ taxRate: 15, receiptFooter: '  Rahmat!  ' })
      .expect(200)
    expect(ok.body).toMatchObject({ taxRate: 15, receiptFooter: 'Rahmat!' })
  })

  it('taxRate va maxDiscountPct faqat 0–100', async () => {
    const auth = await bearer(app, a)
    for (const body of [{ taxRate: 101 }, { taxRate: -1 }, { maxDiscountPct: 150 }, { taxRate: 12.5 }]) {
      const res = await http().patch('/api/v1/settings').set('Authorization', auth).send(body).expect(400)
      expect(res.body.code).toBe('VALIDATION_FAILED')
    }
    await http()
      .patch('/api/v1/settings')
      .set('Authorization', auth)
      .send({ taxRate: 0, maxDiscountPct: 100 })
      .expect(200)
  })

  it('tenantId yuborib boshqa do‘kon sozlamasini o‘zgartirib bo‘lmaydi', async () => {
    await http()
      .patch('/api/v1/settings')
      .set('Authorization', await bearer(app, a))
      .send({ tenantId: b.tenantId, storeName: 'Buzildi' })
      .expect(400)
    const bRow = await testDb.settings.findUniqueOrThrow({ where: { tenantId: b.tenantId } })
    expect(bRow.storeName).not.toBe('Buzildi')
  })

  it('keshlanadi: takroriy o‘qish bazaga bormaydi', async () => {
    const auth = await bearer(app, a)
    const first = await captureQueries(() => http().get('/api/v1/settings').set('Authorization', auth).expect(200))
    expect(first.queries).toHaveLength(1)

    const second = await captureQueries(() => http().get('/api/v1/settings').set('Authorization', auth).expect(200))
    expect(second.queries).toHaveLength(0)

    // Kesh haqiqatan ishlayotganini isbotlash: bazani chetlab o'zgartirilgan
    // qiymat TTL tugaguncha ko'rinmaydi (shu sabab sozlamani boshqa joy yozmaydi)
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { storeName: 'Chetdan' } })
    const cached = await http().get('/api/v1/settings').set('Authorization', auth).expect(200)
    expect(cached.body.storeName).not.toBe('Chetdan')
  })

  it('servis orqali o‘zgarganda kesh bekor bo‘ladi', async () => {
    const auth = await bearer(app, a)
    await http().get('/api/v1/settings').set('Authorization', auth).expect(200)

    await http()
      .patch('/api/v1/settings')
      .set('Authorization', auth)
      .send({ storeName: 'Yangi nom', maxDiscountPct: 20 })
      .expect(200)

    const after = await http().get('/api/v1/settings').set('Authorization', auth).expect(200)
    expect(after.body).toMatchObject({ storeName: 'Yangi nom', maxDiscountPct: 20 })
  })

  it('tenantlar keshi aralashmaydi', async () => {
    await testDb.settings.update({ where: { tenantId: b.tenantId }, data: { storeName: 'B nomi' } })
    const authA = await bearer(app, a)
    const authB = await bearer(app, b)

    await http().get('/api/v1/settings').set('Authorization', authA).expect(200)
    await http().patch('/api/v1/settings').set('Authorization', authA).send({ taxRate: 5 }).expect(200)

    const resB = await http().get('/api/v1/settings').set('Authorization', authB).expect(200)
    expect(resB.body).toMatchObject({ storeName: 'B nomi', taxRate: 12 })
  })

  it('sotuvchiga ulgurji savdo: sukut — yopiq (narx yashirin, so‘rasa 403); yoqilsa — narxni ko‘radi va sotadi', async () => {
    const admin = await bearer(app, a)
    const seller = await bearer(app, a, 'sotuvchi')
    const p = await seedProduct(a.tenantId, a.warehouseId)
    await openShift(a.tenantId)
    const product = async () => (await http().get(`/api/v1/products/${p}`).set('Authorization', seller).expect(200)).body
    const sell = (priceTier: string) =>
      http()
        .post('/api/v1/sales')
        .set('Authorization', seller)
        .set('Idempotency-Key', randomUUID())
        .send({ priceTier, items: [{ productId: p, qty: 1 }], paid: { cash: 100_000, card: 0, transfer: 0 } })
    const exportedHeader = async () =>
      (await http().get('/api/v1/exports/products?format=csv').set('Authorization', seller).expect(200)).text.split('\n')[0]

    expect((await http().get('/api/v1/settings').set('Authorization', admin).expect(200)).body.sellerWholesaleEnabled).toBe(false)
    expect(await product()).not.toHaveProperty('wholesalePrice')
    expect((await sell('wholesale').expect(403)).body.code).toBe('PERMISSION_DENIED')
    expect((await sell('retail').expect(201)).body.items[0].price).toBe(60_000)
    expect(await exportedHeader()).not.toContain('Ulgurji narx')

    await http().patch('/api/v1/settings').set('Authorization', admin).send({ sellerWholesaleEnabled: true }).expect(200)
    expect((await product()).wholesalePrice).toBe(55_000)
    const wholesale = (await sell('wholesale').expect(201)).body
    expect(wholesale).toMatchObject({ priceTier: 'wholesale', items: [{ price: 55_000 }] })
    expect(await exportedHeader()).toContain('Ulgurji narx')
    // Tannarx baribir yashirin
    expect(await product()).not.toHaveProperty('cost')

    // Do'konda ulgurji savdo o'chirilsa — sotuvchiga ham yopiladi
    await http().patch('/api/v1/settings').set('Authorization', admin).send({ wholesaleEnabled: false }).expect(200)
    expect(await product()).not.toHaveProperty('wholesalePrice')
  })

  it('o‘zgarish audit jurnaliga tushadi', async () => {
    await http()
      .patch('/api/v1/settings')
      .set('Authorization', await bearer(app, a))
      .send({ loyaltyRate: 3 })
      .expect(200)
    // Interceptor jurnalni javobni kutdirmay yozadi — yozuv biroz keyin tushadi
    await vi.waitFor(async () => {
      const entry = await testDb.auditEntry.findFirst({
        where: { tenantId: a.tenantId, action: 'settings.update' },
      })
      expect(entry).toMatchObject({ userId: a.userId, entityType: 'settings' })
    })
  })
})
