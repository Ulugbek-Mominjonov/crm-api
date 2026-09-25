import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/** Bekor qilish (T-055): I24, I17, I13, kassa, qaytarish bilan munosabat */
describe('Bekor qilish (POST /sales/:id/cancel)', () => {
  let app: INestApplication
  let a: Tenant
  let auth: string
  let p: string
  let w2: string

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
    p = await seedProduct(a.tenantId, a.warehouseId, { qty: '60' })
    w2 = (await testDb.warehouse.create({ data: { tenantId: a.tenantId, name: 'Sklad' } })).id
    await testDb.productStock.create({ data: { tenantId: a.tenantId, productId: p, warehouseId: w2, qty: '40' } })
    await openShift(a.tenantId, 1_000_000n)
  })

  const post = (path: string, body: Record<string, unknown> = {}, token = auth) =>
    request(app.getHttpServer())
      .post(`/api/v1/sales${path}`)
      .set('Authorization', token)
      .set('Idempotency-Key', randomUUID())
      .send(body)
  const cancel = (id: string, token = auth) => post(`/${id}/cancel`, {}, token)
  const qtyAt = async (warehouseId: string) =>
    Number((await testDb.productStock.findUnique({ where: { productId_warehouseId: { productId: p, warehouseId } } }))?.qty ?? 0)
  const cash = async () => Number((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).cashBalance)
  const bonusOf = async (id: string) => Number((await testDb.client.findUniqueOrThrow({ where: { id } })).bonusPoints)

  it('I24: tovar AYNAN sotilgan omborga qaytadi — kassir omborni almashtirgan bo‘lsa ham', async () => {
    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeWarehouseId: w2 } })
    const sale = (await post('', { items: [{ productId: p, qty: 15 }], paid: { cash: 900_000, card: 0, transfer: 0 } }).expect(201)).body
    expect(sale.warehouseId).toBe(w2)
    expect(await qtyAt(w2)).toBe(25)

    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeWarehouseId: a.warehouseId } })
    const res = await cancel(sale.id).expect(200)
    expect(res.body).toMatchObject({ status: 'cancelled', outstanding: 0 })
    expect(res.body.cancelledAt).not.toBeNull()
    expect(await qtyAt(w2)).toBe(40)
    expect(await qtyAt(a.warehouseId)).toBe(60)
    const back = await testDb.stockMovement.findFirstOrThrow({ where: { refId: sale.id, type: 'adjustment' } })
    expect(back).toMatchObject({ warehouseId: w2, note: `Bekor qilindi (${sale.number})` })
  })

  it('naqd kassadan qaytariladi; ikkinchi marta — 409 SALE_ALREADY_CANCELLED', async () => {
    const before = await cash()
    const sale = (await post('', { items: [{ productId: p, qty: 1 }], paid: { cash: 100_000, card: 0, transfer: 0 } }).expect(201)).body
    expect(await cash()).toBe(before + 60_000)
    await cancel(sale.id).expect(200)
    expect(await cash()).toBe(before)
    const shift = await testDb.cashShift.findFirstOrThrow({ where: { tenantId: a.tenantId } })
    expect([Number(shift.cashIn), Number(shift.cashOut)]).toEqual([60_000, 60_000])
    expect((await cancel(sale.id).expect(409)).body.code).toBe('SALE_ALREADY_CANCELLED')
    expect(await qtyAt(a.warehouseId)).toBe(60)
    expect(await testDb.auditEntry.count({ where: { action: 'sale.cancel' } })).toBe(1)
  })

  it('I17: berilgan bonus qaytarib olinadi, ishlatilgani qaytadi; ball manfiy bo‘lmaydi', async () => {
    const c = await seedClient(a.tenantId, { bonusPoints: 1_000n })
    const sale = (await post('', {
      customerId: c, bonusUsed: 1_000, items: [{ productId: p, qty: 10 }], paid: { cash: 599_000, card: 0, transfer: 0 },
    }).expect(201)).body
    // 600 000 − 1 000 = 599 000; bonus 1% = 5 990
    expect(await bonusOf(c)).toBe(5_990)
    await cancel(sale.id).expect(200)
    expect(await bonusOf(c)).toBe(1_000)

    // Berilgan ball sarflangan bo'lsa — 0 gacha, manfiy emas
    const second = (await post('', { customerId: c, items: [{ productId: p, qty: 10 }], paid: { cash: 600_000, card: 0, transfer: 0 } }).expect(201)).body
    await testDb.client.update({ where: { id: c }, data: { bonusPoints: 0n } })
    await cancel(second.id).expect(200)
    expect(await bonusOf(c)).toBe(0)
  })

  it('I13: bekor qilingan nasiya chekda qarz yo‘q', async () => {
    const c = await seedClient(a.tenantId)
    const sale = (await post('', { customerId: c, items: [{ productId: p, qty: 1 }], paid: { cash: 0, card: 0, transfer: 0 } }).expect(201)).body
    expect(sale.outstanding).toBe(60_000)
    const res = await cancel(sale.id).expect(200)
    expect(res.body.outstanding).toBe(0)
  })

  it('qaytarishi bor chek bekor qilinmaydi; avval qaytarish bekor qilinadi', async () => {
    const sale = (await post('', { items: [{ productId: p, qty: 2 }], paid: { cash: 120_000, card: 0, transfer: 0 } }).expect(201)).body
    const ret = (await post(`/${sale.id}/return`, { items: [{ saleItemId: sale.items[0].id, qty: 1 }], reason: 'x' }).expect(201)).body
    const blocked = await cancel(sale.id).expect(409)
    expect(blocked.body).toMatchObject({ code: 'SALE_NOT_CANCELLABLE', errors: [{ meta: { reason: 'returns', returns: 1 } }] })

    const before = await cash()
    await cancel(ret.id).expect(200)
    // Qaytarish bekor: tovar yana chiqadi, pul kassaga qaytadi
    expect(await qtyAt(a.warehouseId)).toBe(58)
    expect(await cash()).toBe(before + 60_000)
    await cancel(sale.id).expect(200)
    expect(await qtyAt(a.warehouseId)).toBe(60)
  })

  it('nasiya chek qarzini yopgan qaytarish bekor qilinsa — qarz qayta ochiladi', async () => {
    const c = await seedClient(a.tenantId)
    const sale = (await post('', { customerId: c, items: [{ productId: p, qty: 2 }], paid: { cash: 0, card: 0, transfer: 0 } }).expect(201)).body
    const ret = (await post(`/${sale.id}/return`, { items: [{ saleItemId: sale.items[0].id, qty: 2 }], reason: 'x' }).expect(201)).body
    expect(ret).toMatchObject({ debtPaid: 120_000, paid: { cash: 0 } })
    expect((await testDb.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe('completed')

    await cancel(ret.id).expect(200)
    const reopened = await testDb.sale.findUniqueOrThrow({ where: { id: sale.id } })
    expect(reopened.status).toBe('pending')
    expect(Number(reopened.outstanding)).toBe(120_000)
  })

  it('yetkazish ham bekor bo‘ladi; sotuvchi bekor qila olmaydi — 403', async () => {
    const sale = (await post('', {
      items: [{ productId: p, qty: 1 }],
      delivery: { address: 'Chilonzor', phone: '+998901234567', fee: 10_000 },
      paid: { cash: 70_000, card: 0, transfer: 0 },
    }).expect(201)).body
    await cancel(sale.id, await bearer(app, a, 'sotuvchi')).expect(403)
    await cancel(sale.id).expect(200)
    expect((await testDb.delivery.findUniqueOrThrow({ where: { saleId: sale.id } })).status).toBe('cancelled')
  })
})
