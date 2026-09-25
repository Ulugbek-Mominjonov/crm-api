import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { seedFileRow } from './helpers/files'
import { collectRoutes, type RouteInfo } from './helpers/routes'

/**
 * Tenant izolyatsiyasi — eng muhim xavfsizlik testi (03-security §3.8).
 *
 * Tekshiriladigan yo'llar QO'LDA yozilmaydi: ular ilovaning marshrutlar
 * ro'yxatidan yig'iladi. `:id` li har bir yo'lga A do'konining tokeni bilan
 * B do'koni yozuvining id'si yuboriladi — javob doim 404 bo'lishi shart
 * (403 emas: u yozuv MAVJUDLIGINI oshkor qilardi).
 *
 * Yangi resurs qo'shilsa va unga B namunasi berilmasa — test yiqiladi.
 */

type Tenant = Awaited<ReturnType<typeof seedTenant>>

interface Sample {
  id: string
  /** PATCH uchun shu resursga YAROQLI tana — aks holda 404 o'rniga 400 kelardi */
  patch: Record<string, unknown>
  /** `POST :id/<amal>` uchun yaroqli tana (amal nomi bo'yicha) */
  post?: Record<string, Record<string, unknown>>
  /** Ro'yxat so'rovi (kursorli ro'yxatda `limit`) */
  listQuery?: string
  /** Ro'yxat yo'li resurs nomidan farq qilsa (`cash` → `cash/shifts`) */
  listPath?: string
  /** Ro'yxati yo'q resurs (fayl faqat havola orqali olinadi) */
  noList?: true
}

const API = '/api/v1/'

/** `/api/v1/clients/:id/restore` → `clients` */
function resourceOf(path: string): string {
  return path.slice(API.length).split('/')[0]!
}

