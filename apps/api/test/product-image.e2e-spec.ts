import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, pngImage, seedFileRow } from './helpers/files'

const BASE = { name: 'Portland sement M400', sku: 'SEM-400', unit: 'qop', price: 60_000, wholesalePrice: 55_000, cost: 40_000 }

/**
 * Mahsulot rasmi (T-093): rasm — matn emas, `files` ga HAVOLA. Faqat shu
 * do'konning tasdiqlangan `product_image` fayli; yangi rasm eskisining
 * o'rnini oladi (eskisi havolasiz — GC tozalaydi).
 */
describe('Mahsulot rasmi (PATCH /products/:id → imageFileId)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let files: ReturnType<typeof filesApi>
  let productId: string

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
    b = await seedTenant('B do‘kon')
    auth = await bearer(app, a)
    files = filesApi(app, auth)
    productId = (await http().post('/api/v1/products').set('Authorization', auth).send(BASE).expect(201)).body.id
  })

  const http = () => request(app.getHttpServer())
  const patch = (body: Record<string, unknown>, id = productId) =>
    http().patch(`/api/v1/products/${id}`).set('Authorization', auth).send(body)

  it('tayyor rasm ulanadi va mahsulotda qaytadi; yangisi eskisining o‘rnini oladi; null — olib tashlash', async () => {
    const first = await files.upload(await pngImage(40, 40, 1))
    const second = await files.upload(await pngImage(40, 40, 2))

    expect((await patch({ imageFileId: first }).expect(200)).body.imageFileId).toBe(first)
    expect((await http().get(`/api/v1/products/${productId}`).set('Authorization', auth).expect(200)).body.imageFileId).toBe(first)

    await patch({ imageFileId: second }).expect(200)
    expect(await testDb.product.count({ where: { imageFileId: first } })).toBe(0)
    // Boshqa maydon tahriri rasmga tegmaydi
    expect((await patch({ price: 61_000 }).expect(200)).body.imageFileId).toBe(second)

    expect((await patch({ imageFileId: null }).expect(200)).body.imageFileId).toBeNull()
  })

  it('yaratishda ham qabul qilinadi', async () => {
    const image = await files.upload(await pngImage(16, 16))
    const res = await http()
      .post('/api/v1/products')
      .set('Authorization', auth)
      .send({ ...BASE, sku: 'SEM-500', imageFileId: image })
      .expect(201)
    expect(res.body.imageFileId).toBe(image)
  })

  it('boshqa do‘kon fayli, tasdiqlanmagan, o‘chirilgan yoki boshqa turdagi fayl — 422 REFERENCE_NOT_FOUND', async () => {
    const foreign = await seedFileRow(b.tenantId)
    const pending = await seedFileRow(a.tenantId, { status: 'pending' })
    const deleted = await seedFileRow(a.tenantId, { deletedAt: new Date() })
    const avatar = await seedFileRow(a.tenantId, { kind: 'avatar' })
    for (const file of [foreign, pending, deleted, avatar]) {
      const res = await patch({ imageFileId: file.id }).expect(422)
      expect(res.body.errors[0]).toMatchObject({ field: 'imageFileId', code: 'REFERENCE_NOT_FOUND' })
    }
    await patch({ imageFileId: 'rasm.png' }).expect(400)
    expect((await testDb.product.findUniqueOrThrow({ where: { id: productId } })).imageFileId).toBeNull()
  })

  it('fayl o‘chirilsa — mahsulot qoladi, havola uziladi', async () => {
    const image = await files.upload(await pngImage(18, 18))
    await patch({ imageFileId: image }).expect(200)
    await files.remove(image).expect(204)
    const product = await testDb.product.findUniqueOrThrow({ where: { id: productId } })
    expect(product).toMatchObject({ imageFileId: null, deletedAt: null })
  })

  it('mahsulot tiklanganda (undo) tunda "yetim" deb belgilangan rasmi ham qaytadi', async () => {
    const image = await files.upload(await pngImage(19, 19))
    await patch({ imageFileId: image }).expect(200)
    await http().delete(`/api/v1/products/${productId}`).set('Authorization', auth).expect(204)
    // GC (files:gc-orphans) o'chirilgan mahsulot rasmini belgiladi
    await testDb.file.update({ where: { id: image }, data: { deletedAt: new Date() } })

    const res = await http().post(`/api/v1/products/${productId}/restore`).set('Authorization', auth).expect(200)
    expect(res.body.imageFileId).toBe(image)
    await files.raw(image).expect(302)
  })
})
