import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { S3Service } from '@/modules/files/s3.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { pngImage } from './helpers/files'
import { storeSnapshot } from './helpers/snapshot'

const dataUrl = (mime: string, body: Buffer) => `data:${mime};base64,${body.toString('base64')}`

/**
 * Rasmlarni ko'chirish (T-111, 09 §9.14): `dataURL` → S3 (`files`,
 * product_image). Noto'g'ri, katta yoki boshqa tarkibli rasm o'tkaziladi
 * va hisobotga yoziladi — migratsiya to'xtamaydi.
 */
describe('Migratsiya: rasmlar', () => {
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

  const withImages = async (images: Record<string, string>) => {
    const snapshot = storeSnapshot({ clean: true })
    const extra = Object.keys(images).map((id, i) => ({
      id, name: `Rasmli ${i}`, sku: `IMG-${i}`, category: 'Sement', unit: 'dona', price: 1_000, wholesalePrice: 900,
      cost: 700, stock: 1, minStock: 0, image: images[id],
    }))
    return { ...snapshot, data: { ...snapshot.data, products: [...snapshot.data.products, ...extra] } }
  }

  it('to‘g‘ri rasm — S3’ga, mahsulotga ulanadi; noto‘g‘ri/katta/boshqa tarkib — o‘tkaziladi, import davom etadi', async () => {
    const png = await pngImage(40, 30)
    const snapshot = await withImages({
      im_ok: dataUrl('image/png', png),
      im_svg: dataUrl('image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')),
      im_fake: dataUrl('image/png', Buffer.from('<html>emas</html>')),
      im_big: dataUrl('image/jpeg', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(6 * 1024 * 1024)])),
      im_broken: 'data:image/png;base64,@@@',
    })
    const res = await request(app.getHttpServer()).post('/api/v1/migration/import').set('Authorization', auth).send(snapshot).expect(200)

    const skipped = res.body.issues.filter((i: { code: string }) => i.code === 'IMAGE_SKIPPED').map((i: { id: string }) => i.id).sort()
    expect(skipped).toEqual(['im_big', 'im_broken', 'im_fake', 'im_svg'])

    const ok = await testDb.product.findFirstOrThrow({ where: { tenantId: a.tenantId, sku: 'IMG-0' }, include: { image: true } })
    expect(ok.image).toMatchObject({ kind: 'product_image', status: 'ready', mime: 'image/png', sizeBytes: BigInt(png.length) })
    expect((await app.get(S3Service).getBuffer('media', ok.image!.key)).equals(png)).toBe(true)
    // Hajm hisoblagichi (kvota) ham yangilangan; rasmsiz qolganlar — import qilingan
    const state = await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })
    expect(state.storageUsedBytes).toBeGreaterThanOrEqual(BigInt(png.length))
    expect(await testDb.product.count({ where: { tenantId: a.tenantId, sku: { startsWith: 'IMG-' } } })).toBe(5)
    expect(await testDb.product.count({ where: { tenantId: a.tenantId, sku: { startsWith: 'IMG-' }, imageFileId: null } })).toBe(4)
  })

  it('bir xil rasm ko‘p mahsulotda — bitta fayl (takroriylik, 09 §9.9); qayta import — yangi fayl yo‘q', async () => {
    const png = dataUrl('image/png', await pngImage(20, 20))
    const snapshot = await withImages({ im_a: png, im_b: png })
    await request(app.getHttpServer()).post('/api/v1/migration/import').set('Authorization', auth).send(snapshot).expect(200)
    await request(app.getHttpServer()).post('/api/v1/migration/import').set('Authorization', auth).send(snapshot).expect(200)
    const images = await testDb.product.findMany({ where: { tenantId: a.tenantId, sku: { in: ['IMG-0', 'IMG-1'] } }, select: { imageFileId: true } })
    expect(new Set(images.map((i) => i.imageFileId)).size).toBe(1)
    // Fikstura mahsuloti (G'isht) + bitta umumiy rasm
    expect(await testDb.file.count({ where: { tenantId: a.tenantId } })).toBe(2)
  })
})
