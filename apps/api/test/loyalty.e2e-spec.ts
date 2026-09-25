import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Sodiqlik (T-067, I17): foiz sozlamadan, nasiyada ham beriladi, bekor
 * qilinganda qaytariladi, balansdan ko'p sarflanmaydi, manfiy bo'lmaydi.
 */
describe('Sodiqlik — bonus ball', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
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
    auth = await bearer(app, a)
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false, loyaltyRate: 2 } })
    p = await seedProduct(a.tenantId, a.warehouseId, { qty: '100', price: 100_000n })
    await openShift(a.tenantId)
  })

  const sell = async (body: Record<string, unknown>) =>
    (await request(app.getHttpServer())
      .post('/api/v1/sales')
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ productId: p, qty: 5 }], paid: { cash: 500_000, card: 0, transfer: 0 }, ...body })
      .expect(201)).body
  const cancel = (id: string) =>
    request(app.getHttpServer()).post(`/api/v1/sales/${id}/cancel`).set('Authorization', auth).set('Idempotency-Key', randomUUID()).expect(200)
  const bonusOf = async (id: string) => Number((await testDb.client.findUniqueOrThrow({ where: { id } })).bonusPoints)

  it('ball sozlamadagi foizdan; nasiya sotuvda ham', async () => {
    const c = await seedClient(a.tenantId)
    const s = await sell({ customerId: c, paid: { cash: 0, card: 0, transfer: 0 } })
    expect(s).toMatchObject({ status: 'pending', bonusEarned: 10_000 }) // 500 000 × 2%
    expect(await bonusOf(c)).toBe(10_000)
    // Mijozsiz chekda ball hisoblanmaydi
    expect((await sell({})).bonusEarned).toBe(0)
  })

  it('mavjud balansdan ko‘p sarflab bo‘lmaydi — ishlatilgani chekda', async () => {
    const c = await seedClient(a.tenantId, { bonusPoints: 3_000n })
    const s = await sell({ customerId: c, bonusUsed: 50_000, paid: { cash: 497_000, card: 0, transfer: 0 } })
    expect(s).toMatchObject({ bonusUsed: 3_000, total: 497_000 })
    // 3 000 sarflandi, 497 000 × 2% = 9 940 berildi
    expect(await bonusOf(c)).toBe(9_940)
  })

  it('bekor qilinganda berilgani olinadi, ishlatilgani qaytadi; balans manfiy emas', async () => {
    const c = await seedClient(a.tenantId, { bonusPoints: 3_000n })
    const s = await sell({ customerId: c, bonusUsed: 3_000, paid: { cash: 497_000, card: 0, transfer: 0 } })
    await cancel(s.id)
    expect(await bonusOf(c)).toBe(3_000)

    const second = await sell({ customerId: c })
    await testDb.client.update({ where: { id: c }, data: { bonusPoints: 100n } }) // ball sarflangan
    await cancel(second.id)
    expect(await bonusOf(c)).toBe(0)
  })

  it('dastur o‘chiq — ball berilmaydi va ishlatilmaydi', async () => {
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { loyaltyEnabled: false } })
    const c = await seedClient(a.tenantId, { bonusPoints: 5_000n })
    const s = await sell({ customerId: c, bonusUsed: 5_000 })
    expect(s).toMatchObject({ bonusUsed: 0, bonusEarned: 0, total: 500_000 })
    expect(await bonusOf(c)).toBe(5_000)
  })
})
