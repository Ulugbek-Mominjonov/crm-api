import type { INestApplication } from '@nestjs/common'
import sharp from 'sharp'
import { ImageVariantsWorker } from '@/modules/files/image-variants.worker'
import { S3Service } from '@/modules/files/s3.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, pngImage, putSigned, sha256 } from './helpers/files'

/**
 * Rasm variantlari (T-091, 09 §9.8): `128` va `512` WebP fonda yasaladi;
 * tayyor bo'lguncha `orig` beriladi. Ishchi testda qo'lda chaqiriladi
 * (`FILE_VARIANTS_INTERVAL_MS=0`).
 */
describe('Rasm variantlari (ImageVariantsWorker)', () => {
  let app: INestApplication
  let worker: ImageVariantsWorker
  let s3: S3Service
  let a: Awaited<ReturnType<typeof seedTenant>>
  let files: ReturnType<typeof filesApi>

  beforeAll(async () => {
    app = await createTestApp()
    worker = app.get(ImageVariantsWorker)
    s3 = app.get(S3Service)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    a = await seedTenant('A do‘kon')
    files = filesApi(app, await bearer(app, a))
  })

  it('128 va 512 WebP yasaladi; raw?variant= endi variantga yo‘naltiradi', async () => {
    const id = await files.upload(await pngImage(1200, 900))
    expect(await worker.processPending()).toBe(1)

    const row = await testDb.file.findUniqueOrThrow({ where: { id } })
    expect(row.variants).toEqual({
      128: `t/${a.tenantId}/products/${id}/128.webp`,
      512: `t/${a.tenantId}/products/${id}/512.webp`,
    })
    for (const width of [128, 512]) {
      const meta = await sharp(await s3.getBuffer('media', `t/${a.tenantId}/products/${id}/${width}.webp`)).metadata()
      expect(meta).toMatchObject({ format: 'webp', width, height: (width * 3) / 4 })
    }
    expect((await files.get(id).expect(200)).body.variants).toEqual(['128', '512'])
    const res = await files.raw(id, '512').expect(302)
    expect(new URL(res.headers.location!).pathname).toMatch(/\/512\.webp$/)

    // Navbat bo'sh — ikkinchi aylanish ish qilmaydi
    expect(await worker.processPending()).toBe(0)
  })

  it('kichik rasm kattalashtirilmaydi (withoutEnlargement)', async () => {
    const id = await files.upload(await pngImage(100, 50))
    await worker.processPending()
    const meta = await sharp(await s3.getBuffer('media', `t/${a.tenantId}/products/${id}/512.webp`)).metadata()
    expect(meta).toMatchObject({ width: 100, height: 50 })
  })

  it('o‘qib bo‘lmaydigan rasm — variantsiz qoladi ({}), qayta urinilmaydi, orig beriladi', async () => {
    // Sehrli baytlari to'g'ri, ichi buzilgan PNG — tasdiqlashdan o'tadi, sharp o'qiy olmaydi
    const png = await pngImage(64, 64)
    const broken = Buffer.concat([png.subarray(0, 16), Buffer.alloc(png.length - 16, 7)])
    const res = await files
      .presign({ kind: 'product_image', mime: 'image/png', size: broken.length, sha256: sha256(broken) })
      .expect(200)
    await putSigned(res.body.upload, broken)
    await files.confirm(res.body.file.id).expect(200)

    expect(await worker.processPending()).toBe(0)
    expect((await testDb.file.findUniqueOrThrow({ where: { id: res.body.file.id } })).variants).toEqual({})
    expect(await worker.processPending()).toBe(0)
    const raw = await files.raw(res.body.file.id, '128').expect(302)
    expect(new URL(raw.headers.location!).pathname).toMatch(/\/orig\.png$/)
  })

  it('asl obyekt yo‘q — variantsiz; boshqa turdagi va o‘chirilgan fayllar navbatga kirmaydi', async () => {
    const lost = await files.upload(await pngImage(30, 30))
    const key = (await testDb.file.findUniqueOrThrow({ where: { id: lost } })).key
    await s3.delete('media', [key])
    const deleted = await files.upload(await pngImage(31, 31))
    await files.remove(deleted).expect(204)
    await files.upload(Buffer.from('nom;narx\n'), 'import', 'text/csv')

    expect(await worker.processPending()).toBe(0)
    expect((await testDb.file.findUniqueOrThrow({ where: { id: lost } })).variants).toEqual({})
    expect((await testDb.file.findUniqueOrThrow({ where: { id: deleted } })).variants).toBeNull()
  })
})
