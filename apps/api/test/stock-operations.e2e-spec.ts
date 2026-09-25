import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

describe('Ombor amallari (/stock)', () => {
  let app: INestApplication
  let a: Tenant
  let auth: string
  let sklad: string

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
    sklad = (await testDb.warehouse.create({ data: { tenantId: a.tenantId, name: 'Sklad' } })).id
  })

  const post = (path: string, body: Record<string, unknown>, token = auth) =>
    request(app.getHttpServer())
      .post(`/api/v1/stock/${path}`)
      .set('Authorization', token)
      .set('Idempotency-Key', randomUUID())
      .send(body)

  const qtyAt = async (productId: string, warehouseId: string) =>
    Number((await testDb.productStock.findUnique({ where: { productId_warehouseId: { productId, warehouseId } } }))?.qty ?? 0)

  describe('POST /stock/intake (T-044)', () => {
    it('kirim: javobda yangi qoldiq, taqsimot va tannarx', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '100', cost: 40_000n })
      const res = await post('intake', { productId: p, warehouseId: sklad, qty: 50, unitCost: 42_000 }).expect(201)
      expect(res.body).toMatchObject({
        movementId: expect.any(String),
        product: { id: p, stock: 150, cost: 40_667, stocks: { [a.warehouseId]: 100, [sklad]: 50 } },
      })
    })

    it('ombor berilmasa — joriy ombor (tenant_state)', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '0' })
      await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeWarehouseId: sklad } })
      await post('intake', { productId: p, qty: 5 }).expect(201)
      expect(await qtyAt(p, sklad)).toBe(5)
    })

    it('ta’minotchi va izoh harakatda saqlanadi; boshqa do‘kon ta’minotchisi — 422', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '0' })
      const supplier = await testDb.supplier.create({ data: { tenantId: a.tenantId, name: 'Bekabad', phone: '+998712001010' } })
      await post('intake', { productId: p, qty: 3, supplierId: supplier.id, note: 'Hujjat 4512' }).expect(201)
      const move = await testDb.stockMovement.findFirstOrThrow({ where: { productId: p } })
      expect(move).toMatchObject({ supplierId: supplier.id, note: 'Hujjat 4512', type: 'intake' })

      const b = await seedTenant('B do‘kon')
      const foreign = await testDb.supplier.create({ data: { tenantId: b.tenantId, name: 'B', phone: '+998712001011' } })
      const res = await post('intake', { productId: p, qty: 1, supplierId: foreign.id }).expect(422)
      expect(res.body).toMatchObject({ code: 'REFERENCE_NOT_FOUND', errors: [{ field: 'supplierId' }] })
    })

    it('arxivlangan omborga kirim yo‘q — 422 WAREHOUSE_ARCHIVED', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '0' })
      await testDb.warehouse.update({ where: { id: sklad }, data: { archived: true } })
      const res = await post('intake', { productId: p, warehouseId: sklad, qty: 1 }).expect(422)
      expect(res.body.code).toBe('WAREHOUSE_ARCHIVED')
    })

    it('yo‘q/boshqa do‘kon mahsuloti — 422 REFERENCE_NOT_FOUND', async () => {
      const b = await seedTenant('B do‘kon')
      const foreign = await seedProduct(b.tenantId, b.warehouseId)
      const res = await post('intake', { productId: foreign, qty: 1 }).expect(422)
      expect(res.body).toMatchObject({ code: 'REFERENCE_NOT_FOUND', errors: [{ field: 'productId' }] })
      expect(await qtyAt(foreign, b.warehouseId)).toBe(100)
    })

    it('noto‘g‘ri miqdor va narx — 400', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId)
      for (const body of [{ qty: 0 }, { qty: -1 }, { qty: 1.2345 }, { qty: 1, unitCost: 10.5 }, { qty: 1, unitCost: 0 }]) {
        await post('intake', { productId: p, ...body }).expect(400)
      }
    })

    it('huquqlar: omborchi kirim qiladi, sotuvchi — yo‘q', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId)
      await post('intake', { productId: p, qty: 1 }, await bearer(app, a, 'omborchi')).expect(201)
      await post('intake', { productId: p, qty: 1 }, await bearer(app, a, 'sotuvchi')).expect(403)
    })

    it('audit: miqdor, narx va yangi tannarx bilan', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '0' })
      await post('intake', { productId: p, qty: 4, unitCost: 5_000 }).expect(201)
      const entry = await testDb.auditEntry.findFirstOrThrow({ where: { tenantId: a.tenantId, action: 'stock.intake' } })
      expect(entry).toMatchObject({ entityType: 'product', entityId: p, userId: a.userId })
      expect(entry.diff).toMatchObject({ qty: 4, unitCost: 5_000, costAfter: 5_000, warehouseId: a.warehouseId })
    })
  })

  describe('POST /stock/writeoff (T-045)', () => {
    it('sabab majburiy', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId)
      await post('writeoff', { productId: p, qty: 1 }).expect(400)
      await post('writeoff', { productId: p, qty: 1, reason: '   ' }).expect(400)
      const res = await post('writeoff', { productId: p, qty: 1, reason: 'Singan' }).expect(201)
      expect(res.body.product.stock).toBe(99)
    })

    it('boshqa omborda tovar bo‘lsa ham — AYNAN shu omborda yetishi kerak', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '100' })
      const res = await post('writeoff', { productId: p, warehouseId: sklad, qty: 1, reason: 'X' }).expect(422)
      expect(res.body.code).toBe('STOCK_INSUFFICIENT')
      expect(res.body.detail).toMatch(/Sklad/)
    })

    it('arxivlangan ombordan chiqim mumkin (qoldiqni tozalash)', async () => {
      const p = await seedProduct(a.tenantId, sklad, { qty: '3' })
      await testDb.warehouse.update({ where: { id: sklad }, data: { archived: true } })
      await post('writeoff', { productId: p, warehouseId: sklad, qty: 3, reason: 'Yopilish' }).expect(201)
      expect(await qtyAt(p, sklad)).toBe(0)
    })
  })

  describe('POST /stock/adjust (T-046)', () => {
    it('farq bitta `adjustment` harakatiga; farq 0 — yozuvsiz', async () => {
      const p1 = await seedProduct(a.tenantId, a.warehouseId, { sku: 'A', qty: '120' })
      const p2 = await seedProduct(a.tenantId, a.warehouseId, { sku: 'B', qty: '10' })
      const p3 = await seedProduct(a.tenantId, a.warehouseId, { sku: 'C', qty: '5' })

      const res = await post('adjust', {
        note: 'Oylik inventarizatsiya',
        items: [
          { productId: p1, countedQty: 118 },
          { productId: p2, countedQty: 10 },
          { productId: p3, countedQty: 7.5 },
        ],
      }).expect(201)

      expect(res.body.unchanged).toBe(1)
      expect(res.body.adjusted.map((l: { productId: string; delta: number; balanceAfter: number }) => [l.productId, l.delta, l.balanceAfter]))
        .toEqual([[p1, -2, 118], [p3, 2.5, 7.5]])
      expect(await testDb.stockMovement.count({ where: { productId: p2 } })).toBe(0)
      const move = await testDb.stockMovement.findFirstOrThrow({ where: { productId: p1 } })
      expect(move).toMatchObject({ type: 'adjustment', note: 'Oylik inventarizatsiya' })
    })

    it('hamma farq 0 — harakat ham, audit ham yo‘q', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '10' })
      const res = await post('adjust', { items: [{ productId: p, countedQty: 10 }] }).expect(201)
      expect(res.body).toEqual({ adjusted: [], unchanged: 1 })
      expect(await testDb.auditEntry.count({ where: { action: 'stock.adjust' } })).toBe(0)
    })

    it('takror mahsulot — 400; manfiy sanoq — 400', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId)
      await post('adjust', { items: [{ productId: p, countedQty: 1 }, { productId: p, countedQty: 2 }] }).expect(400)
      await post('adjust', { items: [{ productId: p, countedQty: -1 }] }).expect(400)
    })
  })

  describe('POST /stock/transfer (T-047)', () => {
    it('ikki harakat, jami qoldiq O‘ZGARMAYDI', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '50' })
      const res = await post('transfer', {
        productId: p, fromWarehouseId: a.warehouseId, toWarehouseId: sklad, qty: 30, note: 'Skladga',
      }).expect(201)

      expect(res.body.product).toMatchObject({ stock: 50, stocks: { [a.warehouseId]: 20, [sklad]: 30 } })
      const moves = await testDb.stockMovement.findMany({ where: { productId: p }, orderBy: { id: 'asc' } })
      expect(moves.map((m) => [m.type, Number(m.qty), m.warehouseId, m.counterWarehouseId])).toEqual([
        ['transfer_out', -30, a.warehouseId, sklad],
        ['transfer_in', 30, sklad, a.warehouseId],
      ])
      expect(res.body.outMovementId).toBe(moves[0]!.id)
      expect(res.body.inMovementId).toBe(moves[1]!.id)
    })

    it('bir xil ombor — 422 WAREHOUSE_SAME', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId)
      const res = await post('transfer', { productId: p, fromWarehouseId: sklad, toWarehouseId: sklad, qty: 1 }).expect(422)
      expect(res.body.code).toBe('WAREHOUSE_SAME')
    })

    it('manbada yetmasa — hech narsa yozilmaydi', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '5' })
      await post('transfer', { productId: p, fromWarehouseId: a.warehouseId, toWarehouseId: sklad, qty: 6 }).expect(422)
      expect(await testDb.stockMovement.count({ where: { productId: p } })).toBe(0)
      expect(await qtyAt(p, a.warehouseId)).toBe(5)
    })

    it('arxivlangan omborGA ko‘chirib bo‘lmaydi, undan — mumkin', async () => {
      const p = await seedProduct(a.tenantId, sklad, { qty: '5' })
      await testDb.warehouse.update({ where: { id: sklad }, data: { archived: true } })
      await post('transfer', { productId: p, fromWarehouseId: a.warehouseId, toWarehouseId: sklad, qty: 1 }).expect(422)
      await post('transfer', { productId: p, fromWarehouseId: sklad, toWarehouseId: a.warehouseId, qty: 5 }).expect(201)
      expect(await qtyAt(p, a.warehouseId)).toBe(5)
    })
  })

  describe('GET /stock/reorder-suggestions (T-049)', () => {
    it('kam qolganlar ta’minotchi bo‘yicha, miqdor shared formulasi bilan', async () => {
      const bek = await testDb.supplier.create({ data: { tenantId: a.tenantId, name: 'Bekabad', phone: '+998712001010' } })
      const mk = (sku: string, qty: string, min: string, supplierId?: string, archived = false) =>
        testDb.product.create({
          data: {
            tenantId: a.tenantId, name: sku, sku, unit: 'qop', price: 1n, wholesalePrice: 1n, cost: 52_000n,
            minStock: min, supplierId, archived,
            stocks: { create: { tenantId: a.tenantId, warehouseId: a.warehouseId, qty } },
          },
        })
      await mk('LOW-1', '10', '40', bek.id) // 80 − 10 = 70
      await mk('LOW-2', '40', '40') // max(40, 40) = 40, ta'minotchisiz
      await mk('OK', '100', '40', bek.id) // kam emas
      await mk('ARCH', '1', '40', bek.id, true) // arxivlangan
      await mk('NOMIN', '0', '0') // minimal belgilanmagan

      const res = await request(app.getHttpServer())
        .get('/api/v1/stock/reorder-suggestions')
        .set('Authorization', auth)
        .expect(200)
      expect(res.body).toEqual([
        { supplier: { id: bek.id, name: 'Bekabad' }, items: [expect.objectContaining({ sku: 'LOW-1', stock: 10, minStock: 40, suggestedQty: 70, cost: 52_000 })] },
        { supplier: null, items: [expect.objectContaining({ sku: 'LOW-2', suggestedQty: 40 })] },
      ])

      const seller = await request(app.getHttpServer())
        .get('/api/v1/stock/reorder-suggestions')
        .set('Authorization', await bearer(app, a, 'sotuvchi'))
        .expect(200)
      expect(seller.body[0].items[0]).not.toHaveProperty('cost')
    })
  })
})
