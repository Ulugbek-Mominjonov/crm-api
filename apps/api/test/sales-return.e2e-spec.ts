import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/** Qaytarish (T-054): I6, I7, miqdor chegarasi, kassa va nasiya chek */
describe('Qaytarish (POST /sales/:id/return)', () => {
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
    await openShift(a.tenantId, 500_000n)
  })

  const post = (path: string, body: Record<string, unknown>, token = auth) =>
    request(app.getHttpServer())
      .post(`/api/v1/sales${path}`)
      .set('Authorization', token)
      .set('Idempotency-Key', randomUUID())
      .send(body)
  const sell = async (qty: number, extra: Record<string, unknown> = {}) =>
    (await post('', { items: [{ productId: p, qty, price: 100_000 }], paid: { cash: qty * 112_000, card: 0, transfer: 0 }, ...extra }).expect(201)).body
  const giveBack = (saleId: string, items: { saleItemId: string; qty: number }[]) =>
    post(`/${saleId}/return`, { items, reason: 'Sifatsiz' })
  const qtyAt = async (warehouseId: string) =>
    Number((await testDb.productStock.findUnique({ where: { productId_warehouseId: { productId: p, warehouseId } } }))?.qty ?? 0)
  const cash = async () => Number((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).cashBalance)

  it('I6: mijoz to‘lagan QQS to‘liq qaytadi; tovar omborga, pul kassadan', async () => {
    const sale = await sell(1)
    expect(sale).toMatchObject({ tax: 12_000, total: 112_000 })
    const before = await cash()

    const res = await giveBack(sale.id, [{ saleItemId: sale.items[0].id, qty: 1 }]).expect(201)
    expect(res.body).toMatchObject({
      number: 'QAYT-1001', type: 'return', status: 'completed', relatedSaleId: sale.id,
      subtotal: 100_000, taxRate: 12, tax: 12_000, total: 112_000, paid: { cash: 112_000 }, outstanding: 0,
    })
    expect(res.body.items[0]).toMatchObject({ returnOfId: sale.items[0].id, qty: 1, baseQty: 1 })
    expect(await qtyAt(a.warehouseId)).toBe(10)
    expect(await cash()).toBe(before - 112_000)
    const shift = await testDb.cashShift.findFirstOrThrow({ where: { tenantId: a.tenantId } })
    expect(Number(shift.cashOut)).toBe(112_000)
    const move = await testDb.stockMovement.findFirstOrThrow({ where: { refId: res.body.id } })
    expect(move).toMatchObject({ type: 'return', note: 'QAYT-1001' })
  })

  it('I6: qisman qaytarishda QQS mutanosib (4 tadan 1 tasi)', async () => {
    const sale = await sell(4)
    const res = await giveBack(sale.id, [{ saleItemId: sale.items[0].id, qty: 1 }]).expect(201)
    expect(res.body.total).toBe(112_000)
  })

  it('I6: QQS foizi keyin o‘zgarsa ham eski chek bo‘yicha qaytadi', async () => {
    const sale = await sell(1)
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxRate: 15 } })
    const res = await giveBack(sale.id, [{ saleItemId: sale.items[0].id, qty: 1 }]).expect(201)
    expect(res.body).toMatchObject({ taxRate: 12, total: 112_000 })
  })

  it('I7: qoldig‘i 0 bo‘lgan tovar qaytariladi', async () => {
    const sale = await sell(10)
    expect(await qtyAt(a.warehouseId)).toBe(0)
    await giveBack(sale.id, [{ saleItemId: sale.items[0].id, qty: 1 }]).expect(201)
    expect(await qtyAt(a.warehouseId)).toBe(1)
  })

  it('qaytarish miqdori asl chekdan oshmaydi — oldingi qaytarishlar bilan birga', async () => {
    const sale = await sell(2)
    const item = sale.items[0].id
    await giveBack(sale.id, [{ saleItemId: item, qty: 1.5 }]).expect(201)
    const res = await giveBack(sale.id, [{ saleItemId: item, qty: 1 }]).expect(422)
    expect(res.body.code).toBe('RETURN_EXCEEDS_SOLD')
    expect(res.body.errors[0].meta).toEqual({ sold: 2, returned: 1.5, requested: 1 })
    // Qolgani — aynan qolgan summa (ulushlar yig'indisi chek summasiga teng)
    const rest = await giveBack(sale.id, [{ saleItemId: item, qty: 0.5 }]).expect(201)
    const returns = await testDb.sale.findMany({ where: { relatedSaleId: sale.id }, select: { total: true } })
    expect(returns.reduce((s, r) => s + Number(r.total), 0)).toBe(sale.total)
    expect(rest.body.number).toBe('QAYT-1002')
  })

  it('nasiya chek: qaytgan tovar avval qarzni yopadi, naqd berilmaydi', async () => {
    const c = await seedClient(a.tenantId)
    const sale = await sell(2, { customerId: c, paid: { cash: 100_000, card: 0, transfer: 0 } }) // qarz 124 000
    expect(sale.outstanding).toBe(124_000)
    const before = await cash()

    const res = await giveBack(sale.id, [{ saleItemId: sale.items[0].id, qty: 1 }]).expect(201)
    expect(res.body).toMatchObject({ total: 112_000, paid: { cash: 0 }, debtPaid: 112_000 })
    expect(await cash()).toBe(before)
    const original = await request(app.getHttpServer()).get(`/api/v1/sales/${sale.id}`).set('Authorization', auth).expect(200)
    expect(original.body).toMatchObject({ outstanding: 12_000, status: 'pending' })

    // Ikkinchisi: qarz 12 000 yopiladi, qolgan 100 000 — naqd
    const second = await giveBack(sale.id, [{ saleItemId: sale.items[0].id, qty: 1 }]).expect(201)
    expect(second.body).toMatchObject({ paid: { cash: 100_000 }, debtPaid: 12_000 })
    expect(await cash()).toBe(before - 100_000)
    const closed = await testDb.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(closed.status).toBe('completed')
    expect(Number(closed.outstanding)).toBe(0)
  })

  it('bekor qilingan chek — 409; qaytarish hujjatidan qaytarib bo‘lmaydi — 422; begona chek — 404', async () => {
    const sale = await sell(2)
    const ret = await giveBack(sale.id, [{ saleItemId: sale.items[0].id, qty: 1 }]).expect(201)
    const again = await giveBack(ret.body.id, [{ saleItemId: ret.body.items[0].id, qty: 1 }]).expect(422)
    expect(again.body.code).toBe('SALE_NOT_RETURNABLE')

    const other = await sell(1)
    await testDb.sale.update({ where: { id: other.id }, data: { status: 'cancelled' } })
    expect((await giveBack(other.id, [{ saleItemId: other.items[0].id, qty: 1 }]).expect(409)).body.code).toBe('SALE_ALREADY_CANCELLED')

    const b = await seedTenant('B do‘kon')
    await post(`/${sale.id}/return`, { items: [{ saleItemId: sale.items[0].id, qty: 1 }], reason: 'x' }, await bearer(app, b)).expect(404)
  })

  it('bir qator ikki marta — 400; sabab majburiy — 400', async () => {
    const sale = await sell(2)
    const item = { saleItemId: sale.items[0].id, qty: 1 }
    await giveBack(sale.id, [item, item]).expect(400)
    await post(`/${sale.id}/return`, { items: [item] }).expect(400)
  })

  it('tovar ASL omborga qaytadi — joriy ombor o‘zgargan bo‘lsa ham', async () => {
    const sale = await sell(1)
    const sklad = (await testDb.warehouse.create({ data: { tenantId: a.tenantId, name: 'Sklad' } })).id
    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeWarehouseId: sklad } })
    await giveBack(sale.id, [{ saleItemId: sale.items[0].id, qty: 1 }]).expect(201)
    expect(await qtyAt(a.warehouseId)).toBe(10)
    expect(await qtyAt(sklad)).toBe(0)
  })
})
