import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TenantStatusService } from '@/modules/tenants/tenant-status.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries } from './helpers/queries'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/**
 * Ombor invariantlari (T-043): I1, I2, I11, `balanceAfter`.
 * Hammasi HTTP orqali va ilova roli (`crm_app`, RLS) bilan.
 */
describe('Ombor invariantlari (stock.invariants)', () => {
  let app: INestApplication
  let a: Tenant
  let auth: string
  let second: string

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
    second = (await testDb.warehouse.create({ data: { tenantId: a.tenantId, name: 'Sklad' } })).id
  })

  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/stock/${path}`)
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send(body)

  const stockOf = async (productId: string) => {
    const product = await testDb.product.findUniqueOrThrow({ where: { id: productId }, include: { stocks: true } })
    return {
      total: Number(product.stock),
      byWarehouse: Object.fromEntries(product.stocks.map((s) => [s.warehouseId, Number(s.qty)])),
      cost: Number(product.cost),
    }
  }

  it('I1: har qanday amaldan keyin jami = omborlar yig‘indisi', async () => {
    const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '0' })
    await post('intake', { productId: p, warehouseId: a.warehouseId, qty: 50 }).expect(201)
    await post('intake', { productId: p, warehouseId: second, qty: 30.5 }).expect(201)
    await post('transfer', { productId: p, fromWarehouseId: a.warehouseId, toWarehouseId: second, qty: 20 }).expect(201)
    await post('writeoff', { productId: p, warehouseId: second, qty: 0.5, reason: 'Nuqson' }).expect(201)
    await post('adjust', { warehouseId: a.warehouseId, items: [{ productId: p, countedQty: 29 }] }).expect(201)

    const s = await stockOf(p)
    expect(s.byWarehouse).toEqual({ [a.warehouseId]: 29, [second]: 50 })
    expect(s.total).toBe(79)
  })

  it('I1: kasrli miqdorlarda suzuvchi nuqta xatosi to‘planmaydi', async () => {
    const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '0' })
    for (let i = 0; i < 10; i++) {
      await post('intake', { productId: p, warehouseId: a.warehouseId, qty: 0.1 }).expect(201)
    }
    // JS'da 0.1 × 10 = 0.9999999999999999 bo'lardi
    expect((await stockOf(p)).total).toBe(1)
  })

  it('I2: qoldiqdan ko‘p chiqarib bo‘lmaydi — qaysi omborda yetmagani aniq', async () => {
    const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '5' })
    const res = await post('writeoff', { productId: p, warehouseId: a.warehouseId, qty: 6, reason: 'Sinov' }).expect(422)
    expect(res.body.code).toBe('STOCK_INSUFFICIENT')
    expect(res.body.detail).toMatch(/Asosiy ombor/)
    expect(res.body.errors[0].meta).toEqual({ productId: p, warehouseId: a.warehouseId, available: 5, requested: 6 })
    expect((await stockOf(p)).total).toBe(5)
  })

  it('I2: parallel ikki chiqim qoldiqni manfiy qilmaydi — faqat bittasi o‘tadi', async () => {
    const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '10' })
    const results = await Promise.all([
      post('writeoff', { productId: p, warehouseId: a.warehouseId, qty: 7, reason: 'A' }),
      post('writeoff', { productId: p, warehouseId: a.warehouseId, qty: 7, reason: 'B' }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([201, 422])
    expect((await stockOf(p)).total).toBe(3)
    expect(await testDb.stockMovement.count({ where: { productId: p } })).toBe(1)
  })

  it('I2: baza CHECK — oxirgi to‘siq (servisni chetlab)', async () => {
    const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '1' })
    await expect(
      testDb.$executeRaw`UPDATE product_stocks SET qty = -1 WHERE product_id = ${p}::uuid`,
    ).rejects.toThrow(/stock_not_negative/)
  })

  it('I11: kirim o‘rtacha tortilgan tannarxni hisoblaydi (omborlar bo‘yicha emas)', async () => {
    const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '100', cost: 10_000n })
    const res = await post('intake', { productId: p, warehouseId: second, qty: 10, unitCost: 20_000 }).expect(201)
    // (100×10 000 + 10×20 000) / 110 = 10 909
    expect(res.body.product.cost).toBe(10_909)
    expect((await stockOf(p)).cost).toBe(10_909)

    // Narxsiz kirim tannarxni o'zgartirmaydi
    await post('intake', { productId: p, qty: 5 }).expect(201)
    expect((await stockOf(p)).cost).toBe(10_909)
  })

  it('I11: qoldiq 0 bo‘lsa kirim narxi to‘g‘ridan-to‘g‘ri olinadi', async () => {
    const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '0', cost: 10_000n })
    await post('intake', { productId: p, qty: 10, unitCost: 20_000 }).expect(201)
    expect((await stockOf(p)).cost).toBe(20_000)
  })

  it('harakat yozuvi: ishorali miqdor va AYNAN o‘sha ombordagi qoldiq', async () => {
    const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '40' })
    await post('intake', { productId: p, warehouseId: second, qty: 15, unitCost: 1_000, note: 'Hujjat 12' }).expect(201)
    await post('writeoff', { productId: p, warehouseId: a.warehouseId, qty: 4, reason: 'Singan' }).expect(201)

    const moves = await testDb.stockMovement.findMany({ where: { productId: p }, orderBy: { id: 'asc' } })
    expect(moves.map((m) => [m.type, Number(m.qty), Number(m.balanceAfter), m.warehouseId])).toEqual([
      ['intake', 15, 15, second],
      ['writeoff', -4, 36, a.warehouseId],
    ])
    expect(moves[0]).toMatchObject({ note: 'Hujjat 12', unitCost: 1_000n, userId: a.userId, productName: 'Sement M400' })
    expect(moves[1]!.note).toBe('Singan')
  })

  it('so‘rovlar soni qatorlar soniga bog‘liq emas (inventarizatsiya: 3 va 30 tovar)', async () => {
    const products = await Promise.all(
      Array.from({ length: 30 }, (_, i) => seedProduct(a.tenantId, a.warehouseId, { sku: `P-${i}`, qty: '10' })),
    )
    const count = async (ids: string[]) => {
      const { queries, result } = await captureQueries(() =>
        post('adjust', { warehouseId: a.warehouseId, items: ids.map((productId) => ({ productId, countedQty: 7 })) }),
      )
      expect(result.status).toBe(201)
      return queries.length
    }
    // Do'kon holati keshda (T-127) — birinchi yozuvchi so'rov uni o'qimasin
    await app.get(TenantStatusService).status(a.tenantId)
    const few = await count(products.slice(0, 3))
    const many = await count(products.slice(3))
    expect(many).toBe(few)
  })
})
