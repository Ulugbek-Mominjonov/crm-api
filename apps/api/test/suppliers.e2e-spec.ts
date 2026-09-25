import type { INestApplication } from '@nestjs/common'
import type { POStatus } from '@prisma/client'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

describe('Ta’minotchilar (/suppliers)', () => {
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

  const createSupplier = async (body: Record<string, unknown> = {}): Promise<string> => {
    const res = await http()
      .post('/api/v1/suppliers')
      .set('Authorization', auth)
      .send({ name: 'Bekabad Sement', phone: '+998 71 200 10 10', tin: '201234567', ...body })
      .expect(201)
    return res.body.id as string
  }

  /** Kirim buyurtmasi — xarid moduli (E8) hali yo'q, shuning uchun bazaga */
  const seedOrder = async (supplierId: string, status: POStatus): Promise<void> => {
    const count = await testDb.purchaseOrder.count({ where: { tenantId: a.tenantId } })
    await testDb.purchaseOrder.create({
      data: {
        tenantId: a.tenantId, number: `BUY-${1001 + count}`, supplierId, status,
        total: 100_000n, date: new Date('2026-09-01'),
      },
    })
  }

  it('STIR formati tekshiriladi — aniq 9 raqam', async () => {
    for (const tin of ['20123456', '2012345678', 'ABC123456', '201 234 567']) {
      const res = await http()
        .post('/api/v1/suppliers')
        .set('Authorization', auth)
        .send({ name: 'X', phone: '+998712001010', tin })
        .expect(400)
      expect(res.body.detail).toMatch(/STIR/)
    }
    const id = await createSupplier({ tin: '302556677' })
    const row = await testDb.supplier.findUniqueOrThrow({ where: { id } })
    expect(row.tin).toBe('302556677')
  })

  it('STIR ixtiyoriy: bo‘sh qiymat null bo‘lib saqlanadi', async () => {
    const res = await http()
      .post('/api/v1/suppliers')
      .set('Authorization', auth)
      .send({ name: 'Bozor', phone: '+998901112233', tin: '' })
      .expect(201)
    expect(res.body).toMatchObject({ tin: null, contactPerson: null, phone: '+998901112233' })
  })

  it('ochiq buyurtmasi bor ta’minotchini o‘chirish → 409 SUPPLIER_HAS_OPEN_ORDERS', async () => {
    const id = await createSupplier()
    await seedOrder(id, 'ordered')
    await seedOrder(id, 'partial')

    const res = await http().delete(`/api/v1/suppliers/${id}`).set('Authorization', auth).expect(409)
    expect(res.body.code).toBe('SUPPLIER_HAS_OPEN_ORDERS')
    expect(res.body.errors[0].meta).toEqual({ openOrders: 2 })
  })

  it('yopilgan buyurtmalar (qabul qilingan, bekor) o‘chirishga to‘sqinlik qilmaydi', async () => {
    const id = await createSupplier()
    await seedOrder(id, 'received')
    await seedOrder(id, 'cancelled')

    await http().delete(`/api/v1/suppliers/${id}`).set('Authorization', auth).expect(204)
    const list = await http().get('/api/v1/suppliers').set('Authorization', auth).expect(200)
    expect(list.body.total).toBe(0)
    await http().post(`/api/v1/suppliers/${id}/restore`).set('Authorization', auth).expect(200)
  })

  it('qidiruv: nom, aloqa shaxsi, STIR', async () => {
    await createSupplier({ name: 'Bekabad Sement', contactPerson: 'Rustam Aliyev', tin: '201234567' })
    await createSupplier({ name: 'MetalTrade', phone: '+998712447788', tin: '403889900' })

    const names = async (q: string) =>
      (await http().get(`/api/v1/suppliers?q=${encodeURIComponent(q)}`).set('Authorization', auth).expect(200)).body.items.map(
        (s: { name: string }) => s.name,
      )
    expect(await names('metal')).toEqual(['MetalTrade'])
    expect(await names('rustam')).toEqual(['Bekabad Sement'])
    expect(await names('4038899')).toEqual(['MetalTrade'])
  })

  it('ro‘yxat: har qatorda mahsulotlar soni va qarz, do‘kon bo‘yicha jami; faqat qarzdorlar filtri', async () => {
    const withDebt = await createSupplier({ name: 'Qarzli', tin: '201234561' })
    const clean = await createSupplier({ name: 'Toza', tin: '201234562' })
    await testDb.purchaseOrder.create({
      data: { tenantId: a.tenantId, number: 'BUY-2001', supplierId: withDebt, status: 'partial', total: 900_000n, receivedValue: 600_000n, paid: 100_000n, date: new Date('2026-09-01') },
    })
    await seedProduct(a.tenantId, a.warehouseId, { supplierId: withDebt })
    const list = async (query: Record<string, string> = {}) =>
      (await http().get('/api/v1/suppliers').set('Authorization', auth).query(query).expect(200)).body

    const all = await list()
    expect(all.items.map((s: { id: string; debt: number; productCount: number }) => [s.id, s.debt, s.productCount])).toEqual(
      expect.arrayContaining([[withDebt, 500_000, 1], [clean, 0, 0]]),
    )
    expect((await list({ withDebt: 'true' })).items.map((s: { id: string }) => s.id)).toEqual([withDebt])
    expect((await http().get('/api/v1/suppliers/summary').set('Authorization', auth).expect(200)).body)
      .toEqual({ debt: 500_000, suppliersWithDebt: 1 })
  })

  it('sotuvchi faqat ko‘radi, omborchi boshqaradi', async () => {
    const seller = await bearer(app, a, 'sotuvchi')
    await http().get('/api/v1/suppliers').set('Authorization', seller).expect(200)
    await http()
      .post('/api/v1/suppliers')
      .set('Authorization', seller)
      .send({ name: 'X', phone: '+998712001010' })
      .expect(403)
    await http()
      .post('/api/v1/suppliers')
      .set('Authorization', await bearer(app, a, 'omborchi'))
      .send({ name: 'X', phone: '+998712001010' })
      .expect(201)
  })
})
