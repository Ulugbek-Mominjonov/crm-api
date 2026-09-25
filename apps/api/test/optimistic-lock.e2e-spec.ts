import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Raqobatli tahrirlash (T-098, 04 §4.4): `PATCH` + `If-Match: <updatedAt>`.
 * Yozuv boshqa foydalanuvchi tomonidan o'zgargan bo'lsa — 409
 * `VERSION_CONFLICT` va joriy holat (`current`); o'zgarish yozilmaydi.
 */
describe('Optimistik qulf (If-Match)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
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
    b = await seedTenant('B do‘kon')
    auth = await bearer(app, a)
    product = await seedProduct(a.tenantId, a.warehouseId, { price: 60_000n })
  })

  const api = () => request(app.getHttpServer())
  const get = async (path: string) => (await api().get(`/api/v1/${path}`).set('Authorization', auth).expect(200)).body
  const patch = (path: string, body: Record<string, unknown>, ifMatch?: string) => {
    const req = api().patch(`/api/v1/${path}`).set('Authorization', auth)
    return (ifMatch === undefined ? req : req.set('If-Match', ifMatch)).send(body)
  }
  const post = (path: string, body: Record<string, unknown>) =>
    api().post(`/api/v1/${path}`).set('Authorization', auth).set('Idempotency-Key', randomUUID()).send(body)

  it('mos versiya — saqlanadi va yangi versiya qaytadi; eskisi bilan — 409 joriy holat bilan, o‘zgarish yo‘q', async () => {
    const seen = await get(`products/${product}`)
    const saved = await patch(`products/${product}`, { price: 61_000 }, seen.updatedAt).expect(200)
    expect(saved.body.price).toBe(61_000)
    expect(saved.body.updatedAt).not.toBe(seen.updatedAt)

    // Ikkinchi foydalanuvchi eski formadan saqlaydi
    const stale = await patch(`products/${product}`, { price: 59_000 }, seen.updatedAt).expect(409)
    expect(stale.body).toMatchObject({
      code: 'VERSION_CONFLICT',
      current: { id: product, price: 61_000, updatedAt: saved.body.updatedAt },
    })
    expect((await get(`products/${product}`)).price).toBe(61_000)
  })

  it('sarlavhasiz — tekshirilmaydi; ETag uslubidagi qo‘shtirnoq — qabul; buzuq qiymat — 400', async () => {
    await patch(`products/${product}`, { price: 62_000 }).expect(200)
    const seen = await get(`products/${product}`)
    await patch(`products/${product}`, { price: 63_000 }, `"${seen.updatedAt}"`).expect(200)
    const bad = await patch(`products/${product}`, { price: 64_000 }, 'kecha').expect(400)
    expect(bad.body.errors[0]).toMatchObject({ field: 'If-Match', code: 'VALIDATION_FAILED' })
  })

  it('yo‘q yoki boshqa tenant yozuvi — 404 (409 emas: mavjudlik oshkor qilinmaydi)', async () => {
    const foreign = await seedClient(b.tenantId)
    const version = new Date().toISOString()
    await patch(`clients/${foreign}`, { name: 'Buzildi' }, version).expect(404)
    await patch(`clients/${randomUUID()}`, { name: 'Buzildi' }, version).expect(404)
  })

  it('sotuv (qoldiq) versiyani o‘zgartirmaydi; kirim tannarxi va ommaviy narx — o‘zgartiradi', async () => {
    await openShift(a.tenantId)
    const seen = await get(`products/${product}`)
    await post('sales', { items: [{ productId: product, qty: 1 }], paid: { cash: 70_000, card: 0, transfer: 0 } }).expect(201)
    const afterSale = await patch(`products/${product}`, { name: 'Sement M500' }, seen.updatedAt).expect(200)

    await post('stock/intake', { productId: product, qty: 10, unitCost: 50_000 }).expect(201)
    await patch(`products/${product}`, { name: 'Sement M600' }, afterSale.body.updatedAt).expect(409)

    const fresh = await get(`products/${product}`)
    await api().post('/api/v1/products/bulk-price').set('Authorization', auth)
      .send({ ids: [product], mode: 'set', value: 65_000, target: 'price' }).expect(200)
    await patch(`products/${product}`, { name: 'Sement M700' }, fresh.updatedAt).expect(409)
  })

  it('bazadagi mikrosekund aniqlik — JSON’dagi millisekund qiymat bilan mos keladi', async () => {
    await testDb.$executeRaw`UPDATE products SET updated_at = now() WHERE id = ${product}::uuid`
    const seen = await get(`products/${product}`)
    await patch(`products/${product}`, { price: 66_000 }, seen.updatedAt).expect(200)
  })

  it('maxsus tahrirlar ham: foydalanuvchi (rol) va xodimni bo‘shatish', async () => {
    const employee = await testDb.employee.create({
      data: { tenantId: a.tenantId, name: 'Kassir', position: 'Kassir', phone: '+998901234567', hiredAt: new Date('2026-01-01') },
    })
    const user = await testDb.user.create({
      data: { tenantId: a.tenantId, employeeId: employee.id, email: 'kassir@crm.uz', passwordHash: 'x', role: 'sotuvchi' },
    })
    const seenUser = await get(`users/${user.id}`)
    await patch(`users/${user.id}`, { role: 'omborchi' }, seenUser.updatedAt).expect(200)
    const staleUser = await patch(`users/${user.id}`, { role: 'manager' }, seenUser.updatedAt).expect(409)
    expect(staleUser.body.current).toMatchObject({ id: user.id, role: 'omborchi' })

    const other = await testDb.employee.create({
      data: { tenantId: a.tenantId, name: 'Yuklovchi', position: 'Yuklovchi', phone: '+998901234568', hiredAt: new Date('2026-01-01') },
    })
    const seenEmployee = await get(`employees/${other.id}`)
    await patch(`employees/${other.id}`, { position: 'Omborchi' }).expect(200)
    await patch(`employees/${other.id}`, { status: 'fired' }, seenEmployee.updatedAt).expect(409)
    expect((await testDb.employee.findUniqueOrThrow({ where: { id: other.id } })).status).not.toBe('fired')
  })
})
