import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TenantStatusService } from '@/modules/tenants/tenant-status.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries } from './helpers/queries'

/**
 * So'rov byudjeti (core/10-performance.md §10.1).
 *
 * Eng muhim qoida: so'rovlar soni ro'yxat uzunligiga BOG'LIQ EMAS. Shuning
 * uchun katalog bir necha omborga taqsimlangan 60 ta tovar bilan to'ldiriladi
 * — N+1 bo'lsa, so'rovlar soni tovarlar soniga teng chiqardi.
 *
 * Yangi ro'yxat endpointi qo'shilsa — shu jadvalga qo'shiladi.
 */
const PRODUCTS = 60

describe('So‘rov byudjeti', () => {
  let app: INestApplication
  let ctx: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let secondWarehouseId: string
  let categoryId: string

  beforeAll(async () => {
    app = await createTestApp()
    await truncateAll()
    ctx = await seedTenant()
    auth = await bearer(app, ctx)

    const second = await testDb.warehouse.create({ data: { tenantId: ctx.tenantId, name: 'Sklad' } })
    secondWarehouseId = second.id
    const category = await testDb.category.create({ data: { tenantId: ctx.tenantId, name: 'Sement' } })
    categoryId = category.id

    const products = await testDb.product.createManyAndReturn({
      data: Array.from({ length: PRODUCTS }, (_, i) => ({
        tenantId: ctx.tenantId,
        categoryId,
        name: `Sement ${i}`,
        sku: `SEM-${i}`,
        unit: 'qop' as const,
        price: 60_000n,
        wholesalePrice: 55_000n,
        cost: 40_000n,
        minStock: '100',
      })),
      select: { id: true },
    })
    await testDb.productStock.createMany({
      data: products.flatMap((p) => [
        { tenantId: ctx.tenantId, productId: p.id, warehouseId: ctx.warehouseId, qty: '10' },
        { tenantId: ctx.tenantId, productId: p.id, warehouseId: second.id, qty: '5' },
      ]),
    })
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(() => {
    resetThrottle(app)
  })

  /** Yo'l → ruxsat etilgan eng ko'p SQL so'rovlar soni */
  const budget = (): Record<string, number> => ({
    '/api/v1/products?pageSize=50': 2,
    [`/api/v1/products?pageSize=50&q=sement&lowStock=true&categoryId=${categoryId}&warehouseId=${secondWarehouseId}&sort=-stock`]: 2,
    [`/api/v1/products/{id}`]: 1,
    '/api/v1/categories': 2,
    '/api/v1/warehouses': 2,
    '/api/v1/clients?q=998': 2,
    // + qatorlar qarzi — sahifa id'lari bo'yicha bitta `groupBy`
    '/api/v1/suppliers': 3,
    // Bog'liq yozuv (xodim ↔ hisob) o'sha so'rovda — alohida so'rov emas
    '/api/v1/employees': 2,
    '/api/v1/users?sort=name': 2,
  })

  it('har bir ro‘yxat byudjetdan oshmaydi va qatorlar soniga bog‘liq emas', async () => {
    const anyProduct = await testDb.product.findFirstOrThrow({ where: { tenantId: ctx.tenantId } })

    for (const [route, max] of Object.entries(budget())) {
      const url = route.replace('{id}', anyProduct.id)
      const { queries, result } = await captureQueries(() =>
        request(app.getHttpServer()).get(url).set('Authorization', auth),
      )
      expect(result.status, url).toBe(200)
      expect(queries.length, `${url}\n${queries.join('\n')}`).toBeLessThanOrEqual(max)
    }

    // Sahifa to'la bo'lishi — so'rovlar soni tovarlar soniga ko'paymaganining isboti
    const page = await request(app.getHttpServer())
      .get('/api/v1/products?pageSize=50')
      .set('Authorization', auth)
      .expect(200)
    expect(page.body.items).toHaveLength(50)
    expect(Object.keys(page.body.items[0].stocks)).toHaveLength(2)
  })

  /**
   * `POST /sales` ≤ 8 — idempotentlik kaliti (2) ham HISOBDA: registr qulfi,
   * mijoz holati, mahsulot qulfi, qoldiqlar, bitta yozuv, audit.
   * Sozlama (Q18) va do'kon holati (T-127) keshda — har sotuvda kerak,
   * kamdan-kam o'zgaradi; barqaror holat o'lchanadi.
   */
  it('POST /sales: ≤ 8 so‘rov, 3 qator ham 30 qator ham bir xil', async () => {
    await openShift(ctx.tenantId)
    const customer = await seedClient(ctx.tenantId)
    const products = await testDb.product.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true }, take: 33 })
    const sell = (ids: { id: string }[]) =>
      request(app.getHttpServer())
        .post('/api/v1/sales')
        .set('Authorization', auth)
        .set('Idempotency-Key', randomUUID())
        .send({ customerId: customer, items: ids.map((p) => ({ productId: p.id, qty: 1 })), paid: { cash: 0, card: 0, transfer: 0 } })

    await request(app.getHttpServer()).get('/api/v1/settings').set('Authorization', auth).expect(200)
    await app.get(TenantStatusService).status(ctx.tenantId)
    const few = await captureQueries(() => sell(products.slice(0, 3)))
    const many = await captureQueries(() => sell(products.slice(3)))
    expect(few.result.status, JSON.stringify(few.result.body)).toBe(201)
    expect(many.result.status).toBe(201)
    expect(few.queries.length, few.queries.join("\n")).toBeLessThanOrEqual(8)
    expect(many.queries.length).toBe(few.queries.length)
  })
})
