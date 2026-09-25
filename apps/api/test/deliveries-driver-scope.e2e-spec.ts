import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries } from './helpers/queries'

/**
 * Haydovchi ko'rinishi va marshrut (T-075): haydovchi faqat O'ZIGA
 * biriktirilganlarni ko'radi va boshqaradi; marshrut — bitta so'rov.
 */
describe('Haydovchi ko‘rinishi', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let jasur: { employeeId: string; token: string }
  let other: string

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
    const employee = await testDb.employee.create({
      data: { tenantId: a.tenantId, name: 'Jasur', position: 'Haydovchi', phone: '+998901110000', hiredAt: new Date() },
    })
    const user = await testDb.user.create({
      data: { tenantId: a.tenantId, employeeId: employee.id, email: `jasur+${a.tenantId.slice(-6)}@crm.uz`, passwordHash: 'x', role: 'omborchi' },
    })
    jasur = { employeeId: employee.id, token: await bearer(app, { tenantId: a.tenantId, userId: user.id, employeeId: employee.id }, 'omborchi') }
    other = (await testDb.employee.create({
      data: { tenantId: a.tenantId, name: 'Boshqa', position: 'Haydovchi', phone: '+998901110001', hiredAt: new Date() },
    })).id
  })

  const delivery = (driverId: string, extra: Record<string, unknown> = {}) =>
    testDb.delivery.create({
      data: {
        tenantId: a.tenantId, address: 'Manzil', phone: '+998900000000', driverId,
        scheduledDate: new Date('2026-09-24T00:00:00Z'), standaloneFee: 10_000n, ...extra,
      },
    })

  it('`/deliveries/my` — faqat o‘ziga biriktirilgan faollar', async () => {
    const mine = await delivery(jasur.employeeId)
    await delivery(jasur.employeeId, { status: 'delivered' })
    await delivery(other)
    const res = await request(app.getHttpServer()).get('/api/v1/deliveries/my').set('Authorization', jasur.token).expect(200)
    expect(res.body.map((d: { id: string }) => d.id)).toEqual([mine.id])
  })

  it('tahrir huquqisiz haydovchi faqat o‘z yetkazishi holatini o‘zgartiradi', async () => {
    const mine = await delivery(jasur.employeeId)
    const foreign = await delivery(other)
    await request(app.getHttpServer()).post(`/api/v1/deliveries/${mine.id}/status`).set('Authorization', jasur.token).send({ status: 'on_way' }).expect(200)
    const denied = await request(app.getHttpServer())
      .post(`/api/v1/deliveries/${foreign.id}/status`)
      .set('Authorization', jasur.token)
      .send({ status: 'on_way' })
      .expect(403)
    expect(denied.body.code).toBe('PERMISSION_DENIED')
    // Menejer/admin — har qandayini
    await request(app.getHttpServer()).post(`/api/v1/deliveries/${foreign.id}/status`).set('Authorization', auth).send({ status: 'on_way' }).expect(200)
  })

  it('marshrut varaqasi: kun, tartib, olinadigan pul — bitta so‘rov', async () => {
    await delivery(jasur.employeeId)
    await delivery(jasur.employeeId, { standaloneFee: 25_000n })
    await delivery(jasur.employeeId, { status: 'cancelled' })
    await delivery(jasur.employeeId, { scheduledDate: new Date('2026-09-25T00:00:00Z') })
    const { result, queries } = await captureQueries(() =>
      request(app.getHttpServer()).get('/api/v1/deliveries/route?date=2026-09-24').set('Authorization', jasur.token),
    )
    expect(result.status).toBe(200)
    expect(queries).toHaveLength(1)
    expect(result.body).toMatchObject({ date: '2026-09-24', driver: { id: jasur.employeeId, name: 'Jasur' }, collectTotal: 35_000 })
    expect(result.body.stops.map((s: { sequence: number; collect: number }) => [s.sequence, s.collect])).toEqual([[1, 10_000], [2, 25_000]])
  })
})
