import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import sharp from 'sharp'
import request from 'supertest'
import { FileGcJobs, ORPHAN_GRACE_MS, PURGE_AFTER_MS } from '@/modules/files/files.jobs'
import { ImageVariantsWorker } from '@/modules/files/image-variants.worker'
import { S3Service } from '@/modules/files/s3.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, seedFileRow } from './helpers/files'
import { connect, listen, record, settle, until } from './helpers/realtime'

const MB = 1024 * 1024
const ago = (ms: number) => new Date(Date.now() - ms - 60_000)

/** Shaffof PNG (alfa kanal bilan) — keng logotip */
const logoPng = (width = 600, height = 200, g = 120): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 4, background: { r: 20, g, b: 90, alpha: 0.5 } } }).png().toBuffer()

/** PDF ichida rasm bormi (`/Subtype /Image` obyekt) */
const hasImage = (pdf: Buffer): boolean => pdf.toString('latin1').includes('/Subtype /Image')

/**
 * Do'kon brendi (Q117, frontend 09-brend): `brandColor` va `logoFileId`
 * sozlamada, `store_logo` fayl turi, do'kon nomi bitta manbada,
 * `settings.updated` hodisasi va chek PDF'idagi logotip.
 */
describe('Do‘kon brendi: rang va logotip', () => {
  let app: INestApplication
  let url: string
  let s3: S3Service
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let files: ReturnType<typeof filesApi>

  beforeAll(async () => {
    app = await createTestApp()
    url = await listen(app)
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
    b = await seedTenant('B do‘kon')
    auth = await bearer(app, a)
    files = filesApi(app, auth)
  })

  const http = () => request(app.getHttpServer())
  const patch = (body: Record<string, unknown>, who = auth) =>
    http().patch('/api/v1/settings').set('Authorization', who).send(body)
  const uploadLogo = async (body?: Buffer) => files.upload(body ?? (await logoPng()), 'store_logo', 'image/png')
  const logoRow = (id: string) => testDb.file.findUniqueOrThrow({ where: { id } })

  it('brend sozlanmagan do‘kon: kalitlar BOR va null (frontend serverni shunday aniqlaydi)', async () => {
    const res = await http().get('/api/v1/settings').set('Authorization', await bearer(app, a, 'sotuvchi')).expect(200)
    expect(res.body).toHaveProperty('brandColor', null)
    expect(res.body).toHaveProperty('logoFileId', null)
  })

  it('brandColor katta harfda saqlanadi, null — standart; noto‘g‘ri rang — 400', async () => {
    expect((await patch({ brandColor: '#1a7f5a' }).expect(200)).body.brandColor).toBe('#1A7F5A')
    expect((await http().get('/api/v1/settings').set('Authorization', auth).expect(200)).body.brandColor).toBe('#1A7F5A')
    expect((await patch({ brandColor: null }).expect(200)).body.brandColor).toBeNull()

    for (const brandColor of ['red', '#12345', '#1234567', '1A7F5A', '#GGGGGG']) {
      const res = await patch({ brandColor }).expect(400)
      expect(res.body.code).toBe('VALIDATION_FAILED')
      expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'brandColor' })]))
    }
  })

  it('logoFileId: begona do‘kon, boshqa tur va tasdiqlanmagan fayl — 400 (field: logoFileId)', async () => {
    const foreign = await seedFileRow(b.tenantId, { kind: 'store_logo' })
    const productImage = await seedFileRow(a.tenantId, { kind: 'product_image' })
    const pending = await seedFileRow(a.tenantId, { kind: 'store_logo', status: 'pending' })
    for (const { id } of [foreign, productImage, pending]) {
      const res = await patch({ logoFileId: id }).expect(400)
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'logoFileId' }] })
    }
    expect((await testDb.settings.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).logoFileId).toBeNull()
  })

  it('logotip almashtirilsa va olib tashlansa eski fayl o‘chirishga belgilanadi; jurnalda — o‘zgarish', async () => {
    const first = await uploadLogo()
    expect((await patch({ logoFileId: first, brandColor: '#00825a' }).expect(200)).body).toMatchObject({
      logoFileId: first,
      brandColor: '#00825A',
    })

    const second = await uploadLogo(await logoPng(300, 300, 40))
    await patch({ logoFileId: second }).expect(200)
    expect((await logoRow(first)).deletedAt).not.toBeNull()
    expect((await logoRow(second)).deletedAt).toBeNull()

    expect((await patch({ logoFileId: null }).expect(200)).body.logoFileId).toBeNull()
    expect((await logoRow(second)).deletedAt).not.toBeNull()

    const entries = await testDb.auditEntry.findMany({ where: { tenantId: a.tenantId, action: 'settings.update' }, orderBy: { createdAt: 'asc' } })
    expect(entries.map((e) => e.diff)).toEqual([
      { logoFileId: { from: null, to: first }, brandColor: { from: null, to: '#00825A' } },
      { logoFileId: { from: first, to: second } },
      { logoFileId: { from: second, to: null } },
    ])
  })

  it('store_logo: SVG rad etiladi, 1 MB dan katta — 413; sotuvchi yuklay olmaydi, lekin havolani oladi', async () => {
    const svg = await files.presign({ kind: 'store_logo', mime: 'image/svg+xml', size: 100, sha256: 'a'.repeat(64) }).expect(400)
    expect(svg.body.code).toBe('VALIDATION_FAILED')
    const big = await files.presign({ kind: 'store_logo', mime: 'image/png', size: MB + 1, sha256: 'b'.repeat(64) }).expect(413)
    expect(big.body.code).toBe('PAYLOAD_TOO_LARGE')

    const logo = await uploadLogo()
    for (const role of ['sotuvchi', 'omborchi'] as const) {
      const seller = filesApi(app, await bearer(app, a, role))
      expect((await seller.presign({ kind: 'store_logo', mime: 'image/png', size: 100, sha256: 'c'.repeat(64) }).expect(403)).body.code)
        .toBe('PERMISSION_DENIED')
      const urls = await http().get(`/api/v1/files/urls?ids=${logo}&variant=512`).set('Authorization', await bearer(app, a, role)).expect(200)
      expect(Object.keys(urls.body.urls)).toEqual([logo])
      await seller.raw(logo, '128').expect(302)
    }
  })

  it('variantlar 128 va 512: kvadratga sig‘adi (nisbat saqlanadi), shaffoflik saqlanadi', async () => {
    const id = await uploadLogo(await logoPng(1024, 256))
    expect(await app.get(ImageVariantsWorker).processPending()).toBe(1)
    const { variants } = await logoRow(id)
    expect(variants).toEqual({ 128: `t/${a.tenantId}/logos/${id}/128.webp`, 512: `t/${a.tenantId}/logos/${id}/512.webp` })
    for (const size of [128, 512]) {
      const meta = await sharp(await s3.getBuffer('media', `t/${a.tenantId}/logos/${id}/${size}.webp`)).metadata()
      expect(meta).toMatchObject({ format: 'webp', width: size, height: size / 4, hasAlpha: true })
    }
  })

  it('storeName do‘kon nomini ham o‘zgartiradi (kirishdagi tanlov, /auth/me)', async () => {
    await patch({ storeName: 'Yangi Qurilish' }).expect(200)
    expect((await testDb.tenant.findUniqueOrThrow({ where: { id: a.tenantId } })).name).toBe('Yangi Qurilish')
    const me = await http().get('/api/v1/auth/me').set('Authorization', auth).expect(200)
    expect(me.body.tenant.name).toBe('Yangi Qurilish')
    expect((await testDb.tenant.findUniqueOrThrow({ where: { id: b.tenantId } })).name).toBe('B do‘kon')
  })

  it('settings.updated — faqat shu do‘kon xonasiga; rad etilgan o‘zgarishda — yo‘q', async () => {
    const token = async (who: typeof a) => (await bearer(app, who, 'sotuvchi')).slice('Bearer '.length)
    const mine = await connect(url, { token: await token(a) })
    const other = await connect(url, { token: await token(b) })
    try {
      const gotMine = record(mine)
      const gotOther = record(other)
      await patch({ brandColor: 'red' }).expect(400)
      await settle()
      expect(gotMine).toEqual([])

      await patch({ brandColor: '#1A7F5A' }).expect(200)
      await until(() => gotMine.length > 0)
      await settle()
      expect(gotMine).toEqual([{ type: 'settings.updated', payload: {} }])
      expect(gotOther).toEqual([])
    } finally {
      mine.close()
      other.close()
    }
  })

  it('logotip fayli o‘chirilsa (DELETE /files/:id) — sozlamadan uziladi', async () => {
    const logo = await uploadLogo()
    await patch({ logoFileId: logo }).expect(200)
    await files.remove(logo).expect(204)
    expect((await http().get('/api/v1/settings').set('Authorization', auth).expect(200)).body.logoFileId).toBeNull()
  })

  it('GC: ulanmagan logotip o‘chirishga belgilanadi; faol logotip hech qachon tozalanmaydi', async () => {
    const gc = app.get(FileGcJobs)
    const unused = await uploadLogo(await logoPng(100, 100, 10))
    const active = await uploadLogo(await logoPng(100, 100, 20))
    await patch({ logoFileId: active }).expect(200)
    await testDb.file.updateMany({ where: { id: { in: [unused, active] } }, data: { createdAt: ago(ORPHAN_GRACE_MS) } })

    await gc.gcOrphans()
    expect((await logoRow(unused)).deletedAt).not.toBeNull()
    expect((await logoRow(active)).deletedAt).toBeNull()

    // Qayta tekshiruv: belgisi bo'lsa ham havolasi bor fayl o'chmaydi
    await testDb.file.update({ where: { id: active }, data: { deletedAt: ago(PURGE_AFTER_MS) } })
    await gc.purge()
    expect(await testDb.file.findUnique({ where: { id: active } })).not.toBeNull()
  })

  it('chek PDF: logotipli do‘konda rasm bor; fayl yo‘q yoki buzilgan bo‘lsa — logotipsiz, xatosiz', async () => {
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    const product = await seedProduct(a.tenantId, a.warehouseId)
    await openShift(a.tenantId)
    const sale = await http()
      .post('/api/v1/sales')
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ productId: product, qty: 1 }], paid: { cash: 60_000, card: 0, transfer: 0 } })
      .expect(201)
    const pdf = async (): Promise<Buffer> =>
      (
        await http()
          .get(`/api/v1/sales/${sale.body.id}/receipt?format=pdf`)
          .set('Authorization', auth)
          .buffer(true)
          .parse((response, done) => {
            const chunks: Buffer[] = []
            response.on('data', (chunk: Buffer) => chunks.push(chunk))
            response.on('end', () => done(null, Buffer.concat(chunks)))
          })
          .expect(200)
      ).body as Buffer

    expect(hasImage(await pdf())).toBe(false)

    const logo = await uploadLogo()
    await patch({ logoFileId: logo }).expect(200)
    const json = await http().get(`/api/v1/sales/${sale.body.id}/receipt`).set('Authorization', auth).expect(200)
    expect(json.body.store.logoFileId).toBe(logo)
    expect(hasImage(await pdf())).toBe(true)

    // Buzilgan logotip (obyekt S3'da yo'q) — chek baribir chiqadi
    const broken = await uploadLogo(await logoPng(50, 50, 200))
    await patch({ logoFileId: broken }).expect(200)
    await s3.delete('media', [(await logoRow(broken)).key])
    expect(hasImage(await pdf())).toBe(false)
  })
})
