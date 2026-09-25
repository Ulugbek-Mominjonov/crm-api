import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { ExpenseTemplateJobs } from '@/modules/expenses/expense-templates.jobs'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/**
 * Xarajatlarning kassa ta'siri (T-062) va takrorlanuvchi shablonlar
 * (T-063, I21 — `recurring-once-per-period`).
 */
describe('Xarajatlar (/expenses)', () => {
  let app: INestApplication
  let a: Tenant
  let auth: string
  let shiftId: string

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
    shiftId = await openShift(a.tenantId, 1_000_000n)
  })

  const api = () => request(app.getHttpServer())
  const create = (body: Record<string, unknown>, token = auth) =>
    api().post('/api/v1/expenses').set('Authorization', token).set('Idempotency-Key', randomUUID()).send(body)
  const cash = async () => Number((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).cashBalance)
  const cashOut = async () => Number((await testDb.cashShift.findUniqueOrThrow({ where: { id: shiftId } })).cashOut)

  describe('Kassa ta’siri (T-062)', () => {
    it('naqd xarajat kassadan chiqadi va smenaga yoziladi', async () => {
      const res = await create({ category: 'transport', amount: 150_000, method: 'cash', note: 'Yuk tashish' }).expect(201)
      expect(res.body).toMatchObject({ amount: 150_000, method: 'cash', shiftId, userId: a.userId })
      expect(await cash()).toBe(850_000)
      expect(await cashOut()).toBe(150_000)
    })

    it('I9: bank xarajati kassaga tegmaydi — smena yopiq bo‘lsa ham', async () => {
      await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeShiftId: null } })
      const res = await create({ category: 'rent', amount: 500_000, method: 'bank' }).expect(201)
      expect(res.body.shiftId).toBeNull()
      expect(await cash()).toBe(1_000_000)
    })

    it('I8: naqd xarajat smenasiz — 423 SHIFT_REQUIRED', async () => {
      await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeShiftId: null } })
      expect((await create({ category: 'other', amount: 1_000, method: 'cash' }).expect(423)).body.code).toBe('SHIFT_REQUIRED')
      expect(await testDb.expense.count()).toBe(0)
    })

    it('tahrir: eski ta’sir qaytariladi, yangisi qo‘llanadi', async () => {
      const e = (await create({ category: 'other', amount: 100_000, method: 'cash' }).expect(201)).body
      const patch = (body: Record<string, unknown>) => api().patch(`/api/v1/expenses/${e.id}`).set('Authorization', auth).send(body).expect(200)

      await patch({ amount: 130_000 })
      expect(await cash()).toBe(870_000)
      await patch({ method: 'bank' })
      expect(await cash()).toBe(1_000_000)
      const back = await patch({ method: 'cash', amount: 40_000 })
      expect(back.body).toMatchObject({ method: 'cash', amount: 40_000, shiftId })
      expect(await cash()).toBe(960_000)
    })

    it('o‘chirish pulni qaytaradi, tiklash yana chiqaradi; ikkinchi o‘chirish — 404', async () => {
      const e = (await create({ category: 'other', amount: 70_000, method: 'cash' }).expect(201)).body
      await api().delete(`/api/v1/expenses/${e.id}`).set('Authorization', auth).expect(204)
      expect(await cash()).toBe(1_000_000)
      await api().delete(`/api/v1/expenses/${e.id}`).set('Authorization', auth).expect(404)
      await api().post(`/api/v1/expenses/${e.id}/restore`).set('Authorization', auth).expect(200)
      expect(await cash()).toBe(930_000)
      // Tiklangan xarajatni qayta tiklash — ta'sir takrorlanmaydi
      await api().post(`/api/v1/expenses/${e.id}/restore`).set('Authorization', auth).expect(200)
      expect(await cash()).toBe(930_000)
    })

    it('ro‘yxat filtrlari; sotuvchida xarajat huquqi yo‘q', async () => {
      await create({ category: 'rent', amount: 1_000, method: 'bank', date: '2026-09-01' }).expect(201)
      await create({ category: 'salary', amount: 2_000, method: 'cash' }).expect(201)
      const res = await api().get('/api/v1/expenses?category=rent&dateTo=2026-09-10').set('Authorization', auth).expect(200)
      expect(res.body.items.map((e: { category: string }) => e.category)).toEqual(['rent'])
      await create({ category: 'other', amount: 1, method: 'cash' }, await bearer(app, a, 'sotuvchi')).expect(403)
    })

    it('xulosa: bugun/oy/jami filtrsiz, taqsimot filtr bilan; o‘chirilgan hisobga kirmaydi', async () => {
      await create({ category: 'rent', amount: 1_000, method: 'bank', date: '2026-01-05' }).expect(201)
      await create({ category: 'salary', amount: 2_000, method: 'cash' }).expect(201)
      await create({ category: 'salary', amount: 3_000, method: 'bank' }).expect(201)
      const gone = await create({ category: 'transport', amount: 9_000, method: 'bank' }).expect(201)
      await api().delete(`/api/v1/expenses/${gone.body.id}`).set('Authorization', auth).expect(204)

      const all = await api().get('/api/v1/expenses/summary').set('Authorization', auth).expect(200)
      expect(all.body).toEqual({
        today: 5_000, month: 5_000, total: 6_000,
        byCategory: [{ category: 'salary', amount: 5_000 }, { category: 'rent', amount: 1_000 }],
      })
      const bank = await api().get('/api/v1/expenses/summary?method=bank').set('Authorization', auth).expect(200)
      expect(bank.body).toMatchObject({ total: 6_000, byCategory: [{ category: 'salary', amount: 3_000 }, { category: 'rent', amount: 1_000 }] })
    })
  })

  describe('Takrorlanuvchi shablonlar (T-063, I21)', () => {
    const template = async (body: Record<string, unknown> = {}) =>
      (await api()
        .post('/api/v1/expense-templates')
        .set('Authorization', auth)
        .send({ name: 'Ijara', category: 'rent', amount: 5_000_000, method: 'bank', period: 'monthly', dayOfPeriod: 1, ...body })
        .expect(201)).body
    const jobs = () => app.get(ExpenseTemplateJobs)

    it('ikkinchi chaqiruvda takrorlanmaydi; keyingi oyda yana ishlaydi', async () => {
      const t = await template()
      expect(await jobs().runAll(new Date('2026-08-05T06:00:00Z'))).toBe(1)
      expect(await jobs().runAll(new Date('2026-08-20T06:00:00Z'))).toBe(0)
      expect(await testDb.expense.count({ where: { templateId: t.id } })).toBe(1)
      expect((await testDb.expenseTemplate.findUniqueOrThrow({ where: { id: t.id } })).lastRunKey).toBe('2026-08')

      expect(await jobs().runAll(new Date('2026-09-05T06:00:00Z'))).toBe(1)
      expect(await testDb.expense.count({ where: { templateId: t.id } })).toBe(2)
      expect(await testDb.auditEntry.count({ where: { action: 'expense.recurring' } })).toBe(2)
    })

    it('parallel ikki instansiya ikki marta yaratmaydi', async () => {
      await template()
      const now = new Date('2026-08-05T06:00:00Z')
      const [x, y] = await Promise.all([jobs().runAll(now), jobs().runAll(now)])
      expect(x + y).toBe(1)
      expect(await testDb.expense.count()).toBe(1)
    })

    it('kuni kelmagan, faol bo‘lmagan shablon ishlamaydi; haftalik — ISO hafta', async () => {
      await template({ dayOfPeriod: 20 })
      await template({ name: 'Eski', active: false })
      await template({ name: 'Internet', period: 'weekly', dayOfPeriod: 3, amount: 100_000 })
      // 2026-08-05 — chorshanba (3)
      expect(await jobs().runAll(new Date('2026-08-05T06:00:00Z'))).toBe(1)
      const weekly = await testDb.expenseTemplate.findFirstOrThrow({ where: { name: 'Internet' } })
      expect(weekly.lastRunKey).toBe('2026-W32')
    })

    it('naqd shablon: ochiq smenada kassadan chiqadi', async () => {
      await template({ method: 'cash', amount: 200_000 })
      await jobs().runAll(new Date('2026-08-05T06:00:00Z'))
      expect(await cash()).toBe(800_000)
      const expense = await testDb.expense.findFirstOrThrow()
      expect(expense).toMatchObject({ shiftId, note: 'Ijara' })
    })

    it('Toshkent vaqti: 00:05 da (UTC bo‘yicha kechagi kun) yangi oy boshlangan', async () => {
      await template()
      // 2026-09-01 00:05 Toshkent = 2026-08-31 19:05 UTC
      expect(await jobs().runAll(new Date('2026-08-31T19:05:00Z'))).toBe(1)
      expect((await testDb.expense.findFirstOrThrow()).date.toISOString().slice(0, 10)).toBe('2026-09-01')
    })

    it('qo‘lda ishga tushirish va haftalik kun chegarasi', async () => {
      await api()
        .post('/api/v1/expense-templates')
        .set('Authorization', auth)
        .send({ name: 'X', category: 'other', amount: 1, method: 'bank', period: 'weekly', dayOfPeriod: 9 })
        .expect(400)
      const res = await api().post('/api/v1/expense-templates/run-due').set('Authorization', auth).expect(200)
      expect(res.body).toEqual({ created: 0 })
    })
  })
})
