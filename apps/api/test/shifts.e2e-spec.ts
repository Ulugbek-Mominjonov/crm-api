import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/** Kassa smenasi (T-059) va naqd kirim/chiqim (T-060): I8, I9, I10 */
describe('Kassa smenasi (/cash)', () => {
  let app: INestApplication
  let a: Tenant
  let auth: string

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
  })

  const post = (path: string, body: Record<string, unknown> = {}, token = auth) =>
    request(app.getHttpServer()).post(`/api/v1/cash/${path}`).set('Authorization', token).set('Idempotency-Key', randomUUID()).send(body)
  const current = async () =>
    (await request(app.getHttpServer()).get('/api/v1/cash/shifts/current').set('Authorization', auth).expect(200)).body

  describe('Smena (T-059)', () => {
    it('I10: ochishda balans sanoqqa tenglashadi', async () => {
      await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { cashBalance: 999_999n } })
      const res = await post('shifts/open', { openingBalance: 200_000 }).expect(201)
      expect(res.body).toMatchObject({ status: 'open', openingBalance: 200_000, cashIn: 0, cashOut: 0, userId: a.userId, cashierName: 'Test Admin' })
      expect(await current()).toMatchObject({ shift: { id: res.body.id, cashierName: 'Test Admin' }, cashBalance: 200_000 })
      expect(await testDb.auditEntry.count({ where: { action: 'shift.open' } })).toBe(1)
    })

    it('I8: ikkinchi smenani ochib bo‘lmaydi; parallel ikki urinishdan bittasi o‘tadi', async () => {
      const results = await Promise.all([post('shifts/open', { openingBalance: 0 }), post('shifts/open', { openingBalance: 0 })])
      expect(results.map((r) => r.status).sort()).toEqual([201, 409])
      expect(results.find((r) => r.status === 409)!.body.code).toBe('SHIFT_ALREADY_OPEN')
      expect(await testDb.cashShift.count({ where: { status: 'open' } })).toBe(1)
    })

    it('I8: baza darajasida ham — qisman noyob indeks', async () => {
      await testDb.cashShift.create({ data: { tenantId: a.tenantId, openedAt: new Date(), openingBalance: 0n } })
      await expect(
        testDb.cashShift.create({ data: { tenantId: a.tenantId, openedAt: new Date(), openingBalance: 0n } }),
      ).rejects.toThrow(/one_open_shift_per_tenant|Unique constraint/)
    })

    it('I10: yopishda kutilgan, sanalgan va farq saqlanadi', async () => {
      await post('shifts/open', { openingBalance: 200_000 }).expect(201)
      await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
      const p = await seedProduct(a.tenantId, a.warehouseId, { price: 100_000n })
      await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', auth)
        .set('Idempotency-Key', randomUUID())
        .send({ items: [{ productId: p, qty: 1 }], paid: { cash: 100_000, card: 0, transfer: 0 } })
        .expect(201)

      const res = await post('shifts/close', { countedBalance: 295_000, note: '5000 kam', denominations: { '100000': 2, '50000': 1, '5000': 9 } }).expect(200)
      expect(res.body).toMatchObject({
        status: 'closed', expectedBalance: 300_000, countedBalance: 295_000, difference: -5_000, cashIn: 100_000, note: '5000 kam',
      })
      expect(res.body.closedAt).not.toBeNull()
      expect((await current()).shift).toBeNull()
    })

    it('yopiq smenani yopish — 409 SHIFT_NOT_OPEN; kupyuralar yig‘indisi mos kelmasa — 400', async () => {
      expect((await post('shifts/close', { countedBalance: 0 }).expect(409)).body.code).toBe('SHIFT_NOT_OPEN')
      await post('shifts/open', { openingBalance: 0 }).expect(201)
      const res = await post('shifts/close', { countedBalance: 100_000, denominations: { '50000': 1 } }).expect(400)
      expect(res.body.errors[0].meta).toEqual({ sum: 50_000, counted: 100_000 })
    })

    it('tarix: holat va ochilgan kun (Toshkent) bo‘yicha filtr, yangisi birinchi', async () => {
      // 20:00 UTC — Toshkentda ertasi kun 01:00
      const opened = ['2026-09-01T05:00:00Z', '2026-09-01T20:00:00Z', '2026-09-03T05:00:00Z']
      await testDb.cashShift.createMany({
        data: opened.map((at) => ({ tenantId: a.tenantId, openedAt: new Date(at), closedAt: new Date(at), openingBalance: 0n, status: 'closed' as const })),
      })
      const list = (query: string) =>
        request(app.getHttpServer()).get(`/api/v1/cash/shifts?status=closed&${query}`).set('Authorization', auth).expect(200)
      const day1 = await list('dateFrom=2026-09-01&dateTo=2026-09-01')
      expect(day1.body.items.map((s: { openedAt: string }) => s.openedAt)).toEqual(['2026-09-01T05:00:00.000Z'])
      expect(day1.body.items[0].cashierName).toBeNull()
      const fromDay2 = await list('dateFrom=2026-09-02')
      expect(fromDay2.body.items.map((s: { openedAt: string }) => s.openedAt)).toEqual(['2026-09-03T05:00:00.000Z', '2026-09-01T20:00:00.000Z'])
      await request(app.getHttpServer()).get('/api/v1/cash/shifts?dateFrom=01.09.2026').set('Authorization', auth).expect(400)
    })

    it('sotuvchi smena ochadi; omborchida kassa huquqi yo‘q', async () => {
      await post('shifts/open', { openingBalance: 0 }, await bearer(app, a, 'omborchi')).expect(403)
      await post('shifts/open', { openingBalance: 0 }, await bearer(app, a, 'sotuvchi')).expect(201)
    })
  })

  describe('Naqd kirim/chiqim (T-060)', () => {
    it('kirim va chiqim balansni va smena hisobini o‘zgartiradi; jurnalga tushadi', async () => {
      const shift = (await post('shifts/open', { openingBalance: 100_000 }).expect(201)).body
      await post('movements', { direction: 'in', amount: 50_000, reason: 'Maydalash uchun' }).expect(201)
      const out = await post('movements', { direction: 'out', amount: 30_000, reason: 'Egasi oldi' }).expect(201)
      expect(out.body).toMatchObject({ shiftId: shift.id, direction: 'out', amount: 30_000, userId: a.userId })

      expect((await current()).cashBalance).toBe(120_000)
      const row = await testDb.cashShift.findUniqueOrThrow({ where: { id: shift.id } })
      expect([Number(row.cashIn), Number(row.cashOut)]).toEqual([50_000, 30_000])
      const list = await request(app.getHttpServer()).get('/api/v1/cash/movements').set('Authorization', auth).expect(200)
      expect(list.body).toMatchObject({ total: 2 })
      expect(await testDb.auditEntry.count({ where: { action: { in: ['cash.in', 'cash.out'] } } })).toBe(2)
    })

    it('I9: smena yopiq — 423 SHIFT_REQUIRED, balans o‘zgarmaydi', async () => {
      const res = await post('movements', { direction: 'out', amount: 500_000, reason: 'x' }).expect(423)
      expect(res.body.code).toBe('SHIFT_REQUIRED')
      expect((await current()).cashBalance).toBe(0)
    })

    it('sabab majburiy, summa musbat — 400', async () => {
      await post('shifts/open', { openingBalance: 0 }).expect(201)
      await post('movements', { direction: 'in', amount: 1_000 }).expect(400)
      await post('movements', { direction: 'in', amount: 0, reason: 'x' }).expect(400)
    })
  })
})
