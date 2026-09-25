import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/** Takliflar (T-057) va sotuvga aylantirish (T-058, I20) */
describe('Takliflar (/quotes)', () => {
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
    p = await seedProduct(a.tenantId, a.warehouseId, { qty: '10' })
    await openShift(a.tenantId)
  })

  const api = () => request(app.getHttpServer())
  const createQuote = async (body: Record<string, unknown> = {}) =>
    (await api().post('/api/v1/quotes').set('Authorization', auth).send({ items: [{ productId: p, qty: 5 }], ...body }).expect(201)).body
  const convert = (id: string, method: string, token = auth) =>
    api().post(`/api/v1/quotes/${id}/convert`).set('Authorization', token).set('Idempotency-Key', randomUUID()).send({ method })
  const quoteRow = (id: string) => testDb.quote.findUniqueOrThrow({ where: { id } })

  describe('CRUD va holat (T-057)', () => {
    it('yaratish: raqam, server summasi, narx snapshot; qoldiqqa tegmaydi', async () => {
      const q = await createQuote({ discount: 10_000, validUntil: '2999-01-01', note: 'Obyekt uchun' })
      // 5 × 60 000 = 300 000 − 10 000 = 290 000; QQS 12% = 34 800
      expect(q).toMatchObject({
        number: 'TKLF-1001', status: 'draft', subtotal: 300_000, discount: 10_000, taxRate: 12, tax: 34_800,
        total: 324_800, expired: false, saleId: null, sellerId: a.employeeId,
      })
      expect(q.items[0]).toMatchObject({ productId: p, qty: 5, price: 60_000, cost: 45_000 })
      expect(Number((await testDb.productStock.findFirstOrThrow({ where: { productId: p } })).qty)).toBe(10)
    })

    it('narx darajasi mijoz guruhidan: ulgurji mijozga ulgurji narx', async () => {
      const wholesale = await seedClient(a.tenantId)
      await testDb.client.update({ where: { id: wholesale }, data: { group: 'wholesale' } })
      const q = await createQuote({ customerId: wholesale })
      expect(q.items[0].price).toBe(55_000)
    })

    it('tahrir: holat, qatorlar almashtiriladi va qayta narxlanadi', async () => {
      const q = await createQuote()
      const sent = await api().patch(`/api/v1/quotes/${q.id}`).set('Authorization', auth).send({ status: 'sent' }).expect(200)
      expect(sent.body).toMatchObject({ status: 'sent', total: 336_000 })

      const edited = await api()
        .patch(`/api/v1/quotes/${q.id}`)
        .set('Authorization', auth)
        .send({ items: [{ productId: p, qty: 1, price: 50_000 }], discount: 0 })
        .expect(200)
      expect(edited.body).toMatchObject({ subtotal: 50_000, total: 56_000 })
      expect(edited.body.items).toHaveLength(1)
      expect(await testDb.quoteItem.count({ where: { quoteId: q.id } })).toBe(1)

      // `converted` — faqat aylantirish orqali
      await api().patch(`/api/v1/quotes/${q.id}`).set('Authorization', auth).send({ status: 'converted' }).expect(400)
    })

    it('amal muddati o‘tgani ko‘rsatiladi (yakunlanmagan taklifda)', async () => {
      const old = await createQuote({ validUntil: '2020-01-01' })
      expect(old.expired).toBe(true)
      const rejected = await api().patch(`/api/v1/quotes/${old.id}`).set('Authorization', auth).send({ status: 'rejected' }).expect(200)
      expect(rejected.body.expired).toBe(false)
    })

    it('ro‘yxat: holat va qidiruv filtri, jami soni', async () => {
      const c = await seedClient(a.tenantId, { name: 'Bahrom Qurilish' })
      await createQuote()
      await createQuote({ customerId: c })
      const all = await api().get('/api/v1/quotes').set('Authorization', auth).expect(200)
      expect(all.body).toMatchObject({ total: 2, page: 1 })
      const found = await api().get('/api/v1/quotes?q=bahrom').set('Authorization', auth).expect(200)
      expect(found.body.items.map((q: { customerId: string }) => q.customerId)).toEqual([c])
      // Mijoz va sotuvchi nomi ro'yxatning o'zida (alohida so'rovsiz)
      expect(found.body.items[0]).toMatchObject({ customer: { id: c, name: 'Bahrom Qurilish' }, seller: { id: a.employeeId, name: 'Test Admin' } })
      const drafts = await api().get('/api/v1/quotes?status=sent').set('Authorization', auth).expect(200)
      expect(drafts.body.total).toBe(0)
    })

    it('muddati o‘tgan va sana filtri; xulosa — jami, qabul qilingan, kutilayotgan', async () => {
      const old = await createQuote({ validUntil: '2020-01-01' })
      const sent = await createQuote({ validUntil: '2020-01-01' })
      await api().patch(`/api/v1/quotes/${sent.id}`).set('Authorization', auth).send({ status: 'sent' }).expect(200)
      const accepted = await createQuote()
      await api().patch(`/api/v1/quotes/${accepted.id}`).set('Authorization', auth).send({ status: 'accepted' }).expect(200)
      const rejected = await createQuote({ validUntil: '2020-01-01' })
      await api().patch(`/api/v1/quotes/${rejected.id}`).set('Authorization', auth).send({ status: 'rejected' }).expect(200)

      const ids = async (query: string) =>
        (await api().get(`/api/v1/quotes?${query}`).set('Authorization', auth).expect(200)).body.items.map((q: { id: string }) => q.id).sort()
      expect(await ids('expired=true')).toEqual([old.id, sent.id].sort())
      expect(await ids('dateTo=2020-01-01')).toEqual([])
      expect(await ids(`dateFrom=${old.date}&dateTo=${old.date}`)).toHaveLength(4)

      const summary = await api().get('/api/v1/quotes/summary').set('Authorization', auth).expect(200)
      expect(summary.body).toEqual({ total: old.total * 4, accepted: old.total, pending: old.total })
    })

    it('o‘chirish yumshoq, undo tiklaydi; omborchida takliflar huquqi yo‘q', async () => {
      const q = await createQuote()
      await api().delete(`/api/v1/quotes/${q.id}`).set('Authorization', auth).expect(204)
      await api().get(`/api/v1/quotes/${q.id}`).set('Authorization', auth).expect(404)
      expect((await api().post(`/api/v1/quotes/${q.id}/restore`).set('Authorization', auth).expect(200)).body).toMatchObject({ id: q.id, status: 'draft' })
      await api().post(`/api/v1/quotes/${q.id}/restore`).set('Authorization', auth).expect(404)
      await api().get('/api/v1/quotes').set('Authorization', await bearer(app, a, 'omborchi')).expect(403)
    })
  })

  describe('Sotuvga aylantirish (T-058, I20)', () => {
    it('tanlangan to‘lov usuli qo‘llanadi — avtomatik "naqd" emas', async () => {
      const q = await createQuote()
      const res = await convert(q.id, 'card').expect(201)
      expect(res.body).toMatchObject({ total: q.total, paid: { cash: 0, card: q.total, transfer: 0 }, status: 'completed' })
      expect(await quoteRow(q.id)).toMatchObject({ status: 'converted', saleId: res.body.id })
      // Karta — kassa yashigiga tushmaydi
      expect(Number((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).cashBalance)).toBe(0)
      expect(Number((await testDb.productStock.findFirstOrThrow({ where: { productId: p } })).qty)).toBe(5)
    })

    it('nasiyaga aylantirishda qarz qoladi; mijozsiz — 422', async () => {
      const noCustomer = await createQuote()
      expect((await convert(noCustomer.id, 'debt').expect(422)).body.code).toBe('CREDIT_REQUIRES_CUSTOMER')
      expect((await quoteRow(noCustomer.id)).status).toBe('draft')

      const c = await seedClient(a.tenantId)
      const q = await createQuote({ customerId: c })
      const res = await convert(q.id, 'debt').expect(201)
      expect(res.body).toMatchObject({ status: 'pending', outstanding: q.total, customerId: c })
    })

    it('qoldiq yetmasa aylantirilmaydi — 422 QUOTE_STOCK_SHORT', async () => {
      const q = await createQuote({ items: [{ productId: p, qty: 11 }] })
      const res = await convert(q.id, 'cash').expect(422)
      expect(res.body).toMatchObject({ code: 'QUOTE_STOCK_SHORT', errors: [{ code: 'QUOTE_STOCK_SHORT', meta: { available: 10, requested: 11 } }] })
      expect((await quoteRow(q.id)).status).toBe('draft')
      expect(await testDb.sale.count()).toBe(0)
    })

    it('ikki marta aylantirib bo‘lmaydi — parallel ham; aylantirilgan taklif tahrirlanmaydi', async () => {
      const q = await createQuote({ items: [{ productId: p, qty: 1 }] })
      const results = await Promise.all([convert(q.id, 'cash'), convert(q.id, 'cash')])
      expect(results.map((r) => r.status).sort()).toEqual([201, 409])
      expect(results.find((r) => r.status === 409)!.body.code).toBe('QUOTE_ALREADY_CONVERTED')
      expect(await testDb.sale.count()).toBe(1)
      await api().patch(`/api/v1/quotes/${q.id}`).set('Authorization', auth).send({ note: 'x' }).expect(409)
      await api().delete(`/api/v1/quotes/${q.id}`).set('Authorization', auth).expect(409)
    })

    it('QQS taklifdagi foiz bo‘yicha; narx darajasi mijoz guruhidan', async () => {
      const c = await seedClient(a.tenantId)
      await testDb.client.update({ where: { id: c }, data: { group: 'vip' } })
      const q = await createQuote({ customerId: c, items: [{ productId: p, qty: 1 }] })
      await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxRate: 15 } })
      const res = await convert(q.id, 'transfer').expect(201)
      expect(res.body).toMatchObject({ taxRate: 12, total: q.total, priceTier: 'wholesale', paid: { transfer: q.total } })
    })
  })
})
