import type { INestApplication } from '@nestjs/common'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { purchaseApi, seedSupplier } from './helpers/purchases'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/** Qabul qilish (T-069): I19, qisman → `partial`, kirim harakati va tannarx (I11) */
describe('Qabul (POST /purchase-orders/:id/receive)', () => {
  let app: INestApplication
  let a: Tenant
  let p: string
  let supplier: string
  let po: ReturnType<typeof purchaseApi>

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
    p = await seedProduct(a.tenantId, a.warehouseId, { qty: '100', cost: 10_000n })
    supplier = await seedSupplier(a.tenantId)
    po = purchaseApi(app, await bearer(app, a))
  })

  const stockOf = async (productId = p) => {
    const product = await testDb.product.findUniqueOrThrow({ where: { id: productId } })
    return { stock: Number(product.stock), cost: Number(product.cost) }
  }

  it('I19: ortiqcha qabul rad etiladi — hech narsa yozilmaydi', async () => {
    const order = (await po.create({ supplierId: supplier, items: [{ productId: p, qty: 10, cost: 1 }] }).expect(201)).body
    const res = await po.receive(order.id, { items: [{ poItemId: order.items[0].id, qty: 15 }] }).expect(422)
    expect(res.body).toMatchObject({ code: 'PO_OVER_RECEIVE', errors: [{ field: 'items[0].qty', meta: { ordered: 10, received: 0, requested: 15 } }] })
    expect((await stockOf()).stock).toBe(100)
  })

  it('I19: qisman qabul → partial, qolgani keyin → received; har qator — kirim harakati', async () => {
    const order = (await po.create({ supplierId: supplier, items: [{ productId: p, qty: 10, cost: 20_000 }] }).expect(201)).body
    const item = order.items[0].id

    const partial = await po.receive(order.id, { items: [{ poItemId: item, qty: 4 }] }).expect(200)
    expect(partial.body).toMatchObject({ status: 'partial', receivedValue: 80_000, receivedDate: null, items: [{ receivedQty: 4 }] })
    const full = await po.receive(order.id, { items: [{ poItemId: item, qty: 6 }] }).expect(200)
    expect(full.body).toMatchObject({ status: 'received', receivedValue: 200_000, items: [{ receivedQty: 10 }] })
    expect(full.body.receivedDate).not.toBeNull()

    expect((await stockOf()).stock).toBe(110)
    const moves = await testDb.stockMovement.findMany({ where: { refId: order.id }, orderBy: { id: 'asc' } })
    expect(moves.map((m) => [m.type, Number(m.qty), m.note, m.supplierId, Number(m.unitCost)])).toEqual([
      ['intake', 4, 'BUY-1001', supplier, 20_000],
      ['intake', 6, 'BUY-1001', supplier, 20_000],
    ])
    expect((await po.receive(order.id).expect(409)).body.code).toBe('PO_ALREADY_RECEIVED')
  })

  it('I11: tannarx o‘rtacha tortilgan bo‘lib yangilanadi', async () => {
    const order = (await po.create({ supplierId: supplier, items: [{ productId: p, qty: 10, cost: 20_000 }] }).expect(201)).body
    await po.receive(order.id).expect(200)
    // (100 × 10 000 + 10 × 20 000) / 110 = 10 909
    expect(await stockOf()).toEqual({ stock: 110, cost: 10_909 })
  })

  it('tanasiz — qolgan hammasi; bir necha qator; kasr miqdor', async () => {
    const kabel = await seedProduct(a.tenantId, a.warehouseId, { sku: 'KAB', qty: '0' })
    const order = (await po.create({
      supplierId: supplier,
      items: [{ productId: p, qty: 5, cost: 1_000 }, { productId: kabel, qty: 12.5, cost: 1_200 }],
    }).expect(201)).body
    await po.receive(order.id, { items: [{ poItemId: order.items[1].id, qty: 2.5 }] }).expect(200)
    const rest = await po.receive(order.id).expect(200)
    expect(rest.body).toMatchObject({ status: 'received', receivedValue: 20_000, total: 20_000 })
    expect((await stockOf(kabel)).stock).toBe(12.5)
  })

  it('bekor qilingan — 409; arxiv omborga — 422; buyurtma qatori boshqa buyurtmaniki — 422', async () => {
    const cancelled = (await po.create({ supplierId: supplier, items: [{ productId: p, qty: 1, cost: 1 }] }).expect(201)).body
    await testDb.purchaseOrder.update({ where: { id: cancelled.id }, data: { status: 'cancelled' } })
    expect((await po.receive(cancelled.id).expect(409)).body.code).toBe('PO_CANCELLED')

    const archived = await testDb.warehouse.create({ data: { tenantId: a.tenantId, name: 'Eski', archived: true } })
    const toArchive = (await po.create({ supplierId: supplier, warehouseId: archived.id, items: [{ productId: p, qty: 1, cost: 1 }] }).expect(201)).body
    expect((await po.receive(toArchive.id).expect(422)).body.code).toBe('WAREHOUSE_ARCHIVED')

    const other = (await po.create({ supplierId: supplier, items: [{ productId: p, qty: 1, cost: 1 }] }).expect(201)).body
    const res = await po.receive(other.id, { items: [{ poItemId: toArchive.items[0].id, qty: 1 }] }).expect(422)
    expect(res.body.errors[0]).toMatchObject({ field: 'items[0].poItemId', code: 'REFERENCE_NOT_FOUND' })
  })
})
