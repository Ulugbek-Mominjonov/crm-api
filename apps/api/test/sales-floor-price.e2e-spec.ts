import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, roleIdOf, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/**
 * Minimal narx va chegirma siyosati (T-141): tovar tannarx × (1 + marja) dan
 * past sotilmaydi — qo'lda narx, qator chegirmasi va umumiy chegirma bitta
 * chegarada; `sales.belowCost` bilan o'tadi va jurnalga tushadi; chegirma
 * foizi endi qator chegirmasi va qo'lda narxga ham; taklif yaratishda
 * tekshiriladi, aylantirishda emas; tannarxsiz tovarlar ro'yxati.
 * Mahsulot: narx 60 000, tannarx 45 000 (qop).
 */
describe('Minimal narx va chegirma siyosati', () => {
  let app: INestApplication
  let a: Tenant
  let admin: string
  let seller: string
  let p: string

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
    admin = await bearer(app, a)
    seller = await bearer(app, a, 'sotuvchi')
    p = await seedProduct(a.tenantId, a.warehouseId, { qty: '100' })
    await openShift(a.tenantId, 50_000n)
  })

  const api = () => request(app.getHttpServer())
  const settings = (body: Record<string, unknown>) => api().patch('/api/v1/settings').set('Authorization', admin).send(body)
  const sale = (body: Record<string, unknown>, token = seller) =>
    api().post('/api/v1/sales').set('Authorization', token).set('Idempotency-Key', randomUUID()).send({ paid: { cash: 10_000_000, card: 0, transfer: 0 }, ...body })
  const quote = (body: Record<string, unknown>, token = seller) => api().post('/api/v1/quotes').set('Authorization', token).send(body)
  const belowCostAudit = () => testDb.auditEntry.findMany({ where: { tenantId: a.tenantId, action: 'sale.belowCost' } })

  it('minimal narx (marja 10%): qator chegirmasi, qo‘lda narx, umumiy chegirma — 422 `cost` (`max`, `minPrice`); chegarada — 201; tannarxsiz — chegarasiz', async () => {
    await settings({ minMarginPct: 10 }).expect(200)
    // 45 000 × 1.1 = 49 500; 2 qop: ro'yxat 120 000, minimal 99 000
    const byDiscount = await sale({ items: [{ productId: p, qty: 2, discount: 21_001 }] }).expect(422)
    expect(byDiscount.body.code).toBe('DISCOUNT_LIMIT')
    expect(byDiscount.body.errors[0]).toEqual({ field: 'items[0].discount', code: 'DISCOUNT_LIMIT', meta: { max: 21_000, requested: 21_001, reason: 'cost', minPrice: 49_500 } })
    const byPrice = await sale({ items: [{ productId: p, qty: 1, price: 49_499 }] }).expect(422)
    expect(byPrice.body.errors[0]).toMatchObject({ field: 'items[0].price', meta: { reason: 'cost', minPrice: 49_500 } })
    const byTotal = await sale({ items: [{ productId: p, qty: 2 }], discount: 21_001 }).expect(422)
    expect(byTotal.body.errors[0]).toEqual({ field: 'discount', code: 'DISCOUNT_LIMIT', meta: { max: 21_000, requested: 21_001, reason: 'cost' } })

    const ok = await sale({ items: [{ productId: p, qty: 2, discount: 21_000 }] }).expect(201)
    expect(ok.body.subtotal).toBe(99_000)
    // Siyosat maydonlari chekda saqlanmaydi
    expect(Object.keys(ok.body.items[0])).not.toEqual(expect.arrayContaining(['minPrice', 'listTotal']))
    expect(await belowCostAudit()).toHaveLength(0)

    const free = await seedProduct(a.tenantId, a.warehouseId, { cost: 0n, qty: '5' })
    await sale({ items: [{ productId: free, qty: 1, price: 1 }] }).expect(201)
  })

  it('`sales.belowCost`: admin — 201 + jurnalda `sale.belowCost`; menejer sukutda yo‘q (422); rolga berilsa sotuvchi ham sotadi', async () => {
    const below = { items: [{ productId: p, qty: 1, price: 40_000 }] }
    const res = await sale(below, admin).expect(201)
    const [entry] = await belowCostAudit()
    expect(entry).toMatchObject({ entityId: res.body.id, userId: a.userId })
    expect(entry!.diff).toMatchObject({ subtotal: 40_000, minSubtotal: 45_000, items: [{ productId: p, price: 40_000, minPrice: 45_000, qty: 1 }] })

    await sale(below, await bearer(app, a, 'manager')).expect(422)
    await sale(below, seller).expect(422)
    // Administrator sotuvchi roliga ruxsat beradi — keyingi so'rovdanoq (kesh COMMIT'da tozalanadi)
    const roleId = await roleIdOf(a.tenantId, 'sotuvchi')
    const role = (await api().get(`/api/v1/roles/${roleId}`).set('Authorization', admin).expect(200)).body
    await api().patch(`/api/v1/roles/${roleId}`).set('Authorization', admin).set('If-Match', role.updatedAt)
      .send({ permissions: [...role.permissions, 'sales.belowCost'] }).expect(200)
    await sale(below, seller).expect(201)
    expect(await belowCostAudit()).toHaveLength(2)
  })

  it('chegirma foizi (10%) ro‘yxat narxiga nisbatan: qator chegirmasi, qo‘lda narx va umumiy chegirma birga — 422 `policy`', async () => {
    await settings({ maxDiscountPct: 10 }).expect(200)
    expect((await sale({ items: [{ productId: p, qty: 1, discount: 6_001 }] }).expect(422)).body.errors[0])
      .toEqual({ field: 'items[0].discount', code: 'DISCOUNT_LIMIT', meta: { max: 6_000, requested: 6_001, reason: 'policy' } })
    expect((await sale({ items: [{ productId: p, qty: 1, price: 53_999 }] }).expect(422)).body.errors[0])
      .toMatchObject({ field: 'items[0].price', meta: { max: 6_000, requested: 6_001, reason: 'policy' } })
    expect((await sale({ items: [{ productId: p, qty: 1, discount: 3_000 }], discount: 3_001 }).expect(422)).body.errors[0])
      .toEqual({ field: 'discount', code: 'DISCOUNT_LIMIT', meta: { max: 3_000, requested: 3_001, reason: 'policy' } })
    expect((await sale({ items: [{ productId: p, qty: 1, discount: 3_000 }], discount: 3_000 }).expect(201)).body.subtotal).toBe(57_000)
    // Admin uchun ham foiz amal qiladi (siyosat), minimal narx esa amal qilmaydi
    await sale({ items: [{ productId: p, qty: 1, discount: 6_001 }] }, admin).expect(422)
  })

  it('taklif: yaratishda tekshiriladi (sotuvchi 422, admin 201); admin taklifini sotuvchi aylantiradi — 201 + jurnal belgisi', async () => {
    const body = { items: [{ productId: p, qty: 1, price: 40_000 }] }
    expect((await quote(body).expect(422)).body.errors[0]).toMatchObject({ field: 'items[0].price', meta: { reason: 'cost', minPrice: 45_000 } })
    const q = (await quote(body, admin).expect(201)).body
    expect(q.total).toBe(44_800)
    const converted = await api().post(`/api/v1/quotes/${q.id}/convert`).set('Authorization', seller).set('Idempotency-Key', randomUUID()).send({ method: 'cash' }).expect(201)
    expect(converted.body.subtotal).toBe(40_000)
    expect((await belowCostAudit()).map((e) => e.entityId)).toEqual([converted.body.id])
  })

  it('tannarxsiz tovarlar: xulosada soni, `noCost=true` filtri; sozlama 0–100', async () => {
    const free = await seedProduct(a.tenantId, a.warehouseId, { cost: 0n, qty: '5' })
    expect((await api().get('/api/v1/products/summary').set('Authorization', admin).expect(200)).body).toMatchObject({ active: 2, withoutCost: 1 })
    const list = await api().get('/api/v1/products?noCost=true').set('Authorization', admin).expect(200)
    expect(list.body.items.map((x: { id: string }) => x.id)).toEqual([free])
    await settings({ minMarginPct: 101 }).expect(400)
    await settings({ minMarginPct: -1 }).expect(400)
    expect((await settings({ minMarginPct: 25 }).expect(200)).body.minMarginPct).toBe(25)
  })
})
