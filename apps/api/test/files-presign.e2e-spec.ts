import type { INestApplication } from '@nestjs/common'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, pngImage, putSigned, sha256 } from './helpers/files'

const MB = 1024 * 1024

/**
 * Yuklash ruxsati (T-088, 09 §9.6/§9.9/§9.11): oq ro'yxat, hajm chegarasi,
 * kvota presign'dan OLDIN, kalitni faqat server yasaydi, takroriy tarkib
 * qayta ishlatiladi.
 */
describe('Presign (POST /files/presign)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let files: ReturnType<typeof filesApi>

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
    files = filesApi(app, await bearer(app, a))
  })

  const image = (size = 1000, sha = 'a'.repeat(64)) => ({ kind: 'product_image', mime: 'image/png', size, sha256: sha })

  it('kalit server yasaydi: t/{tenant}/products/{id}/orig.png; PUT havolasi 10 daqiqa', async () => {
    const res = await files.presign({ ...image(), originalName: '../../etc/passwd.png' }).expect(200)
    expect(res.body).toMatchObject({
      reused: false,
      file: { kind: 'product_image', mime: 'image/png', sizeBytes: 1000, status: 'pending', originalName: '../../etc/passwd.png' },
      upload: { method: 'PUT', headers: { 'Content-Type': 'image/png' } },
    })
    const row = await testDb.file.findUniqueOrThrow({ where: { id: res.body.file.id } })
    expect(row.key).toBe(`t/${a.tenantId}/products/${row.id}/orig.png`)
    expect(row.uploadedById).toBe(a.userId)

    const url = new URL(res.body.upload.url)
    expect(url.pathname).toContain(row.key)
    expect(Number(url.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(600)
    expect(new Date(res.body.upload.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(600_000)
  })

  it('oq ro‘yxatdan tashqari MIME — 400 (SVG, HTML, turga mos kelmaydigan)', async () => {
    for (const mime of ['image/svg+xml', 'text/html', 'application/pdf']) {
      const res = await files.presign({ ...image(), mime }).expect(400)
      expect(res.body.errors[0]).toMatchObject({ field: 'mime', code: 'VALIDATION_FAILED' })
    }
    await files.presign({ ...image(), kind: 'noma’lum' }).expect(400)
    await files.presign({ ...image(), sha256: 'XYZ' }).expect(400)
    expect(await testDb.file.count()).toBe(0)
  })

  it('hajm chegarasi: tur (rasm 5 MB) va tarif (free — 5 MB) — 413', async () => {
    const res = await files.presign(image(5 * MB + 1)).expect(413)
    expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', errors: [{ field: 'size', meta: { max: 5 * MB } }] })
    // Hujjat turi 10 MB gacha, lekin free tarifda bitta fayl 5 MB
    await files.presign({ kind: 'document', mime: 'application/pdf', size: 6 * MB, sha256: 'b'.repeat(64) }).expect(413)
    await testDb.tenant.update({ where: { id: a.tenantId }, data: { plan: 'basic' } })
    await files.presign({ kind: 'document', mime: 'application/pdf', size: 6 * MB, sha256: 'b'.repeat(64) }).expect(200)
  })

  it('kvota presign’dan OLDIN tekshiriladi — 413 STORAGE_QUOTA_EXCEEDED, qator yaratilmaydi', async () => {
    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { storageUsedBytes: BigInt(200 * MB - 500) } })
    const res = await files.presign(image(1000)).expect(413)
    expect(res.body).toMatchObject({ code: 'STORAGE_QUOTA_EXCEEDED', errors: [{ meta: { used: 200 * MB - 500, limit: 200 * MB } }] })
    expect(await testDb.file.count()).toBe(0)
    await files.presign(image(500)).expect(200)
  })

  it('takroriy tarkib: tayyor fayl qayta ishlatiladi (havola yo‘q), kutilayotganga — yangi havola', async () => {
    const body = await pngImage(32, 32)
    const id = await files.upload(body)

    const again = await files.presign({ ...image(body.length, sha256(body)), originalName: 'boshqa.png' }).expect(200)
    expect(again.body).toMatchObject({ reused: true, upload: null, file: { id, status: 'ready' } })

    const first = await files.presign(image(10)).expect(200)
    const second = await files.presign(image(20)).expect(200)
    expect(second.body).toMatchObject({ reused: false, file: { id: first.body.file.id, sizeBytes: 20 } })
    expect(second.body.upload.url).not.toBe(first.body.upload.url)
    expect(await testDb.file.count()).toBe(2)
  })

  it('o‘chirilgan fayl shu tarkib bilan qayta yuklansa — tiklanadi', async () => {
    const body = await pngImage(24, 24)
    const id = await files.upload(body)
    await files.remove(id).expect(204)
    const res = await files.presign(image(body.length, sha256(body))).expect(200)
    expect(res.body).toMatchObject({ reused: true, file: { id, status: 'ready' } })
    await files.get(id).expect(200)
  })

  it('bir vaqtdagi ikki presign bir tarkib bilan — bitta qator, xatosiz', async () => {
    const [x, y] = await Promise.all([files.presign(image(10)), files.presign(image(10))])
    expect([x.status, y.status]).toEqual([200, 200])
    expect(x.body.file.id).toBe(y.body.file.id)
    expect(await testDb.file.count()).toBe(1)
  })

  it('huquq tur bo‘yicha: sotuvchi mahsulot rasmini yuklay olmaydi; omborchi eksportni — ham', async () => {
    const seller = filesApi(app, await bearer(app, a, 'sotuvchi'))
    expect((await seller.presign(image()).expect(403)).body.code).toBe('PERMISSION_DENIED')
    const keeper = filesApi(app, await bearer(app, a, 'omborchi'))
    await keeper.presign(image()).expect(200)
    await keeper.presign({ kind: 'export', mime: 'text/csv', size: 10, sha256: 'c'.repeat(64) }).expect(403)
  })

  it('imzo MIME ni bog‘laydi: boshqa Content-Type bilan PUT — S3 rad etadi', async () => {
    const body = await pngImage(16, 16)
    const res = await files.presign(image(body.length, sha256(body))).expect(200)
    expect((await putSigned(res.body.upload, body, { 'Content-Type': 'text/html' })).status).toBe(403)
    expect((await putSigned(res.body.upload, body)).status).toBe(200)
  })
})
