import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries } from './helpers/queries'

describe('Kategoriyalar (/categories)', () => {
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

  const createCategory = async (name: string, sortOrder?: number): Promise<string> => {
    const res = await http()
      .post('/api/v1/categories')
      .set('Authorization', auth)
      .send({ name, sortOrder })
      .expect(201)
    return res.body.id as string
  }

  /** Kategoriyaga bog'langan mahsulotlar — to'g'ridan-to'g'ri bazaga */
  const seedProductsIn = async (categoryId: string, count: number): Promise<void> => {
    await testDb.product.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        tenantId: a.tenantId,
        categoryId,
        name: `Tovar ${i}`,
        sku: `SKU-${categoryId.slice(0, 4)}-${i}`,
        unit: 'dona' as const,
        price: 1_000n,
        wholesalePrice: 900n,
        cost: 700n,
      })),
    })
  }

  it('tartib berilmasa oxiriga qo‘shiladi; ro‘yxat `sortOrder` bo‘yicha', async () => {
    await createCategory('Sement', 5)
    await createCategory('Bo‘yoq', 1)
    await createCategory('Asboblar')

    const res = await http().get('/api/v1/categories').set('Authorization', auth).expect(200)
    expect(res.body.items.map((c: { name: string; sortOrder: number }) => [c.name, c.sortOrder])).toEqual([
      ['Bo‘yoq', 1],
      ['Sement', 5],
      ['Asboblar', 6],
    ])
    expect(res.body.items[0].productCount).toBe(0)
  })

  it('nom do‘kon ichida noyob → 409 ALREADY_EXISTS', async () => {
    await createCategory('Sement')
    const res = await http().post('/api/v1/categories').set('Authorization', auth).send({ name: 'Sement' }).expect(409)
    expect(res.body).toMatchObject({ code: 'ALREADY_EXISTS', errors: [{ field: 'name' }] })
  })

  it('D4: nomni o‘zgartirish — BITTA UPDATE, mahsulotlarga tegilmaydi', async () => {
    const id = await createCategory('Sement')
    await seedProductsIn(id, 3)

    const { queries, result } = await captureQueries(() =>
      http().patch(`/api/v1/categories/${id}`).set('Authorization', auth).send({ name: 'Sement va aralashmalar' }),
    )
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ name: 'Sement va aralashmalar', productCount: 3 })

    const updates = queries.filter((q) => /^\s*UPDATE/i.test(q))
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatch(/"categories"/)
    expect(queries.some((q) => /UPDATE\s+"public"\."products"/i.test(q))).toBe(false)
    expect(await testDb.product.count({ where: { categoryId: id } })).toBe(3)
  })

  it('ishlatilayotgan kategoriya o‘chmaydi → 409 CATEGORY_IN_USE', async () => {
    const id = await createCategory('Sement')
    await seedProductsIn(id, 2)

    const res = await http().delete(`/api/v1/categories/${id}`).set('Authorization', auth).expect(409)
    expect(res.body.code).toBe('CATEGORY_IN_USE')
    expect(res.body.errors[0].meta).toEqual({ productCount: 2 })
    const row = await testDb.category.findUniqueOrThrow({ where: { id } })
    expect(row.deletedAt).toBeNull()
  })

  it('o‘chirilgan mahsulot kategoriyani band qilmaydi', async () => {
    const id = await createCategory('Sement')
    await seedProductsIn(id, 1)
    await testDb.product.updateMany({ where: { categoryId: id }, data: { deletedAt: new Date() } })

    await http().delete(`/api/v1/categories/${id}`).set('Authorization', auth).expect(204)
  })

  it('yumshoq o‘chirish va tiklash (undo)', async () => {
    const id = await createCategory('Sement')

    await http().delete(`/api/v1/categories/${id}`).set('Authorization', auth).expect(204)
    await http().get(`/api/v1/categories/${id}`).set('Authorization', auth).expect(404)
    const list = await http().get('/api/v1/categories').set('Authorization', auth).expect(200)
    expect(list.body.total).toBe(0)
    // Takroriy o'chirish — 404 (yozuv allaqachon o'chirilgan)
    await http().delete(`/api/v1/categories/${id}`).set('Authorization', auth).expect(404)

    const restored = await http().post(`/api/v1/categories/${id}/restore`).set('Authorization', auth).expect(200)
    expect(restored.body).toMatchObject({ id, name: 'Sement' })
    await http().get(`/api/v1/categories/${id}`).set('Authorization', auth).expect(200)
  })

  it('qidiruv nom bo‘yicha (katta-kichik harfga qaramay)', async () => {
    await createCategory('Sement va aralashmalar')
    await createCategory('Bo‘yoq')
    const res = await http().get('/api/v1/categories?q=SEMENT').set('Authorization', auth).expect(200)
    expect(res.body.items.map((c: { name: string }) => c.name)).toEqual(['Sement va aralashmalar'])
  })

  it('sotuvchi o‘qiydi, lekin o‘zgartira olmaydi', async () => {
    const seller = await bearer(app, a, 'sotuvchi')
    await http().get('/api/v1/categories').set('Authorization', seller).expect(200)
    await http().post('/api/v1/categories').set('Authorization', seller).send({ name: 'X' }).expect(403)
  })
})
