import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { encodeCursor } from '@/common/crud/paging'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Harakatlar jurnali (T-048): kalitli sahifalash 100 000 yozuvda.
 * Qabul: har sahifa (chuqur ham) p95 < 200 ms, yozuvlar takrorlanmaydi va
 * tushib qolmaydi.
 */
const ROWS = 100_000
const P95_MS = 200

describe('Harakatlar jurnali — kursorli sahifalash (movements-pagination)', () => {
  let app: INestApplication
  let auth: string
  let ctx: Awaited<ReturnType<typeof seedTenant>>
  let sklad: string
  let products: string[]

  beforeAll(async () => {
    app = await createTestApp()
    await truncateAll()
    ctx = await seedTenant()
    auth = await bearer(app, ctx)
    sklad = (await testDb.warehouse.create({ data: { tenantId: ctx.tenantId, name: 'Sklad' } })).id
    products = await Promise.all(
      Array.from({ length: 5 }, (_, i) => seedProduct(ctx.tenantId, ctx.warehouseId, { sku: `P${i}` })),
    )
    // Bir yillik jurnal: 5 tovar, 2 ombor, turli turlar
    await testDb.$executeRawUnsafe(
      `INSERT INTO stock_movements (id, tenant_id, product_id, product_name, type, qty, balance_after,
                                    warehouse_id, date, note)
       SELECT gen_random_uuid(), $1::uuid, ($2::uuid[])[1 + g % 5], 'Tovar ' || (g % 5),
              (ARRAY['intake','sale','writeoff','adjustment','return'])[1 + g % 5]::"MovementType",
              1, g, CASE WHEN g % 50 = 0 THEN $3::uuid ELSE $4::uuid END,
              DATE '2026-09-23' - (g % 365), 'izoh ' || g
         FROM generate_series(1, ${ROWS}) g`,
      ctx.tenantId,
      products,
      sklad,
      ctx.warehouseId,
    )
    await testDb.$executeRawUnsafe('ANALYZE stock_movements')
  }, 120_000)

  afterAll(async () => {
    await truncateAll()
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(() => {
    resetThrottle(app)
  })

  const get = (query: string) =>
    request(app.getHttpServer()).get(`/api/v1/stock/movements${query}`).set('Authorization', auth)

  it('sahifalar orasida yozuv takrorlanmaydi va tushib qolmaydi', async () => {
    // Ikkinchi ombor — ~2 000 yozuv, 200 lik sahifalar bo'ylab to'liq yurib chiqamiz
    const expected = await testDb.stockMovement.count({ where: { tenantId: ctx.tenantId, warehouseId: sklad } })
    const seen: { date: string; id: string }[] = []
    let cursor: string | null = null
    do {
      const res: request.Response = await get(`?warehouseId=${sklad}&limit=200${cursor ? `&cursor=${cursor}` : ''}`).expect(200)
      const page = res.body as { items: { date: string; id: string }[]; nextCursor: string | null; hasMore: boolean }
      seen.push(...page.items.map((m) => ({ date: m.date, id: m.id })))
      cursor = page.nextCursor
      expect(page.hasMore).toBe(cursor !== null)
    } while (cursor)

    expect(seen).toHaveLength(expected)
    expect(new Set(seen.map((m) => m.id)).size).toBe(expected)
    // Qat'iy kamayuvchi tartib: (date, id)
    for (let i = 1; i < seen.length; i++) {
      const prev = seen[i - 1]!
      const cur = seen[i]!
      expect(prev.date > cur.date || (prev.date === cur.date && prev.id > cur.id)).toBe(true)
    }
  })

  it(`100 000 yozuvda ham har sahifa p95 < ${P95_MS} ms (chuqur sahifa ham)`, async () => {
    // Jurnalning o'rtasidagi kursor — OFFSET bo'lganda eng sekin joy
    const [middle] = await testDb.$queryRaw<{ date: Date; id: string }[]>`
      SELECT date, id FROM stock_movements WHERE tenant_id = ${ctx.tenantId}::uuid
       ORDER BY date DESC, id DESC OFFSET ${ROWS / 2} LIMIT 1`
    const deep = encodeCursor({ v: middle!.date.toISOString().slice(0, 10), id: middle!.id })

    const queries = [
      '',
      `?cursor=${deep}`,
      `?productId=${products[2]}`,
      `?productId=${products[2]}&cursor=${deep}`,
      `?warehouseId=${ctx.warehouseId}&cursor=${deep}`,
      '?type=sale',
      '?dateFrom=2026-03-01&dateTo=2026-03-31',
      `?dateFrom=2025-10-01&dateTo=2026-09-23&cursor=${deep}`,
      '?q=Tovar%203&limit=100',
      '?limit=200',
    ]
    const timings: number[] = []
    for (let round = 0; round < 3; round++) {
      for (const query of queries) {
        const started = performance.now()
        const res = await get(query).expect(200)
        timings.push(performance.now() - started)
        expect(res.body.items.length).toBeGreaterThan(0)
      }
    }
    timings.sort((x, y) => x - y)
    const p95 = timings[Math.ceil(timings.length * 0.95) - 1]!
    expect(p95).toBeLessThan(P95_MS)
  }, 60_000)

  it('filtrlar: mahsulot, ombor, tur va davr birga ishlaydi', async () => {
    const res = await get(`?productId=${products[1]}&type=sale&dateFrom=2026-09-01&dateTo=2026-09-23&limit=200`).expect(200)
    expect(res.body.items.length).toBeGreaterThan(0)
    for (const m of res.body.items as { productId: string; type: string; date: string }[]) {
      expect(m).toMatchObject({ productId: products[1], type: 'sale' })
      expect(m.date >= '2026-09-01' && m.date <= '2026-09-23').toBe(true)
    }
  })

  it('buzilgan kursor — 400', async () => {
    await get('?cursor=buzilgan-kursor').expect(400)
  })
})
