import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries } from './helpers/queries'

/**
 * X/Z hisobot (T-061): smenadagi barcha pul hujjatlari BITTA agregat
 * so'rovda; nasiya cheklar tushumda (I4); hisobiy qoldiq kassa bilan mos.
 */
describe('Smena hisoboti (GET /cash/shifts/:id/report)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string

  beforeAll(async () => {
    app = await createTestApp()
    await truncateAll()
    a = await seedTenant('A do‘kon')
    auth = await bearer(app, a)
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false, loyaltyEnabled: false } })
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(() => {
    resetThrottle(app)
  })

  const post = async (path: string, body: Record<string, unknown> = {}, status = 201) =>
    (await request(app.getHttpServer())
      .post(`/api/v1/${path}`)
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(status)).body

  it('smenadagi barcha amallar hisobotda, qoldiq kassa balansiga teng', async () => {
    const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '100', price: 100_000n })
    const c = await seedClient(a.tenantId)
    const shift = await post('cash/shifts/open', { openingBalance: 100_000 })
    const sell = (body: Record<string, unknown>) => post('sales', { items: [{ productId: p, qty: 1 }], ...body })

    await sell({ paid: { cash: 150_000, card: 0, transfer: 0 } })
    const card = await sell({ paid: { cash: 0, card: 100_000, transfer: 0 } })
    const credit = await sell({ customerId: c, paid: { cash: 30_000, card: 0, transfer: 0 } })
    const cancelled = await sell({ paid: { cash: 100_000, card: 0, transfer: 0 } })
    await post(`sales/${cancelled.id}/cancel`, {}, 200)
    await post(`sales/${card.id}/return`, { items: [{ saleItemId: card.items[0].id, qty: 1 }], reason: 'Sifatsiz' })
    await post('cash/movements', { direction: 'in', amount: 20_000, reason: 'Maydalash' })
    await post('cash/movements', { direction: 'out', amount: 5_000, reason: 'Egasi' })
    await post('expenses', { category: 'transport', amount: 10_000, method: 'cash' })
    await post('debts/payments', { saleId: credit.id, amount: 20_000, method: 'cash' })
    await post('debts/payments', { saleId: credit.id, amount: 10_000, method: 'bank' })

    const { result, queries } = await captureQueries(() =>
      request(app.getHttpServer()).get(`/api/v1/cash/shifts/${shift.id}/report`).set('Authorization', auth),
    )
    expect(result.status).toBe(200)
    expect(queries).toHaveLength(1)
    expect(result.body).toMatchObject({
      sales: { count: 3, total: 300_000, cash: 130_000, card: 100_000, transfer: 0, credit: 70_000, cancelled: 1 },
      returns: { count: 1, total: 100_000, cash: 100_000 },
      manualIn: 20_000,
      manualOut: 5_000,
      expenses: 10_000,
      debtPaymentsCash: 20_000,
      debtPaymentsBank: 10_000,
      supplierPayments: 0,
      expectedBalance: 155_000,
    })
    // Smena kirim/chiqimi va ochilish qoldig'i hisobiy qoldiqni aynan beradi
    const { cashIn, cashOut, openingBalance } = result.body.shift
    expect(openingBalance + cashIn - cashOut).toBe(155_000)
    const state = await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })
    expect(Number(state.cashBalance)).toBe(155_000)

    // Yopilgandan keyin hisobot yopish paytidagi qoldiq bilan
    await post('cash/shifts/close', { countedBalance: 150_000 }, 200)
    const closed = await request(app.getHttpServer()).get(`/api/v1/cash/shifts/${shift.id}/report`).set('Authorization', auth).expect(200)
    expect(closed.body).toMatchObject({ expectedBalance: 155_000, shift: { status: 'closed', difference: -5_000, cashierName: 'Test Admin' } })
  })

  it('boshqa do‘kon smenasi — 404', async () => {
    const b = await seedTenant('B do‘kon')
    const foreign = await testDb.cashShift.create({ data: { tenantId: b.tenantId, openedAt: new Date(), openingBalance: 0n } })
    await request(app.getHttpServer()).get(`/api/v1/cash/shifts/${foreign.id}/report`).set('Authorization', auth).expect(404)
  })
})
