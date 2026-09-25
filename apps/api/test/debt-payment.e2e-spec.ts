import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { runWithContext } from '@/common/context/request-context'
import { businessDate } from '@/common/time'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { appDb, openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries } from './helpers/queries'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/** Qarz to'lovi (T-064: I13, I14, parallel) va qarzdorlar ro'yxati (T-065) */
describe('Qarzlar (/debts)', () => {
  let app: INestApplication
  let a: Tenant
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
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    p = await seedProduct(a.tenantId, a.warehouseId, { qty: '1000', price: 100_000n })
    await openShift(a.tenantId, 0n)
  })

  const api = () => request(app.getHttpServer())
  const creditSale = async (customerId: string, extra: Record<string, unknown> = {}, qty = 1) =>
    (await api()
      .post('/api/v1/sales')
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send({ customerId, items: [{ productId: p, qty }], paid: { cash: 0, card: 0, transfer: 0 }, ...extra })
      .expect(201)).body
  const pay = (body: Record<string, unknown>, token = auth) =>
    api().post('/api/v1/debts/payments').set('Authorization', token).set('Idempotency-Key', randomUUID()).send(body)
  const cash = async () => Number((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).cashBalance)

  describe('To‘lov (T-064)', () => {
    it('I14: ortiqcha to‘lov rad etiladi', async () => {
      const c = await seedClient(a.tenantId)
      const s = await creditSale(c)
      const res = await pay({ saleId: s.id, amount: 150_000, method: 'cash' }).expect(422)
      expect(res.body).toMatchObject({ code: 'PAYMENT_EXCEEDS_DEBT', errors: [{ meta: { outstanding: 100_000, requested: 150_000 } }] })
    })

    it('qisman — pending qoladi; to‘liq — completed; naqd kassaga, smenaga', async () => {
      const c = await seedClient(a.tenantId)
      const s = await creditSale(c)
      const part = await pay({ saleId: s.id, amount: 30_000, method: 'cash' }).expect(201)
      expect(part.body.sale).toMatchObject({ status: 'pending', outstanding: 70_000, debtPaid: 30_000 })
      const full = await pay({ saleId: s.id, amount: 70_000, method: 'bank' }).expect(201)
      expect(full.body.sale).toMatchObject({ status: 'completed', outstanding: 0 })
      expect(full.body.payment).toMatchObject({ method: 'bank', customerId: c, amount: 70_000 })

      const row = await testDb.sale.findUniqueOrThrow({ where: { id: s.id } })
      expect([row.status, Number(row.outstanding), Number(row.debtPaid)]).toEqual(['completed', 0, 100_000])
      // Bank to'lovi kassaga tegmaydi
      expect(await cash()).toBe(30_000)
      const history = await api().get(`/api/v1/debts/payments?saleId=${s.id}`).set('Authorization', auth).expect(200)
      expect(history.body.total).toBe(2)
      expect(await testDb.auditEntry.count({ where: { action: 'debt.pay' } })).toBe(2)
    })

    it('I14: parallel ikki to‘lov ikki barobar yozilmaydi', async () => {
      const c = await seedClient(a.tenantId)
      const s = await creditSale(c)
      const results = await Promise.all([
        pay({ saleId: s.id, amount: 100_000, method: 'cash' }),
        pay({ saleId: s.id, amount: 100_000, method: 'cash' }),
      ])
      expect(results.map((r) => r.status).sort()).toEqual([201, 422])
      expect(await testDb.debtPayment.count()).toBe(1)
      expect(await cash()).toBe(100_000)
    })

    it('naqd to‘lov smenasiz — 423; bekor qilingan chek — qarz yo‘q; yo‘q chek — 422', async () => {
      const c = await seedClient(a.tenantId)
      const s = await creditSale(c)
      await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeShiftId: null } })
      expect((await pay({ saleId: s.id, amount: 1_000, method: 'cash' }).expect(423)).body.code).toBe('SHIFT_REQUIRED')
      // Bank — smenasiz ham mumkin
      await pay({ saleId: s.id, amount: 1_000, method: 'bank' }).expect(201)

      await testDb.sale.update({ where: { id: s.id }, data: { status: 'cancelled' } })
      expect((await pay({ saleId: s.id, amount: 1, method: 'bank' }).expect(422)).body.code).toBe('PAYMENT_EXCEEDS_DEBT')
      expect((await pay({ saleId: randomUUID(), amount: 1, method: 'bank' }).expect(422)).body.code).toBe('REFERENCE_NOT_FOUND')
    })

    it('qarz to‘langan chekni bekor qilib bo‘lmaydi (pul ikki marta qaytmasin)', async () => {
      const c = await seedClient(a.tenantId)
      const s = await creditSale(c)
      await pay({ saleId: s.id, amount: 10_000, method: 'cash' }).expect(201)
      const res = await api().post(`/api/v1/sales/${s.id}/cancel`).set('Authorization', auth).set('Idempotency-Key', randomUUID()).expect(409)
      expect(res.body).toMatchObject({ code: 'SALE_NOT_CANCELLABLE', errors: [{ meta: { reason: 'payments' } }] })
    })
  })

  describe('Qarzdorlar ro‘yxati (T-065)', () => {
    const daysAgo = (n: number) => {
      const d = new Date(`${businessDate()}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - n)
      return d.toISOString().slice(0, 10)
    }
    let seq = 0
    /**
     * Eski nasiya chek — bazaga bevosita: API orqali yaratib bo'lmaydi,
     * chunki muddati o'tgan qarz yangi nasiyani to'sadi (I16 — shu to'g'ri)
     */
    const seedDebt = async (customerId: string, date: string, total: bigint, termDays = 0) => {
      const due = new Date(`${date}T00:00:00Z`)
      due.setUTCDate(due.getUTCDate() + termDays)
      return testDb.sale.create({
        data: {
          tenantId: a.tenantId, number: `CHEK-${9000 + ++seq}`, customerId, subtotal: total, total,
          status: 'pending', date: new Date(`${date}T00:00:00Z`), dueDate: termDays ? due : null,
        },
      })
    }

    it('mijoz bo‘yicha guruhlanadi; eskirish va muddati o‘tgan filtri; jami', async () => {
      const ali = await seedClient(a.tenantId, { name: 'Ali', paymentTermDays: 7 })
      const vali = await seedClient(a.tenantId, { name: 'Vali' })
      await seedDebt(ali, daysAgo(90), 100_000n, 7)
      await seedDebt(ali, daysAgo(10), 200_000n, 7)
      await seedDebt(vali, daysAgo(40), 100_000n)

      const all = await api().get('/api/v1/debts').set('Authorization', auth).expect(200)
      expect(all.body).toMatchObject({ total: 2, summary: { debt: 400_000, overdue: 300_000, customers: 2, oldestDate: daysAgo(90) } })
      expect(all.body.items[0]).toMatchObject({
        customer: { id: ali, name: 'Ali' }, debt: 300_000, receipts: 2, oldestDate: daysAgo(90), overdue: true,
      })
      expect(all.body.items[1]).toMatchObject({ customer: { id: vali }, debt: 100_000, overdue: false })

      const ids = async (query: string) =>
        (await api().get(`/api/v1/debts${query}`).set('Authorization', auth).expect(200)).body.items.map(
          (i: { customer?: { id: string }; saleId?: string }) => i.customer?.id ?? i.saleId,
        )
      expect(await ids('?overdue=true')).toEqual([ali])
      expect(await ids('?aging=d60')).toEqual([vali])
      expect(await ids('?aging=d60plus')).toEqual([ali])
      expect(await ids('?q=val')).toEqual([vali])
    })

    it('cheklar ko‘rinishi: eski birinchi, yoshi va muddati bilan', async () => {
      const ali = await seedClient(a.tenantId, { name: 'Ali', paymentTermDays: 7 })
      const old = await seedDebt(ali, daysAgo(45), 100_000n, 7)
      const fresh = await seedDebt(ali, daysAgo(5), 100_000n, 7)
      const res = await api().get('/api/v1/debts?view=receipts').set('Authorization', auth).expect(200)
      expect(res.body.items.map((r: { saleId: string }) => r.saleId)).toEqual([old.id, fresh.id])
      expect(res.body.items[0]).toMatchObject({ number: old.number, ageDays: 45, overdue: true, outstanding: 100_000, customer: { name: 'Ali' } })
      expect(res.body.items[1]).toMatchObject({ ageDays: 5, overdue: false })
      const d30 = await api().get('/api/v1/debts?view=receipts&aging=d30').set('Authorization', auth).expect(200)
      expect(d30.body.items.map((r: { saleId: string }) => r.saleId)).toEqual([fresh.id])
    })

    it('byudjet: ro‘yxat + jami ≤ 2 so‘rov', async () => {
      const ali = await seedClient(a.tenantId)
      await creditSale(ali)
      const { queries, result } = await captureQueries(() => api().get('/api/v1/debts?overdue=true&aging=d30').set('Authorization', auth))
      expect(result.status).toBe(200)
      expect(queries.length, queries.join('\n')).toBeLessThanOrEqual(2)
    })

    it('`client_balances` RLS ostida: ko‘rinish boshqa do‘kon qarzini ko‘rsatmaydi', async () => {
      const b = await seedTenant('B do‘kon')
      const bClient = await seedClient(b.tenantId)
      await testDb.sale.create({
        data: {
          tenantId: b.tenantId, number: 'CHEK-1', subtotal: 5n, total: 5n, status: 'pending', customerId: bClient,
          date: new Date(),
        },
      })
      await creditSale(await seedClient(a.tenantId))
      // Ilova roli (crm_app), shartsiz so'rov — faqat A qatorlari
      const rows = await runWithContext({ requestId: 't', tenantId: a.tenantId }, () =>
        appDb.inTenantTransaction(a.tenantId, (tx) => tx.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id FROM client_balances`),
      )
      expect(rows.map((r) => r.tenant_id)).toEqual([a.tenantId])
    })
  })
})
