import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries } from './helpers/queries'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

const row = (i: number, extra: Record<string, unknown> = {}) => ({
  name: `Tovar ${i}`,
  sku: `SKU-${i}`,
  unit: 'dona',
  price: 1_000 + i,
  ...extra,
})

describe('Mahsulot importi va ommaviy narx', () => {
  let app: INestApplication
  let a: Tenant
  let auth: string

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
  })

  const http = () => request(app.getHttpServer())
  const importRows = (rows: unknown[], mode?: string) =>
    http().post('/api/v1/products/import').set('Authorization', auth).send({ rows, ...(mode && { mode }) })

  describe('POST /products/import', () => {
    it('1000 qator — BITTA INSERT (createMany)', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) => row(i, { category: 'Sement' }))
      const { result, queries } = await captureQueries(() => importRows(rows))

      expect(result.status).toBe(200)
      expect(result.body).toMatchObject({ created: 1000, updated: 0, skipped: 0, errors: [], categoriesCreated: 1 })
      const inserts = queries.filter((q) => /^\s*INSERT INTO "public"\."products"/i.test(q))
      expect(inserts).toHaveLength(1)
      expect(await testDb.product.count({ where: { tenantId: a.tenantId } })).toBe(1000)
    })

    it('xato qatorlar hisobotda, to‘g‘rilari saqlanadi', async () => {
      await testDb.product.create({
        data: { tenantId: a.tenantId, name: 'Bor', sku: 'EXISTS', barcode: '4780000000011', unit: 'dona', price: 1n, wholesalePrice: 1n, cost: 1n },
      })
      const res = await importRows([
        row(1),
        { sku: 'NO-NAME', unit: 'dona', price: 1 }, // 2: nom yo'q
        row(3, { unit: 'tonna' }), // 3: birlik noto'g'ri
        row(4, { price: -5 }), // 4: manfiy narx
        row(5, { stock: 10 }), // 5: qoldiq importda yo'q (ombor amali orqali)
        row(1), // 6: faylda takror SKU
        row(7, { sku: 'EXISTS' }), // 7: bazada bor SKU
        row(8, { barcode: '4780000000011' }), // 8: shtrix-kod boshqa tovarda
        row(9),
      ]).expect(200)

      expect(res.body).toMatchObject({ created: 2, updated: 0, skipped: 7 })
      expect(res.body.errors.map((e: { row: number; code: string }) => [e.row, e.code])).toEqual([
        [2, 'VALIDATION_FAILED'],
        [3, 'VALIDATION_FAILED'],
        [4, 'VALIDATION_FAILED'],
        [5, 'VALIDATION_FAILED'],
        [6, 'DUPLICATE_SKU'],
        [7, 'DUPLICATE_SKU'],
        [8, 'ALREADY_EXISTS'],
      ])
      expect(res.body.errors[3].detail).toMatch(/stock/)
      const saved = await testDb.product.findMany({ where: { tenantId: a.tenantId, sku: { in: ['SKU-1', 'SKU-9'] } } })
      expect(saved).toHaveLength(2)
    })

    it('`upsert`: SKU bo‘yicha yangilaydi, berilmagan maydonni saqlaydi', async () => {
      const existing = await testDb.product.create({
        data: {
          tenantId: a.tenantId, name: 'Eski nom', sku: 'SKU-1', barcode: '111', unit: 'dona',
          price: 1n, wholesalePrice: 1n, cost: 500n,
        },
      })

      const res = await importRows([row(1, { price: 7_000 }), row(2)], 'upsert').expect(200)
      expect(res.body).toMatchObject({ created: 1, updated: 1, skipped: 0 })

      const after = await testDb.product.findUniqueOrThrow({ where: { id: existing.id } })
      expect(after.name).toBe('Tovar 1')
      expect(after.price).toBe(7_000n)
      // Qatorda berilmagan: shtrix-kod va tannarx o'zgarmaydi
      expect(after.barcode).toBe('111')
      expect(after.cost).toBe(500n)
    })

    it('`upsert`: o‘chirilgan mahsulot SKU’si — xato (avval tiklash kerak)', async () => {
      await testDb.product.create({
        data: { tenantId: a.tenantId, name: 'X', sku: 'SKU-1', unit: 'dona', price: 1n, wholesalePrice: 1n, cost: 1n, deletedAt: new Date() },
      })
      const res = await importRows([row(1)], 'upsert').expect(200)
      expect(res.body.errors).toEqual([expect.objectContaining({ row: 1, code: 'DUPLICATE_SKU' })])
    })

    it('kategoriya nom bo‘yicha: mavjudi ishlatiladi, yo‘g‘i yaratiladi, o‘chirilgani tiklanadi', async () => {
      const kept = await testDb.category.create({ data: { tenantId: a.tenantId, name: 'Sement', sortOrder: 3 } })
      const deleted = await testDb.category.create({
        data: { tenantId: a.tenantId, name: 'Bo‘yoq', sortOrder: 4, deletedAt: new Date() },
      })

      const res = await importRows([
        row(1, { category: 'Sement' }),
        row(2, { category: 'Bo‘yoq' }),
        row(3, { category: 'Asboblar' }),
        row(4),
      ]).expect(200)
      expect(res.body).toMatchObject({ created: 4, categoriesCreated: 1 })

      const products = await testDb.product.findMany({
        where: { tenantId: a.tenantId },
        select: { sku: true, categoryId: true },
        orderBy: { sku: 'asc' },
      })
      const created = await testDb.category.findFirstOrThrow({ where: { tenantId: a.tenantId, name: 'Asboblar' } })
      expect(products).toEqual([
        { sku: 'SKU-1', categoryId: kept.id },
        { sku: 'SKU-2', categoryId: deleted.id },
        { sku: 'SKU-3', categoryId: created.id },
        { sku: 'SKU-4', categoryId: null },
      ])
      expect(created.sortOrder).toBe(5)
      expect((await testDb.category.findUniqueOrThrow({ where: { id: deleted.id } })).deletedAt).toBeNull()
    })

    it('ulgurji narx va tannarx berilmasa: chakana narx va 0', async () => {
      await importRows([row(1, { price: 5_000 })]).expect(200)
      const p = await testDb.product.findFirstOrThrow({ where: { tenantId: a.tenantId } })
      expect(p.wholesalePrice).toBe(5_000n)
      expect(p.cost).toBe(0n)
    })

    it('import audit jurnaliga yig‘indi bilan tushadi', async () => {
      await importRows([row(1), row(1)]).expect(200)
      const entry = await testDb.auditEntry.findFirstOrThrow({ where: { tenantId: a.tenantId, action: 'product.import' } })
      expect(entry.diff).toMatchObject({ mode: 'create', created: 1, updated: 0, skipped: 1 })
    })

    it('5000 qator — ruxsat etilgan chegara to‘liq qabul qilinadi', async () => {
      const rows = Array.from({ length: 5000 }, (_, i) =>
        row(i, { name: `Portland sement M400 (50 kg) — ${i}`, barcode: `478${String(i).padStart(10, '0')}`, category: 'Sement' }),
      )
      const res = await importRows(rows).expect(200)
      expect(res.body).toMatchObject({ created: 5000, skipped: 0 })
    }, 60_000)

    it('chegaralar: 5000 dan ko‘p qator va obyekt bo‘lmagan qator — 400', async () => {
      const tooMany = Array.from({ length: 5001 }, (_, i) => row(i))
      await importRows(tooMany).expect(400)
      await importRows(['satr']).expect(400)
      await importRows([]).expect(400)
    })

    it('sotuvchi import qila olmaydi', async () => {
      await http()
        .post('/api/v1/products/import')
        .set('Authorization', await bearer(app, a, 'sotuvchi'))
        .send({ rows: [row(1)] })
        .expect(403)
    })
  })

  describe('POST /products/bulk-price', () => {
    const seed = async (sku: string, price: bigint, tenantId = a.tenantId): Promise<string> =>
      (
        await testDb.product.create({
          data: { tenantId, name: sku, sku, unit: 'dona', price, wholesalePrice: price, cost: 1n },
        })
      ).id

    const bulk = (body: Record<string, unknown>, token = auth) =>
      http().post('/api/v1/products/bulk-price').set('Authorization', token).send(body)

    it('foizga: butun so‘mga yaxlitlanadi, eski/yangi narx audit’ga yoziladi', async () => {
      const p1 = await seed('A', 10_005n)
      const p2 = await seed('B', 999n)

      const res = await bulk({ ids: [p1, p2], mode: 'percent', value: 10, target: 'price' }).expect(200)
      expect(res.body).toEqual({ updated: 2 })

      const prices = await testDb.product.findMany({ where: { id: { in: [p1, p2] } }, select: { id: true, price: true } })
      expect(Object.fromEntries(prices.map((p) => [p.id, p.price]))).toEqual({ [p1]: 11_006n, [p2]: 1_099n })

      const entry = await testDb.auditEntry.findFirstOrThrow({ where: { tenantId: a.tenantId, action: 'product.bulk_price' } })
      expect(entry.userId).toBe(a.userId)
      expect(entry.diff).toMatchObject({ target: 'price', mode: 'percent', value: 10 })
      expect((entry.diff as { changes: unknown[] }).changes).toEqual(
        expect.arrayContaining([
          { id: p1, before: 10_005, after: 11_006 },
          { id: p2, before: 999, after: 1_099 },
        ]),
      )
    })

    it('`fixed` va `set`; natija manfiy bo‘lmaydi; faqat tanlangan narx o‘zgaradi', async () => {
      const p = await seed('A', 1_000n)
      await bulk({ ids: [p], mode: 'fixed', value: -5_000, target: 'price' }).expect(200)
      expect((await testDb.product.findUniqueOrThrow({ where: { id: p } })).price).toBe(0n)

      await bulk({ ids: [p], mode: 'set', value: 7_500, target: 'wholesalePrice' }).expect(200)
      const after = await testDb.product.findUniqueOrThrow({ where: { id: p } })
      expect(after.wholesalePrice).toBe(7_500n)
      expect(after.price).toBe(0n)
    })

    it('boshqa do‘kon va o‘chirilgan tovarga tegmaydi', async () => {
      const b = await seedTenant('B do‘kon')
      const own = await seed('A', 1_000n)
      const foreign = await seed('B', 1_000n, b.tenantId)
      const deleted = await seed('D', 1_000n)
      await testDb.product.update({ where: { id: deleted }, data: { deletedAt: new Date() } })

      const res = await bulk({ ids: [own, foreign, deleted], mode: 'set', value: 5, target: 'price' }).expect(200)
      expect(res.body.updated).toBe(1)
      expect((await testDb.product.findUniqueOrThrow({ where: { id: foreign } })).price).toBe(1_000n)
      expect((await testDb.product.findUniqueOrThrow({ where: { id: deleted } })).price).toBe(1_000n)
    })

    it('noto‘g‘ri qiymatlar — 400', async () => {
      const p = await seed('A', 1_000n)
      await bulk({ ids: [p], mode: 'percent', value: -150, target: 'price' }).expect(400)
      await bulk({ ids: [p], mode: 'set', value: 10.5, target: 'price' }).expect(400)
      await bulk({ ids: [p], mode: 'set', value: -1, target: 'price' }).expect(400)
      // Tannarx kirimda hisoblanadi (I11) — bu yerda o'zgartirilmaydi
      await bulk({ ids: [p], mode: 'set', value: 1, target: 'cost' }).expect(400)
      await bulk({ ids: ['emas-uuid'], mode: 'set', value: 1, target: 'price' }).expect(400)
    })

    it('omborchi ham o‘zgartira oladi, sotuvchi — yo‘q', async () => {
      const p = await seed('A', 1_000n)
      await bulk({ ids: [p], mode: 'set', value: 1, target: 'price' }, await bearer(app, a, 'sotuvchi')).expect(403)
      await bulk({ ids: [p], mode: 'set', value: 1, target: 'price' }, await bearer(app, a, 'omborchi')).expect(200)
    })
  })
})