describe('Tenant izolyatsiyasi (A → B)', () => {
  let app: INestApplication
  let routes: RouteInfo[]
  let a: Tenant
  let b: Tenant
  let authA: string
  let samples: Record<string, Sample>

  beforeAll(async () => {
    app = await createTestApp()
    routes = collectRoutes(app)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    a = await seedTenant('A do‘kon')
    b = await seedTenant('B do‘kon')
    authA = await bearer(app, a)
    samples = await seedSamplesOf(b)
  })

  /** B do'konining har bir resursdan bittadan yozuvi */
  async function seedSamplesOf(t: Tenant): Promise<Record<string, Sample>> {
    const tenantId = t.tenantId
    const [warehouse, category, client, supplier] = await Promise.all([
      testDb.warehouse.create({ data: { tenantId, name: 'B skladi' } }),
      testDb.category.create({ data: { tenantId, name: 'B kategoriyasi' } }),
      testDb.client.create({ data: { tenantId, name: 'B mijozi', phone: '+998900000002' } }),
      testDb.supplier.create({ data: { tenantId, name: 'B ta’minotchisi', phone: '+998900000003' } }),
    ])
    const productId = await seedProduct(tenantId, t.warehouseId)
    const line = {
      tenantId, productId, name: 'Sement M400', unit: 'qop' as const, qty: '1', baseQty: '1',
      price: 60_000n, cost: 45_000n, lineNo: 1,
    }
    const sale = await testDb.sale.create({
      data: {
        tenantId, number: 'CHEK-9001', subtotal: 60_000n, total: 60_000n, paidCash: 60_000n,
        date: new Date(), warehouseId: t.warehouseId, items: { create: [line] },
      },
      include: { items: true },
    })
    const shift = await testDb.cashShift.create({ data: { tenantId, openedAt: new Date(), openingBalance: 0n } })
    const expense = await testDb.expense.create({
      data: { tenantId, category: 'rent', amount: 1_000n, method: 'bank', date: new Date() },
    })
    const template = await testDb.expenseTemplate.create({
      data: { tenantId, name: 'B ijara', category: 'rent', amount: 1_000n, method: 'bank', period: 'monthly', dayOfPeriod: 1 },
    })
    const order = await testDb.purchaseOrder.create({
      data: {
        tenantId, number: 'BUY-9001', supplierId: supplier.id, total: 1_000n, date: new Date(),
        items: { create: [{ tenantId, productId, name: 'Sement M400', qty: '1', cost: 1_000n }] },
      },
    })
    const delivery = await testDb.delivery.create({
      data: { tenantId, address: 'B manzil', phone: '+998900000004', scheduledDate: new Date(), standaloneFee: 1_000n },
    })
    const quote = await testDb.quote.create({
      data: { tenantId, number: 'TKLF-9001', subtotal: 60_000n, total: 60_000n, date: new Date(), items: { create: [line] } },
    })
    const file = await seedFileRow(tenantId)
    const exported = await testDb.export.create({
      data: { id: randomUUID(), tenantId, userId: t.userId, resource: 'products', format: 'csv', status: 'ready', fileId: file.id },
    })
    const renamed = { name: 'Buzildi' }
    return {
      warehouses: { id: warehouse.id, patch: renamed },
      categories: { id: category.id, patch: renamed },
      products: { id: productId, patch: renamed },
      clients: { id: client.id, patch: renamed },
      suppliers: { id: supplier.id, patch: renamed },
      employees: { id: t.employeeId, patch: renamed },
      users: { id: t.userId, patch: { email: 'buzildi@crm.uz' } },
      sales: {
        id: sale.id,
        patch: {},
        post: { return: { items: [{ saleItemId: sale.items[0]!.id, qty: 1 }], reason: 'Buzildi' }, cancel: {} },
        listQuery: '?limit=200',
      },
      quotes: { id: quote.id, patch: { note: 'Buzildi' }, post: { convert: { method: 'cash' } } },
      cash: { id: shift.id, patch: {}, listPath: 'cash/shifts' },
      expenses: { id: expense.id, patch: { amount: 1 } },
      'expense-templates': { id: template.id, patch: { amount: 1 } },
      deliveries: { id: delivery.id, patch: { note: 'Buzildi' }, post: { status: { status: 'on_way' } } },
      'purchase-orders': {
        id: order.id,
        patch: { note: 'Buzildi' },
        post: { receive: {}, pay: { amount: 1, method: 'bank' }, cancel: {} },
      },
      files: { id: file.id, patch: {}, noList: true },
      exports: { id: exported.id, patch: {}, noList: true },
    }
  }

  /** B yozuvlarining to'liq holati — hujumdan keyin solishtirish uchun */
  async function snapshotOf(s: Record<string, Sample>): Promise<unknown[]> {
    return Promise.all([
      testDb.warehouse.findUnique({ where: { id: s.warehouses!.id } }),
      testDb.category.findUnique({ where: { id: s.categories!.id } }),
      testDb.product.findUnique({ where: { id: s.products!.id } }),
      testDb.client.findUnique({ where: { id: s.clients!.id } }),
      testDb.supplier.findUnique({ where: { id: s.suppliers!.id } }),
      testDb.employee.findUnique({ where: { id: s.employees!.id } }),
      testDb.user.findUnique({ where: { id: s.users!.id } }),
      testDb.sale.findUnique({ where: { id: s.sales!.id }, include: { items: true } }),
      testDb.quote.findUnique({ where: { id: s.quotes!.id }, include: { items: true } }),
      testDb.cashShift.findUnique({ where: { id: s.cash!.id } }),
      testDb.expense.findUnique({ where: { id: s.expenses!.id } }),
      testDb.expenseTemplate.findUnique({ where: { id: s['expense-templates']!.id } }),
      testDb.purchaseOrder.findUnique({ where: { id: s['purchase-orders']!.id }, include: { items: true } }),
      testDb.delivery.findUnique({ where: { id: s.deliveries!.id } }),
      testDb.file.findUnique({ where: { id: s.files!.id } }),
      testDb.export.findUnique({ where: { id: s.exports!.id } }),
    ])
  }

  const byIdRoutes = (): RouteInfo[] =>
    routes.filter((r) => r.path.startsWith(API) && r.path.includes('/:id'))

  it('`:id` li har bir yo‘l uchun B namunasi bor (yangi resurs unutilmagan)', () => {
    const resources = [...new Set(byIdRoutes().map((r) => resourceOf(r.path)))]
    expect(resources.length).toBeGreaterThan(0)
    expect(resources.filter((res) => !samples[res])).toEqual([])
  })

  it('A tokeni B yozuvini o‘qiy, o‘zgartira, o‘chira va tiklay olmaydi — hammasi 404', async () => {
    const before = await snapshotOf(samples)
    const leaks: string[] = []

    for (const route of byIdRoutes()) {
      const sample = samples[resourceOf(route.path)]!
      const url = route.path.replace(':id', sample.id)
      const req = request(app.getHttpServer())
      // Idempotent amallar kalitsiz 400 berardi — kalit va yaroqli tana bilan
      const action = route.path.split('/').at(-1)!
      const call =
        route.method === 'GET' ? req.get(url)
          : route.method === 'PATCH' ? req.patch(url).send(sample.patch)
            : route.method === 'DELETE' ? req.delete(url)
              : req.post(url).set('Idempotency-Key', randomUUID()).send(sample.post?.[action] ?? {})
      const res = await call.set('Authorization', authA)
      if (res.status !== 404) leaks.push(`${route.method} ${route.path} → ${res.status} ${res.body.code ?? ''}`)
    }

    expect(leaks).toEqual([])
    // Hech bir urinish B ma'lumotini o'zgartirmagan (o'chirish/arxiv/nom)
    expect(await snapshotOf(samples)).toEqual(before)
  })

  it('A ro‘yxatlarida B yozuvlari yo‘q', async () => {
    for (const [resource, sample] of Object.entries(samples)) {
      if (sample.noList) continue
      const path = `${API}${sample.listPath ?? resource}`
      expect(routes.some((r) => r.method === 'GET' && r.path === path), path).toBe(true)
      const res = await request(app.getHttpServer())
        .get(`${path}${sample.listQuery ?? '?pageSize=200'}`)
        .set('Authorization', authA)
        .expect(200)
      // Qisqa ro'yxatlar massiv, qolganlari sahifa (`items`) bo'lib keladi
      const items = (Array.isArray(res.body) ? res.body : res.body.items) as { id: string }[]
      expect(items.map((x) => x.id), path).not.toContain(sample.id)
    }
  })

  it('A boshqa do‘kon yozuviga havola qila olmaydi — 422', async () => {
    const productRes = await request(app.getHttpServer())
      .post('/api/v1/products')
      .set('Authorization', authA)
      .send({
        name: 'Soxta', sku: 'X-1', unit: 'dona', price: 1, wholesalePrice: 1, cost: 1,
        categoryId: samples.categories!.id, supplierId: samples.suppliers!.id,
      })
      .expect(422)
    expect(productRes.body.code).toBe('REFERENCE_NOT_FOUND')

    const userRes = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', authA)
      .send({ employeeId: samples.employees!.id, email: 'x@crm.uz', password: 'Qurilish2026!', role: 'admin' })
      .expect(422)
    expect(userRes.body.code).toBe('REFERENCE_NOT_FOUND')
  })

  it('ommaviy narx B mahsulotiga tegmaydi', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products/bulk-price')
      .set('Authorization', authA)
      .send({ ids: [samples.products!.id], mode: 'set', value: 1, target: 'price' })
      .expect(200)
    expect(res.body.updated).toBe(0)
    const product = await testDb.product.findUniqueOrThrow({ where: { id: samples.products!.id } })
    expect(product.price).not.toBe(1n)
  })

  it('sozlamalar: A o‘zinikini o‘qiydi va o‘zgartiradi, B niki o‘zgarmaydi', async () => {
    await testDb.settings.update({ where: { tenantId: b.tenantId }, data: { storeName: 'B do‘koni' } })

    const own = await request(app.getHttpServer()).get('/api/v1/settings').set('Authorization', authA).expect(200)
    expect(own.body.storeName).not.toBe('B do‘koni')

    await request(app.getHttpServer())
      .patch('/api/v1/settings')
      .set('Authorization', authA)
      .send({ storeName: 'Buzildi', taxRate: 0 })
      .expect(200)
    const bSettings = await testDb.settings.findUniqueOrThrow({ where: { tenantId: b.tenantId } })
    expect(bSettings).toMatchObject({ storeName: 'B do‘koni', taxRate: 12 })
  })
})
