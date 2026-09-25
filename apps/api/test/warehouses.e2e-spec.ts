import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

describe('Omborlar (/warehouses)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
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

  const createWarehouse = async (name: string): Promise<string> => {
    const res = await http()
      .post('/api/v1/warehouses')
      .set('Authorization', auth)
      .send({ name, address: 'Toshkent' })
      .expect(201)
    return res.body.id as string
  }

  it('yaratish va sahifali ro‘yxat', async () => {
    const id = await createWarehouse('  Sklad №2  ')

    const res = await http().get('/api/v1/warehouses').set('Authorization', auth).expect(200)
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 2, pageCount: 1 })
    // Sukut tartib — yaratilish vaqti: sukut ombor birinchi
    expect(res.body.items.map((w: { name: string }) => w.name)).toEqual(['Asosiy ombor', 'Sklad №2'])
    expect(res.body.items[1]).toMatchObject({ id, isDefault: false, archived: false, address: 'Toshkent' })
  })

  it('omborlar bo‘yicha tovar: turlar soni va tannarxdagi qiymat (sotuvchiga qiymat yo‘q)', async () => {
    const second = await createWarehouse('Sklad')
    await seedProduct(a.tenantId, a.warehouseId, { qty: '4', cost: 1_000n })
    await seedProduct(a.tenantId, second, { qty: '2.5', cost: 2_000n })
    await seedProduct(a.tenantId, second, { qty: '0' })
    const stock = async (token = auth) =>
      (await request(app.getHttpServer()).get('/api/v1/warehouses/stock').set('Authorization', token).expect(200)).body
    expect(await stock()).toEqual(expect.arrayContaining([
      { warehouseId: a.warehouseId, productCount: 1, stockValue: 4_000 },
      { warehouseId: second, productCount: 1, stockValue: 5_000 },
    ]))
    expect((await stock(await bearer(app, a, 'sotuvchi')))[0]).not.toHaveProperty('stockValue')
  })

  it('nom tenant ichida noyob → 409 ALREADY_EXISTS; boshqa do‘konda — mumkin', async () => {
    const res = await http()
      .post('/api/v1/warehouses')
      .set('Authorization', auth)
      .send({ name: 'Asosiy ombor' })
      .expect(409)
    expect(res.body.code).toBe('ALREADY_EXISTS')
    expect(res.body.errors[0].field).toBe('name')

    const b = await seedTenant('B do‘kon')
    await http()
      .post('/api/v1/warehouses')
      .set('Authorization', await bearer(app, b))
      .send({ name: 'Sklad' })
      .expect(201)
    await createWarehouse('Sklad')
  })

  it('tahrirlashda ham nom noyob', async () => {
    const id = await createWarehouse('Sklad')
    const res = await http()
      .patch(`/api/v1/warehouses/${id}`)
      .set('Authorization', auth)
      .send({ name: 'Asosiy ombor' })
      .expect(409)
    expect(res.body.code).toBe('ALREADY_EXISTS')
  })

  it('sukut omborni arxivlab bo‘lmaydi → 422 WAREHOUSE_DEFAULT_LOCKED', async () => {
    const res = await http()
      .post(`/api/v1/warehouses/${a.warehouseId}/archive`)
      .set('Authorization', auth)
      .expect(422)
    expect(res.body.code).toBe('WAREHOUSE_DEFAULT_LOCKED')
    const row = await testDb.warehouse.findUniqueOrThrow({ where: { id: a.warehouseId } })
    expect(row.archived).toBe(false)
  })

  it('qoldig‘i bor omborni arxivlash — bajariladi, lekin ogohlantiradi', async () => {
    const id = await createWarehouse('Sklad')
    await seedProduct(a.tenantId, id, { qty: '5' })
    await seedProduct(a.tenantId, id, { qty: '0' })

    const res = await http().post(`/api/v1/warehouses/${id}/archive`).set('Authorization', auth).expect(200)
    expect(res.body).toMatchObject({ id, archived: true, stockWarning: { productCount: 1 } })
  })

  it('bo‘sh omborni arxivlash — ogohlantirishsiz', async () => {
    const id = await createWarehouse('Sklad')
    const res = await http().post(`/api/v1/warehouses/${id}/archive`).set('Authorization', auth).expect(200)
    expect(res.body.stockWarning).toBeNull()
  })

  it('joriy ombor arxivlansa kassa sukut omborga qaytadi', async () => {
    const id = await createWarehouse('Sklad')
    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeWarehouseId: id } })

    await http().post(`/api/v1/warehouses/${id}/archive`).set('Authorization', auth).expect(200)

    const state = await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })
    expect(state.activeWarehouseId).toBe(a.warehouseId)
  })

  it('arxivdan qaytarish va `archived` filtri', async () => {
    const id = await createWarehouse('Sklad')
    await http().post(`/api/v1/warehouses/${id}/archive`).set('Authorization', auth).expect(200)

    const archived = await http().get('/api/v1/warehouses?archived=true').set('Authorization', auth).expect(200)
    expect(archived.body.items.map((w: { id: string }) => w.id)).toEqual([id])
    const active = await http().get('/api/v1/warehouses?archived=false').set('Authorization', auth).expect(200)
    expect(active.body.items.map((w: { id: string }) => w.id)).toEqual([a.warehouseId])

    const restored = await http().post(`/api/v1/warehouses/${id}/restore`).set('Authorization', auth).expect(200)
    expect(restored.body.archived).toBe(false)
  })

  it('sotuvchi faqat o‘qiydi, omborchi boshqaradi', async () => {
    const seller = await bearer(app, a, 'sotuvchi')
    await http().get('/api/v1/warehouses').set('Authorization', seller).expect(200)
    const denied = await http().post('/api/v1/warehouses').set('Authorization', seller).send({ name: 'X' }).expect(403)
    expect(denied.body.code).toBe('PERMISSION_DENIED')

    await http()
      .post('/api/v1/warehouses')
      .set('Authorization', await bearer(app, a, 'omborchi'))
      .send({ name: 'Omborchi skladi' })
      .expect(201)
  })

  it('noto‘g‘ri so‘rovlar: bo‘sh nom, ortiqcha maydon, yaroqsiz id', async () => {
    await http().post('/api/v1/warehouses').set('Authorization', auth).send({ name: '   ' }).expect(400)
    await http()
      .post('/api/v1/warehouses')
      .set('Authorization', auth)
      .send({ name: 'X', isDefault: true })
      .expect(400)
    await http().get('/api/v1/warehouses/emas-uuid').set('Authorization', auth).expect(400)
    await http().get('/api/v1/warehouses?archived=ha').set('Authorization', auth).expect(400)
  })

  it('amallar audit jurnaliga tushadi', async () => {
    const id = await createWarehouse('Sklad')
    await http().post(`/api/v1/warehouses/${id}/archive`).set('Authorization', auth).expect(200)
    // Interceptor jurnalni javobni kutdirmay yozadi — yozuv biroz keyin tushadi
    await vi.waitFor(async () => {
      const actions = await testDb.auditEntry.findMany({
        where: { tenantId: a.tenantId, entityId: id },
        orderBy: { createdAt: 'asc' },
        select: { action: true, entityType: true },
      })
      expect(actions).toEqual([
        { action: 'warehouse.create', entityType: 'warehouse' },
        { action: 'warehouse.archive', entityType: 'warehouse' },
      ])
    })
  })
})
