import type { INestApplication } from '@nestjs/common'
import { S3Service } from '@/modules/files/s3.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, pngImage, putSigned, sha256 } from './helpers/files'

const MB = 1024 * 1024

/**
 * Tasdiqlash (T-089, 09 §9.6): presigned URL bilan mijoz istalgan tarkibni
 * yuborishi mumkin — server obyektning o'zini tekshiradi. Mos kelmasa
 * obyekt o'chadi, fayl karantinga, audit'ga yoziladi; hajm oshmaydi.
 */
describe('Tasdiqlash va tarkib tekshiruvi (POST /files/:id/confirm)', () => {
  let app: INestApplication
  let s3: S3Service
  let a: Awaited<ReturnType<typeof seedTenant>>
  let files: ReturnType<typeof filesApi>

  beforeAll(async () => {
    app = await createTestApp()
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

  /** Presign (e'lon) va PUT (haqiqiy tarkib) — e'lon qilingan va yuborilgan farq qilishi mumkin */
  async function declareAndPut(declared: { mime: string; kind?: string; body: Buffer }, sent = declared.body) {
    const res = await files
      .presign({ kind: declared.kind ?? 'product_image', mime: declared.mime, size: declared.body.length, sha256: sha256(declared.body) })
      .expect(200)
    const put = await putSigned(res.body.upload, sent)
    expect(put.status).toBe(200)
    return res.body.file.id as string
  }

  const storageUsed = async () =>
    (await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).storageUsedBytes

  it('to‘g‘ri rasm: ready, hajm hisoblagichi oshadi, audit; takroriy tasdiqlash — o‘sha natija', async () => {
    const body = await pngImage(40, 40)
    const id = await declareAndPut({ mime: 'image/png', body })
    const res = await files.confirm(id).expect(200)
    expect(res.body).toMatchObject({ id, status: 'ready', sizeBytes: body.length, variants: [] })
    expect(await storageUsed()).toBe(BigInt(body.length))
    expect(await testDb.auditEntry.count({ where: { action: 'file.upload', entityId: id } })).toBe(1)

    await files.confirm(id).expect(200)
    expect(await storageUsed()).toBe(BigInt(body.length))
    expect((await files.usage().expect(200)).body).toEqual({
      usedBytes: body.length, limitBytes: 200 * MB, byKind: { product_image: body.length },
    })
  })

  it('rasm deb HTML (bir xil hajm) — 422 FILE_REJECTED, obyekt o‘chadi, karantin va audit saqlanadi', async () => {
    const html = Buffer.from('<html><script>alert(document.cookie)</script></html>')
    // Mijoz e'lonni ham, xeshni ham HTML bo'yicha berdi — faqat MIME yolg'on
    const id = await declareAndPut({ mime: 'image/png', body: html })
    const res = await files.confirm(id).expect(422)
    expect(res.body).toMatchObject({ code: 'FILE_REJECTED', errors: [{ field: 'id', meta: { id } }] })

    const row = await testDb.file.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('quarantined')
    expect(await s3.size('media', row.key)).toBeNull()
    expect(await storageUsed()).toBe(0n)
    const audit = await testDb.auditEntry.findFirstOrThrow({ where: { action: 'file.quarantine', entityId: id } })
    expect(audit.detail).toContain('image/png emas')

    // Qayta urinish va shu tarkibni qayta yuklash ham rad etiladi
    await files.confirm(id).expect(422)
    await files.presign({ kind: 'product_image', mime: 'image/png', size: html.length, sha256: sha256(html) }).expect(422)
  })

  it('e’lon qilinganidan boshqa tarkib (xesh mos emas) — 422', async () => {
    const declared = await pngImage(30, 30, 10)
    const other = await pngImage(30, 30, 90)
    expect(other.length).toBe(declared.length)
    const id = await declareAndPut({ mime: 'image/png', body: declared }, other)
    const res = await files.confirm(id).expect(422)
    expect(res.body.detail).toContain('xeshi mos emas')
  })

  it('CSV deb SVG/HTML — rad; haqiqiy CSV (BOM bilan) — qabul', async () => {
    const svg = Buffer.from('﻿<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')
    const bad = await declareAndPut({ kind: 'import', mime: 'text/csv', body: svg })
    await files.confirm(bad).expect(422)

    const csv = Buffer.from('﻿nom;sku;narx\nSement;SEM-1;60000\n')
    const good = await declareAndPut({ kind: 'import', mime: 'text/csv', body: csv })
    await files.confirm(good).expect(200)
  })

  it('hali yuklanmagan — 409 FILE_NOT_UPLOADED (holat o‘zgarmaydi)', async () => {
    const res = await files.presign({ kind: 'product_image', mime: 'image/png', size: 10, sha256: 'd'.repeat(64) }).expect(200)
    expect((await files.confirm(res.body.file.id).expect(409)).body.code).toBe('FILE_NOT_UPLOADED')
    expect((await testDb.file.findUniqueOrThrow({ where: { id: res.body.file.id } })).status).toBe('pending')
  })

  it('kvota tasdiqlashda qayta (atomik): oshib ketsa — 413, obyekt va qator o‘chadi', async () => {
    const body = await pngImage(50, 50)
    const id = await declareAndPut({ mime: 'image/png', body })
    const key = (await testDb.file.findUniqueOrThrow({ where: { id } })).key
    // Presign va tasdiqlash orasida boshqa yuklashlar joyni egalladi
    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { storageUsedBytes: BigInt(200 * MB - 10) } })
    expect((await files.confirm(id).expect(413)).body.code).toBe('STORAGE_QUOTA_EXCEEDED')
    expect(await testDb.file.count({ where: { id } })).toBe(0)
    expect(await s3.size('media', key)).toBeNull()
    expect(await storageUsed()).toBe(BigInt(200 * MB - 10))
  })

  it('parallel ikki tasdiqlash — hisoblagich bir marta oshadi', async () => {
    const body = await pngImage(20, 20)
    const id = await declareAndPut({ mime: 'image/png', body })
    const [x, y] = await Promise.all([files.confirm(id), files.confirm(id)])
    expect([x.status, y.status]).toEqual([200, 200])
    expect(await storageUsed()).toBe(BigInt(body.length))
    expect(await testDb.auditEntry.count({ where: { action: 'file.upload' } })).toBe(1)
  })
})
