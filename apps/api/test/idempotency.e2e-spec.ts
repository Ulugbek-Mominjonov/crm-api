import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { IdempotencyJobs } from '@/modules/idempotency/idempotency.jobs'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/** Idempotentlik (T-050, 04 §4.3) — kirim endpointi misolida */
describe('Idempotentlik', () => {
  let app: INestApplication
  let a: Tenant
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
    product = await seedProduct(a.tenantId, a.warehouseId, { qty: '10' })
  })

  const intake = (key: string | null, body: Record<string, unknown>, token = auth) => {
    const req = request(app.getHttpServer()).post('/api/v1/stock/intake').set('Authorization', token)
    return (key === null ? req : req.set('Idempotency-Key', key)).send(body)
  }
  const stock = async () => Number((await testDb.product.findUniqueOrThrow({ where: { id: product } })).stock)

  it('bir xil kalit + bir xil tana → saqlangan javob, amal BIR marta', async () => {
    const key = randomUUID()
    const first = await intake(key, { productId: product, qty: 5 }).expect(201)
    const again = await intake(key, { productId: product, qty: 5 }).expect(201)

    expect(again.body).toEqual(first.body)
    expect(again.headers['idempotent-replay']).toBe('true')
    expect(first.headers['idempotent-replay']).toBeUndefined()
    expect(await stock()).toBe(15)
    expect(await testDb.stockMovement.count({ where: { productId: product } })).toBe(1)
    expect(await testDb.auditEntry.count({ where: { action: 'stock.intake' } })).toBe(1)
  })

  it('maydonlar tartibi boshqa — baribir bir xil so‘rov', async () => {
    const key = randomUUID()
    await intake(key, { productId: product, qty: 5, note: 'x' }).expect(201)
    await intake(key, { note: 'x', qty: 5, productId: product }).expect(201)
    expect(await stock()).toBe(15)
  })

  it('bir xil kalit + boshqa tana → 409 IDEMPOTENCY_MISMATCH', async () => {
    const key = randomUUID()
    await intake(key, { productId: product, qty: 5 }).expect(201)
    const res = await intake(key, { productId: product, qty: 6 }).expect(409)
    expect(res.body.code).toBe('IDEMPOTENCY_MISMATCH')

    // Boshqa endpointda ham — bu boshqa so'rov
    const other = await request(app.getHttpServer())
      .post('/api/v1/stock/writeoff')
      .set('Authorization', auth)
      .set('Idempotency-Key', key)
      .send({ productId: product, qty: 5, reason: 'x' })
      .expect(409)
    expect(other.body.code).toBe('IDEMPOTENCY_MISMATCH')
    expect(await stock()).toBe(15)
  })

  it('parallel ikki bir xil so‘rov — amal BIR marta, ikkalasi bir xil javob', async () => {
    const key = randomUUID()
    const [x, y] = await Promise.all([
      intake(key, { productId: product, qty: 5 }),
      intake(key, { productId: product, qty: 5 }),
    ])
    expect([x.status, y.status]).toEqual([201, 201])
    expect(x.body).toEqual(y.body)
    expect(await stock()).toBe(15)
    expect(await testDb.stockMovement.count({ where: { productId: product } })).toBe(1)
  })

  it('yiqilgan amal kalitni band qilmaydi — tuzatib, o‘sha kalit bilan qayta urinish mumkin', async () => {
    const key = randomUUID()
    const archived = await testDb.warehouse.create({ data: { tenantId: a.tenantId, name: 'Arxiv', archived: true } })
    await intake(key, { productId: product, warehouseId: archived.id, qty: 5 }).expect(422)
    expect(await testDb.idempotencyKey.count()).toBe(0)

    await testDb.warehouse.update({ where: { id: archived.id }, data: { archived: false } })
    await intake(key, { productId: product, warehouseId: archived.id, qty: 5 }).expect(201)
  })

  it('kalit majburiy va formati tekshiriladi', async () => {
    const missing = await intake(null, { productId: product, qty: 5 }).expect(400)
    expect(missing.body.errors[0].field).toBe('Idempotency-Key')
    await intake('qisqa', { productId: product, qty: 5 }).expect(400)
    await intake('kalit ichida bo sh joy', { productId: product, qty: 5 }).expect(400)
    expect(await stock()).toBe(10)
  })

  it('yangi kalit + noto‘g‘ri tana: 400 va kalit band QILINMAYDI', async () => {
    // Interceptor validatsiyadan oldin ishlaydi, lekin validatsiya xatosi
    // tranzaksiyani bekor qiladi — kalit bilan birga
    const key = randomUUID()
    await intake(key, { productId: product, qty: -1 }).expect(400)
    expect(await testDb.idempotencyKey.count()).toBe(0)
    await intake(key, { productId: product, qty: 1 }).expect(201)
  })

  it('kalit do‘kon ichida noyob — boshqa do‘kon o‘sha kalitni mustaqil ishlatadi', async () => {
    const b = await seedTenant('B do‘kon')
    const bProduct = await seedProduct(b.tenantId, b.warehouseId, { qty: '1' })
    const key = randomUUID()
    await intake(key, { productId: product, qty: 5 }).expect(201)
    const other = await intake(key, { productId: bProduct, qty: 2 }, await bearer(app, b)).expect(201)
    expect(other.headers['idempotent-replay']).toBeUndefined()
    expect(Number((await testDb.product.findUniqueOrThrow({ where: { id: bProduct } })).stock)).toBe(3)
  })

  it('24 soatdan eski kalitlar tozalanadi; muddati o‘tgan kalit — yangi amal', async () => {
    const oldKey = randomUUID()
    await intake(oldKey, { productId: product, qty: 1 }).expect(201)
    const freshKey = randomUUID()
    await intake(freshKey, { productId: product, qty: 1 }).expect(201)
    await testDb.idempotencyKey.updateMany({
      where: { key: oldKey },
      data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) },
    })

    // Tozalash ishidan OLDIN: muddati o'tgan kalit qayta ishlatilsa — yangi amal
    await intake(oldKey, { productId: product, qty: 2 }).expect(201)
    expect(await stock()).toBe(14)

    await testDb.idempotencyKey.updateMany({
      where: { key: oldKey },
      data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) },
    })
    const removed = await app.get(IdempotencyJobs).purgeExpired()
    expect(removed).toBe(1)
    expect((await testDb.idempotencyKey.findMany()).map((k) => k.key)).toEqual([freshKey])
  })
})
