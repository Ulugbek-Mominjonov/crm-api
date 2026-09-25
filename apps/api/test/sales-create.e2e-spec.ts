import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/**
 * Sotuv yaratish (T-053): 03-invariants I3, I5, I8, I12, I13, I15, I16,
 * I17, I23 — HTTP orqali, ilova roli (`crm_app`, RLS) bilan.
 * Sozlama sukuti: QQS 12%, bonus 1%, chegirma chegarasi 100%.
 */
describe('Sotuv yaratish (POST /sales)', () => {
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
    p = await seedProduct(a.tenantId, a.warehouseId, { qty: '100' })
    await openShift(a.tenantId, 50_000n)
  })

  const sale = (body: Record<string, unknown>, token = auth, key = randomUUID()) =>
    request(app.getHttpServer()).post('/api/v1/sales').set('Authorization', token).set('Idempotency-Key', key).send(body)
  const cashOnly = (cash: number) => ({ cash, card: 0, transfer: 0 })
  const qtyAt = async (productId: string, warehouseId: string) =>
    Number((await testDb.productStock.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } }))?.qty ?? 0)
  const register = () => testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })
  const bonusOf = async (id: string) => Number((await testDb.client.findUniqueOrThrow({ where: { id } })).bonusPoints)

  it('chek: server summasi, qaytim, ombor, kassa, jurnal va audit — bitta amalda', async () => {
    const res = await sale({ items: [{ productId: p, qty: 2 }], paid: cashOnly(150_000) }).expect(201)

    // 2 × 60 000 = 120 000; QQS 12% = 14 400
    expect(res.body).toMatchObject({
      number: 'CHEK-1001',
      type: 'sale',
      status: 'completed',
      subtotal: 120_000,
      tax: 14_400,
      total: 134_400,
      paid: { cash: 150_000, card: 0, transfer: 0 },
      change: 15_600,
      outstanding: 0,
      sellerId: a.employeeId,
      warehouseId: a.warehouseId,
    })
    expect(res.body.items).toEqual([
      expect.objectContaining({ productId: p, unit: 'qop', qty: 2, baseQty: 2, price: 60_000, cost: 45_000 }),
    ])

    expect(await qtyAt(p, a.warehouseId)).toBe(98)
    const [move] = await testDb.stockMovement.findMany({ where: { productId: p } })
    expect(move).toMatchObject({ type: 'sale', refId: res.body.id, note: 'CHEK-1001' })
    expect(Number(move!.qty)).toBe(-2)
    // Kassaga BERILGAN emas, QOLGAN naqd tushadi (150 000 − 15 600)
    expect(Number((await register()).cashBalance)).toBe(50_000 + 134_400)
    const shift = await testDb.cashShift.findFirstOrThrow({ where: { tenantId: a.tenantId } })
    expect(Number(shift.cashIn)).toBe(134_400)
    expect(await testDb.auditEntry.count({ where: { action: 'sale.create', entityId: res.body.id } })).toBe(1)

    // Javob bazadagi chek bilan aynan bir xil
    const again = await request(app.getHttpServer()).get(`/api/v1/sales/${res.body.id}`).set('Authorization', auth).expect(200)
    expect(again.body).toEqual(res.body)
  })

  it('I8: ochiq smenasiz sotuv — 423 SHIFT_REQUIRED, hech narsa yozilmaydi', async () => {
    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeShiftId: null } })
    const res = await sale({ items: [{ productId: p, qty: 1 }], paid: cashOnly(67_200) }).expect(423)
    expect(res.body.code).toBe('SHIFT_REQUIRED')
    expect(await testDb.sale.count()).toBe(0)
    expect(await qtyAt(p, a.warehouseId)).toBe(100)
  })

  it('I3: parallel ikki sotuv oxirgi tovarni ikki marta sota olmaydi', async () => {
    const last = await seedProduct(a.tenantId, a.warehouseId, { sku: 'LAST', qty: '5' })
    const results = await Promise.all([
      sale({ items: [{ productId: last, qty: 5 }], paid: cashOnly(336_000) }),
      sale({ items: [{ productId: last, qty: 5 }], paid: cashOnly(336_000) }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([201, 422])
    expect(results.find((r) => r.status === 422)!.body.code).toBe('STOCK_INSUFFICIENT')
    expect(await qtyAt(last, a.warehouseId)).toBe(0)
    expect(await testDb.sale.count()).toBe(1)
  })

  it('I3: jami yetarli, lekin tanlangan omborda yo‘q — rad etiladi', async () => {
    const sklad = (await testDb.warehouse.create({ data: { tenantId: a.tenantId, name: 'Sklad' } })).id
    const res = await sale({ warehouseId: sklad, items: [{ productId: p, qty: 10 }], paid: cashOnly(672_000) }).expect(422)
    expect(res.body.code).toBe('STOCK_INSUFFICIENT')
    expect(res.body.errors[0]).toMatchObject({ field: 'items[0].qty', meta: { warehouseId: sklad, available: 0, requested: 10 } })
  })

  it('I5 + I13: yetkazish narxi chek summasi va qarz ichida, yetkazish yozuvi yaratiladi', async () => {
    const c = await seedClient(a.tenantId)
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    const res = await sale({
      customerId: c,
      items: [{ productId: p, qty: 1, price: 100_000 }],
      delivery: { address: 'Chilonzor 7', phone: '+998901234567', fee: 15_000 },
      paid: cashOnly(100_000),
    }).expect(201)

    expect(res.body).toMatchObject({ total: 115_000, deliveryFee: 15_000, outstanding: 15_000, status: 'pending' })
    const delivery = await testDb.delivery.findUniqueOrThrow({ where: { saleId: res.body.id } })
    expect(delivery).toMatchObject({ address: 'Chilonzor 7', status: 'pending', standaloneFee: null, customerId: c })
    expect(res.body.delivery).toEqual({ id: delivery.id, status: 'pending' })
  })

  it('I12: raqamlar ketma-ket; parallel sotuvlarda takror yo‘q', async () => {
    const first = await sale({ items: [{ productId: p, qty: 1 }], paid: cashOnly(67_200) }).expect(201)
    const parallel = await Promise.all(
      Array.from({ length: 10 }, () => sale({ items: [{ productId: p, qty: 1 }], paid: cashOnly(67_200) })),
    )
    expect(parallel.every((r) => r.status === 201)).toBe(true)
    const numbers = [first, ...parallel].map((r) => Number(String(r.body.number).split('-')[1])).sort((x, y) => x - y)
    expect(numbers).toEqual(Array.from({ length: 11 }, (_, i) => 1001 + i))
  })

  it('I13 + I16: qisman to‘lovda qarz qoladi, muddat mijoz shartidan', async () => {
    const c = await seedClient(a.tenantId, { paymentTermDays: 14 })
    const res = await sale({
      customerId: c, date: '2026-08-06', items: [{ productId: p, qty: 1 }], paid: cashOnly(30_000),
    }).expect(201)
    expect(res.body).toMatchObject({ status: 'pending', outstanding: 37_200, dueDate: '2026-08-20' })
    expect(Number((await testDb.sale.findUniqueOrThrow({ where: { id: res.body.id } })).outstanding)).toBe(37_200)
  })

  it('I15: mijozsiz nasiya — 422 CREDIT_REQUIRES_CUSTOMER', async () => {
    const res = await sale({ items: [{ productId: p, qty: 1 }], paid: cashOnly(10_000) }).expect(422)
    expect(res.body.code).toBe('CREDIT_REQUIRES_CUSTOMER')
    expect(await testDb.sale.count()).toBe(0)
  })

  it('I16: limitdan oshsa rad; naqd sotuv tekshirilmaydi', async () => {
    const c = await seedClient(a.tenantId, { creditLimit: 100_000n })
    await sale({ customerId: c, items: [{ productId: p, qty: 1 }], paid: cashOnly(0) }).expect(201) // qarz 67 200
    const res = await sale({ customerId: c, items: [{ productId: p, qty: 1 }], paid: cashOnly(0) }).expect(422)
    expect(res.body.code).toBe('CREDIT_LIMIT_EXCEEDED')
    expect(res.body.errors[0].meta).toEqual({ limit: 100_000, current: 67_200, extra: 67_200 })
    await sale({ customerId: c, items: [{ productId: p, qty: 5 }], paid: cashOnly(336_000) }).expect(201)
  })

  it('I16: muddati o‘tgan qarz limitsiz ham to‘sadi', async () => {
    const c = await seedClient(a.tenantId, { paymentTermDays: 7 })
    await sale({ customerId: c, date: '2026-01-10', items: [{ productId: p, qty: 1 }], paid: cashOnly(0) }).expect(201)
    const res = await sale({ customerId: c, items: [{ productId: p, qty: 1 }], paid: cashOnly(0) }).expect(422)
    expect(res.body.code).toBe('CREDIT_OVERDUE')
  })

  it('I17: nasiya sotuvda ham bonus beriladi; ishlatilgan bonus summadan ayriladi', async () => {
    const c = await seedClient(a.tenantId, { bonusPoints: 2_000n })
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    const res = await sale({
      customerId: c, bonusUsed: 5_000, items: [{ productId: p, qty: 1 }], paid: cashOnly(0),
    }).expect(201)
    // Mavjudi 2 000 — ko'pi ishlatilmaydi: 60 000 − 2 000 = 58 000; bonus 1% = 580
    expect(res.body).toMatchObject({ total: 58_000, bonusUsed: 2_000, bonusEarned: 580, discount: 2_000, outstanding: 58_000 })
    expect(await bonusOf(c)).toBe(580)
  })

  it('I23: qopda sotilgan tovar kilogrammda chiqadi, narx birlikka moslashadi', async () => {
    const kg = await testDb.product.create({
      data: {
        tenantId: a.tenantId, name: 'Sement (kg)', sku: 'SEM-KG', unit: 'kg', altUnit: 'qop', altFactor: '50',
        price: 1_200n, wholesalePrice: 1_100n, cost: 900n,
      },
    })
    await testDb.productStock.create({ data: { tenantId: a.tenantId, productId: kg.id, warehouseId: a.warehouseId, qty: '500' } })
    const res = await sale({ items: [{ productId: kg.id, unit: 'qop', qty: 3 }], paid: cashOnly(201_600) }).expect(201)
    expect(res.body.items[0]).toMatchObject({ unit: 'qop', qty: 3, baseQty: 150, price: 60_000, cost: 45_000 })
    expect(await qtyAt(kg.id, a.warehouseId)).toBe(350)
  })

  it('chegirma chegarasi — 422 DISCOUNT_LIMIT', async () => {
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { maxDiscountPct: 5 } })
    const res = await sale({ items: [{ productId: p, qty: 1 }], discount: 3_001, paid: cashOnly(70_000) }).expect(422)
    expect(res.body.code).toBe('DISCOUNT_LIMIT')
    expect(res.body.errors[0].meta).toEqual({ max: 3_000, requested: 3_001 })
  })

  it('mijoz ko‘rsatgan jami farq qilsa — 422 TOTAL_MISMATCH; mos bo‘lsa — o‘tadi', async () => {
    const res = await sale({ items: [{ productId: p, qty: 1 }], total: 60_000, paid: cashOnly(67_200) }).expect(422)
    expect(res.body.code).toBe('TOTAL_MISMATCH')
    expect(res.body.errors[0].meta).toEqual({ client: 60_000, server: 67_200 })
    await sale({ items: [{ productId: p, qty: 1 }], total: 67_200, paid: cashOnly(67_200) }).expect(201)
  })

  it('karta chekdan oshsa — 422 PAYMENT_EXCEEDS_TOTAL; arxiv tovar — 422 PRODUCT_ARCHIVED', async () => {
    const card = await sale({ items: [{ productId: p, qty: 1 }], paid: { cash: 0, card: 70_000, transfer: 0 } }).expect(422)
    expect(card.body.code).toBe('PAYMENT_EXCEEDS_TOTAL')
    await testDb.product.update({ where: { id: p }, data: { archived: true } })
    const archived = await sale({ items: [{ productId: p, qty: 1 }], paid: cashOnly(67_200) }).expect(422)
    expect(archived.body).toMatchObject({ code: 'PRODUCT_ARCHIVED', errors: [{ field: 'items[0].productId' }] })
  })

  it('kelajak sana — 400; begona mijoz — 422; omborchi sota olmaydi — 403', async () => {
    await sale({ date: '2999-01-01', items: [{ productId: p, qty: 1 }], paid: cashOnly(67_200) }).expect(400)
    const b = await seedTenant('B do‘kon')
    const foreign = await seedClient(b.tenantId)
    const res = await sale({ customerId: foreign, items: [{ productId: p, qty: 1 }], paid: cashOnly(67_200) }).expect(422)
    expect(res.body.errors[0]).toMatchObject({ field: 'customerId', code: 'REFERENCE_NOT_FOUND' })
    await sale({ items: [{ productId: p, qty: 1 }], paid: cashOnly(67_200) }, await bearer(app, a, 'omborchi')).expect(403)
    expect(await testDb.sale.count()).toBe(0)
  })

  it('idempotent: bir xil kalit — bitta chek, bir xil javob', async () => {
    const key = randomUUID()
    const body = { items: [{ productId: p, qty: 1 }], paid: cashOnly(67_200) }
    const first = await sale(body, auth, key).expect(201)
    const again = await sale(body, auth, key).expect(201)
    expect(again.body).toEqual(first.body)
    expect(await testDb.sale.count()).toBe(1)
    expect(await qtyAt(p, a.warehouseId)).toBe(99)
  })

  it('sotuvchi tannarxni ko‘rmaydi (maydon darajasidagi himoya)', async () => {
    const res = await sale({ items: [{ productId: p, qty: 1 }], paid: cashOnly(67_200) }, await bearer(app, a, 'sotuvchi')).expect(201)
    expect(res.body.items[0]).not.toHaveProperty('cost')
  })
})
