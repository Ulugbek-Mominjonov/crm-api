import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries } from './helpers/queries'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/** Cheklar ro'yxati va chek (T-056): filtrlar, qarz SQL'da, kursor, byudjet */
describe('Cheklar ro‘yxati (GET /sales)', () => {
  let app: INestApplication
  let a: Tenant
  let auth: string
  let p: string
  let client: string
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    app = await createTestApp()
    await truncateAll()
    a = await seedTenant('A do‘kon')
    auth = await bearer(app, a)
    await testDb.settings.update({
      where: { tenantId: a.tenantId },
      data: { taxEnabled: false, storeName: 'Qurilish Mollari', receiptPhone: '+998712000000' },
    })
    p = await seedProduct(a.tenantId, a.warehouseId, { qty: '1000' })
    client = await seedClient(a.tenantId, { name: 'Bahrom Qurilish' })
    await openShift(a.tenantId)

    const sell = async (key: string, body: Record<string, unknown>) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', auth)
        .set('Idempotency-Key', randomUUID())
        .send({ items: [{ productId: p, qty: 1 }], ...body })
        .expect(201)
      ids[key] = res.body.id
    }
    await sell('cash', { date: '2026-09-01', paid: { cash: 60_000, card: 0, transfer: 0 } })
    await sell('card', { date: '2026-09-02', paid: { cash: 0, card: 60_000, transfer: 0 } })
    await sell('debt', { date: '2026-09-03', customerId: client, paid: { cash: 20_000, card: 0, transfer: 0 } })
    await sell('cancelled', { date: '2026-09-03', paid: { cash: 60_000, card: 0, transfer: 0 } })
    await request(app.getHttpServer())
      .post(`/api/v1/sales/${ids.cancelled}/cancel`)
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .expect(200)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(() => {
    resetThrottle(app)
  })

  const list = (query = '') =>
    request(app.getHttpServer()).get(`/api/v1/sales${query}`).set('Authorization', auth).expect(200)
  const numbersOf = (body: { items: { id: string }[] }) => body.items.map((s) => Object.keys(ids).find((k) => ids[k] === s.id))

  it('sana bo‘yicha kamayish tartibida; qarz har chekda SQL’da hisoblangan', async () => {
    const res = await list()
    expect(numbersOf(res.body)).toEqual(['cancelled', 'debt', 'card', 'cash'])
    const debt = res.body.items.find((s: { id: string }) => s.id === ids.debt)
    expect(debt).toMatchObject({
      outstanding: 40_000, status: 'pending', customer: { id: client, name: 'Bahrom Qurilish' },
      seller: { id: a.employeeId, name: 'Test Admin' }, itemCount: 1,
    })
    expect(res.body.items.find((s: { id: string }) => s.id === ids.cancelled).outstanding).toBe(0)
  })

  it('filtrlar: davr, holat, mijoz, sotuvchi, to‘lov turi, qidiruv', async () => {
    expect(numbersOf((await list('?dateFrom=2026-09-02&dateTo=2026-09-02')).body)).toEqual(['card'])
    expect(numbersOf((await list('?status=cancelled')).body)).toEqual(['cancelled'])
    expect(numbersOf((await list(`?customerId=${client}`)).body)).toEqual(['debt'])
    expect((await list(`?sellerId=${a.employeeId}`)).body.items).toHaveLength(4)
    expect(numbersOf((await list('?payment=debt')).body)).toEqual(['debt'])
    expect(numbersOf((await list('?payment=card')).body)).toEqual(['card'])
    // To'lov usuli filtri — holatdan qat'i nazar (holat — `status` bilan)
    expect(numbersOf((await list('?payment=cash')).body)).toEqual(['cancelled', 'debt', 'cash'])
    expect(numbersOf((await list('?q=bahrom')).body)).toEqual(['debt'])
    expect(numbersOf((await list('?q=CHEK-1002')).body)).toEqual(['card'])
    expect((await list('?type=return')).body.items).toHaveLength(0)
  })

  it('kursorli sahifalash: takror va tushib qolish yo‘q', async () => {
    const first = await list('?limit=3')
    expect(first.body).toMatchObject({ hasMore: true })
    const second = await list(`?limit=3&cursor=${first.body.nextCursor}`)
    expect(second.body).toMatchObject({ hasMore: false, nextCursor: null })
    expect([...numbersOf(first.body), ...numbersOf(second.body)]).toEqual(['cancelled', 'debt', 'card', 'cash'])
  })

  it('byudjet: ro‘yxat ≤ 2 so‘rov', async () => {
    const { queries, result } = await captureQueries(() =>
      request(app.getHttpServer()).get('/api/v1/sales?payment=debt&q=bahrom').set('Authorization', auth),
    )
    expect(result.status).toBe(200)
    expect(queries.length, queries.join('\n')).toBeLessThanOrEqual(2)
  })

  it('chek: do‘kon rekvizitlari va tomonlar bilan; PDF — 80 mm termal chek', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/sales/${ids.debt}/receipt`)
      .set('Authorization', auth)
      .expect(200)
    expect(res.body).toMatchObject({
      store: { name: 'Qurilish Mollari', phone: '+998712000000' },
      sale: { id: ids.debt, number: 'CHEK-1003', outstanding: 40_000 },
      customer: { name: 'Bahrom Qurilish' },
      seller: { name: 'Test Admin' },
    })
    const pdf = await request(app.getHttpServer())
      .get(`/api/v1/sales/${ids.debt}/receipt?format=pdf`)
      .set('Authorization', auth)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => done(null, Buffer.concat(chunks)))
      })
      .expect(200)
    expect(pdf.headers['content-type']).toBe('application/pdf')
    expect(pdf.headers['content-disposition']).toBe('inline; filename="CHEK-1003.pdf"')
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-')
    // Sotuvchi ham chop etadi (tannarx PDF'da umuman yo'q)
    await request(app.getHttpServer())
      .get(`/api/v1/sales/${ids.debt}/receipt?format=pdf`)
      .set('Authorization', await bearer(app, a, 'sotuvchi'))
      .expect(200)
  })

  it('boshqa do‘kon cheki — 404; omborchi ro‘yxatni ko‘radi', async () => {
    const b = await seedTenant('B do‘kon')
    await request(app.getHttpServer()).get(`/api/v1/sales/${ids.cash}`).set('Authorization', await bearer(app, b)).expect(404)
    const other = await request(app.getHttpServer()).get('/api/v1/sales').set('Authorization', await bearer(app, b)).expect(200)
    expect(other.body.items).toHaveLength(0)
    await request(app.getHttpServer()).get('/api/v1/sales').set('Authorization', await bearer(app, a, 'omborchi')).expect(200)
  })
})
