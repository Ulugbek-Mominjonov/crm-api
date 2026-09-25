import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

const BASE = {
  name: 'Portland sement M400',
  sku: 'SEM-400',
  unit: 'qop',
  price: 60_000,
  wholesalePrice: 55_000,
  cost: 40_000,
}

describe('Mahsulotlar (/products)', () => {
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

  const createProduct = async (body: Record<string, unknown> = {}, token = auth): Promise<string> => {
    const res = await http()
      .post('/api/v1/products')
      .set('Authorization', token)
      .send({ ...BASE, ...body })
      .expect(201)
    return res.body.id as string
  }

  /** Ombordagi qoldiq — kirim amali (E5) hali yo'q, shuning uchun bazaga */
  const putStock = async (productId: string, warehouseId: string, qty: string): Promise<void> => {
    await testDb.productStock.upsert({
      where: { productId_warehouseId: { productId, warehouseId } },
      create: { tenantId: a.tenantId, productId, warehouseId, qty },
      update: { qty },
    })
  }

  const list = async (query = '', token = auth) =>
    (await http().get(`/api/v1/products${query}`).set('Authorization', token).expect(200)).body

  it('yaratish: pul va miqdor JSON’da son, qoldiq bo‘sh', async () => {
    const res = await http()
      .post('/api/v1/products')
      .set('Authorization', auth)
      .send({ ...BASE, minStock: 12.5, altUnit: 'kg', altFactor: 50 })
      .expect(201)
    expect(res.body).toMatchObject({
      ...BASE,
      barcode: null,
      categoryId: null,
      stock: 0,
      stocks: {},
      minStock: 12.5,
      altUnit: 'kg',
      altFactor: 50,
      archived: false,
    })
  })

  it('SKU do‘kon ichida noyob → 409 DUPLICATE_SKU; boshqa do‘konda — mumkin', async () => {
    await createProduct()
    const res = await http().post('/api/v1/products').set('Authorization', auth).send(BASE).expect(409)
    expect(res.body).toMatchObject({ code: 'DUPLICATE_SKU', errors: [{ field: 'sku' }] })

    const b = await seedTenant('B do‘kon')
    await createProduct({}, await bearer(app, b))
  })

  it('shtrix-kod o‘chirilmaganlar orasida noyob; bo‘sh kod band qilmaydi', async () => {
    const first = await createProduct({ barcode: '4780000000011' })
    const dup = await http()
      .post('/api/v1/products')
      .set('Authorization', auth)
      .send({ ...BASE, sku: 'SEM-500', barcode: '4780000000011' })
      .expect(409)
    expect(dup.body).toMatchObject({ code: 'ALREADY_EXISTS', errors: [{ field: 'barcode' }] })

    // Bo'sh satr null bo'lib saqlanadi — ikkita "kodsiz" tovar bo'la oladi
    await createProduct({ sku: 'A-1', barcode: '' })
    await createProduct({ sku: 'A-2', barcode: '  ' })

    // O'chirilgan tovar kodi bo'shaydi
    await http().delete(`/api/v1/products/${first}`).set('Authorization', auth).expect(204)
    await createProduct({ sku: 'SEM-600', barcode: '4780000000011' })
  })

  it('qoldiqni PATCH bilan o‘zgartirib bo‘lmaydi — faqat ombor amallari orqali', async () => {
    const id = await createProduct()
    await putStock(id, a.warehouseId, '10')

    const res = await http()
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', auth)
      .send({ stock: 999 })
      .expect(400)
    expect(res.body.detail).toMatch(/stock/)
    await http().patch(`/api/v1/products/${id}`).set('Authorization', auth).send({ stocks: {} }).expect(400)

    const row = await testDb.product.findUniqueOrThrow({ where: { id } })
    expect(row.stock.toString()).toBe('10')
  })

  it('tahrirlash: faqat yuborilgan maydonlar o‘zgaradi', async () => {
    const id = await createProduct({ barcode: '111' })
    const res = await http()
      .patch(`/api/v1/products/${id}`)
      .set('Authorization', auth)
      .send({ price: 65_000, barcode: null })
      .expect(200)
    expect(res.body).toMatchObject({ price: 65_000, wholesalePrice: 55_000, barcode: null, name: BASE.name })
  })

  it('boshqa do‘kon kategoriyasiga havola → 422 REFERENCE_NOT_FOUND', async () => {
    const b = await seedTenant('B do‘kon')
    const bCategory = await testDb.category.create({ data: { tenantId: b.tenantId, name: 'B kategoriya' } })

    const res = await http()
      .post('/api/v1/products')
      .set('Authorization', auth)
      .send({ ...BASE, categoryId: bCategory.id })
      .expect(422)
    expect(res.body).toMatchObject({ code: 'REFERENCE_NOT_FOUND', errors: [{ field: 'categoryId' }] })
  })

  it('qidiruv: nom va SKU — qism, shtrix-kod — aniq', async () => {
    await createProduct({ name: 'Sement M400', sku: 'SEM-400', barcode: '4780000000011' })
    await createProduct({ name: 'G‘isht qizil', sku: 'GISHT-1', barcode: '4780000000028' })

    const byName = await list('?q=sement')
    expect(byName.items.map((p: { sku: string }) => p.sku)).toEqual(['SEM-400'])
    const bySku = await list('?q=isht-')
    expect(bySku.items.map((p: { sku: string }) => p.sku)).toEqual(['GISHT-1'])
    const byBarcode = await list('?q=4780000000028')
    expect(byBarcode.items.map((p: { sku: string }) => p.sku)).toEqual(['GISHT-1'])
    // Shtrix-kodning bir qismi mos kelmaydi — skaner doim to'liq kod beradi
    expect((await list('?q=478000000002')).total).toBe(0)
  })

  it('filtrlar: kategoriya, ta’minotchi, kam qolgan, arxiv', async () => {
    const category = await testDb.category.create({ data: { tenantId: a.tenantId, name: 'Sement' } })
    const supplier = await testDb.supplier.create({ data: { tenantId: a.tenantId, name: 'Bekabad', phone: '+998712001010' } })
    const inCategory = await createProduct({ sku: 'C-1', categoryId: category.id, minStock: 5 })
    const fromSupplier = await createProduct({ sku: 'S-1', supplierId: supplier.id, minStock: 5 })
    const archived = await createProduct({ sku: 'AR-1', archived: true })
    await putStock(inCategory, a.warehouseId, '3') // 3 ≤ 5 — kam qolgan
    await putStock(fromSupplier, a.warehouseId, '50')

    const ids = (body: { items: { id: string }[] }) => body.items.map((p) => p.id)
    expect(ids(await list(`?categoryId=${category.id}`))).toEqual([inCategory])
    expect(ids(await list(`?supplierId=${supplier.id}`))).toEqual([fromSupplier])
    expect(ids(await list('?lowStock=true'))).toEqual([inCategory])
    // Sukut — faqat faol; `archived=true` — faqat arxivlanganlar
    expect(ids(await list())).not.toContain(archived)
    expect(ids(await list('?archived=true'))).toEqual([archived])
  })

  it('ombor filtri: faqat shu omborda qoldig‘i borlar va `warehouseStock`', async () => {
    const second = await testDb.warehouse.create({ data: { tenantId: a.tenantId, name: 'Sklad' } })
    const both = await createProduct({ sku: 'BOTH' })
    const mainOnly = await createProduct({ sku: 'MAIN' })
    const soldOut = await createProduct({ sku: 'ZERO' })
    await putStock(both, a.warehouseId, '80.5')
    await putStock(both, second.id, '40')
    await putStock(mainOnly, a.warehouseId, '7')
    await putStock(soldOut, second.id, '0')

    const res = await list(`?warehouseId=${second.id}`)
    expect(res.items).toHaveLength(1)
    // I1: `stock` — jami, `stocks` — taqsimot, `warehouseStock` — so'ralgan ombor
    expect(res.items[0]).toMatchObject({
      id: both,
      stock: 120.5,
      stocks: { [a.warehouseId]: 80.5, [second.id]: 40 },
      warehouseStock: 40,
    })
    expect((await list()).items[0]).not.toHaveProperty('warehouseStock')
  })

  it('saralash va sahifalash', async () => {
    for (const [sku, price] of [['A', 300], ['B', 100], ['C', 200]] as const) {
      await createProduct({ sku, name: `Tovar ${sku}`, price })
    }
    const page = await list('?sort=-price&pageSize=2&page=1')
    expect(page).toMatchObject({ page: 1, pageSize: 2, total: 3, pageCount: 2 })
    expect(page.items.map((p: { sku: string }) => p.sku)).toEqual(['A', 'C'])
    const next = await list('?sort=-price&pageSize=2&page=2')
    expect(next.items.map((p: { sku: string }) => p.sku)).toEqual(['B'])

    await http().get('/api/v1/products?sort=cost').set('Authorization', auth).expect(400)
    await http().get('/api/v1/products?pageSize=500').set('Authorization', auth).expect(400)
  })

  it('sotuvchi tannarx va ulgurji narxni ko‘rmaydi — ro‘yxatda ham, kartada ham', async () => {
    const id = await createProduct()
    const seller = await bearer(app, a, 'sotuvchi')

    const listed = await list('', seller)
    expect(listed.items[0]).toHaveProperty('price', BASE.price)
    expect(listed.items[0]).not.toHaveProperty('cost')
    expect(listed.items[0]).not.toHaveProperty('wholesalePrice')

    const one = await http().get(`/api/v1/products/${id}`).set('Authorization', seller).expect(200)
    expect(one.body).not.toHaveProperty('cost')
    await http().post('/api/v1/products').set('Authorization', seller).send({ ...BASE, sku: 'X' }).expect(403)
  })

  it('xulosa: faol turlar, kam qolganlar, ombor qiymati (sotuvchiga qiymat chiqmaydi)', async () => {
    const cement = await createProduct({ minStock: 5 })
    await createProduct({ sku: 'ARX', archived: true })
    await testDb.productStock.create({ data: { tenantId: a.tenantId, productId: cement, warehouseId: a.warehouseId, qty: 12.5 } })
    const summary = async (token = auth) =>
      (await http().get('/api/v1/products/summary').set('Authorization', token).expect(200)).body

    expect(await summary()).toEqual({
      active: 1, lowStock: 0, stockValue: Math.round(12.5 * BASE.cost),
      stockValueByCategory: [{ name: '', value: Math.round(12.5 * BASE.cost) }],
    })
    await testDb.product.update({ where: { id: cement }, data: { minStock: 20 } })
    expect(await summary(await bearer(app, a, 'sotuvchi'))).toEqual({ active: 1, lowStock: 1 })
  })

  it('karta raqamlari: sof sotilgan miqdor (qaytarish ayriladi, bekor — hisobda yo‘q), oxirgi sotuv', async () => {
    const id = await createProduct()
    const sale = async (type: 'sale' | 'return', status: 'completed' | 'cancelled', qty: number, date: string) => {
      const count = await testDb.sale.count({ where: { tenantId: a.tenantId } })
      await testDb.sale.create({
        data: {
          tenantId: a.tenantId, number: `CHEK-${1001 + count}`, type, status, subtotal: 1n, total: 1n, paidCash: 1n, date: new Date(date),
          items: { create: [{ tenantId: a.tenantId, productId: id, name: 'x', unit: 'qop', qty, baseQty: qty, price: 1n, cost: 1n, lineNo: 1 }] },
        },
      })
    }
    await sale('sale', 'completed', 10, '2026-09-01')
    await sale('return', 'completed', 2.5, '2026-09-02')
    await sale('sale', 'cancelled', 100, '2026-09-03')
    const stats = (await http().get(`/api/v1/products/${id}/stats`).set('Authorization', auth).expect(200)).body
    expect(stats).toEqual({ soldQty: 7.5, lastSale: '2026-09-01' })
  })

  it('yumshoq o‘chirish va tiklash', async () => {
    const id = await createProduct()
    await http().delete(`/api/v1/products/${id}`).set('Authorization', auth).expect(204)
    await http().get(`/api/v1/products/${id}`).set('Authorization', auth).expect(404)
    expect((await list()).total).toBe(0)

    const restored = await http().post(`/api/v1/products/${id}/restore`).set('Authorization', auth).expect(200)
    expect(restored.body.id).toBe(id)
    expect((await list()).total).toBe(1)
  })

  it('qo‘shimcha birlik koeffitsiyentsiz berilmaydi', async () => {
    await http().post('/api/v1/products').set('Authorization', auth).send({ ...BASE, altUnit: 'kg' }).expect(400)
    await http().post('/api/v1/products').set('Authorization', auth).send({ ...BASE, altUnit: 'kg', altFactor: 0 }).expect(400)
  })

  it('pul butun so‘m, miqdor 3 kasrgacha', async () => {
    await http().post('/api/v1/products').set('Authorization', auth).send({ ...BASE, price: 100.5 }).expect(400)
    await http().post('/api/v1/products').set('Authorization', auth).send({ ...BASE, price: -1 }).expect(400)
    await http().post('/api/v1/products').set('Authorization', auth).send({ ...BASE, minStock: 1.2345 }).expect(400)
    await http().post('/api/v1/products').set('Authorization', auth).send({ ...BASE, unit: 'tonna' }).expect(400)
  })

  it('amallar audit jurnaliga tushadi', async () => {
    const id = await createProduct()
    await http().patch(`/api/v1/products/${id}`).set('Authorization', auth).send({ price: 1 }).expect(200)
    await http().delete(`/api/v1/products/${id}`).set('Authorization', auth).expect(204)

    await vi.waitFor(async () => {
      const actions = await testDb.auditEntry.findMany({
        where: { tenantId: a.tenantId, entityId: id },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      })
      expect(actions.map((x) => x.action)).toEqual(['product.create', 'product.update', 'product.delete'])
    })
  })
})
