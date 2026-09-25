import type { INestApplication } from '@nestjs/common'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, pngImage, seedFileRow } from './helpers/files'

/**
 * O'qish (T-090, 09 §9.7): huquq tekshiriladi, keyin 302 → qisqa muddatli
 * imzolangan GET. Bucket ochiq emas; boshqa tenant fayli — 404; havola
 * loglarga tushmaydi.
 */
describe('Faylni o‘qish (GET /files/:id/raw)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
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
    b = await seedTenant('B do‘kon')
    files = filesApi(app, await bearer(app, a))
  })

  it('302 → imzolangan GET (≤ 10 daqiqa), brauzer keshi `private`; havola orqali aynan o‘sha baytlar', async () => {
    const body = await pngImage(48, 48)
    const id = await files.upload(body)
    const res = await files.raw(id).expect(302)
    expect(res.headers['cache-control']).toBe('private, max-age=540')

    const location = new URL(res.headers.location!)
    expect(location.pathname).toContain(`t/${a.tenantId}/products/${id}/orig.png`)
    expect(Number(location.searchParams.get('X-Amz-Expires'))).toBeLessThanOrEqual(600)
    const fetched = await fetch(location)
    expect(fetched.status).toBe(200)
    expect(Buffer.from(await fetched.arrayBuffer()).equals(body)).toBe(true)
    // Rasm brauzerda ochiladi (attachment emas)
    expect(fetched.headers.get('content-disposition')).toBeNull()
  })

  it('bucket ochiq emas: imzosiz havola — 403', async () => {
    const id = await files.upload(await pngImage(12, 12))
    const location = new URL((await files.raw(id).expect(302)).headers.location!)
    const unsigned = await fetch(`${location.origin}${location.pathname}`)
    expect(unsigned.status).toBe(403)
  })

  it('variant tayyor bo‘lmasa — asl fayl; noma’lum variant — 400', async () => {
    const id = await files.upload(await pngImage(20, 20))
    const res = await files.raw(id, '128').expect(302)
    expect(new URL(res.headers.location!).pathname).toMatch(/\/orig\.png$/)
    await files.raw(id, '4096').expect(400)
  })

  it('import/eksport/hujjat — `attachment` asl nom bilan', async () => {
    const csv = Buffer.from('nom;narx\nSement;60000\n')
    const id = await files.upload(csv, 'import', 'text/csv', 'mahsulotlar ro‘yxati.csv')
    const location = (await files.raw(id).expect(302)).headers.location!
    const fetched = await fetch(location)
    expect(fetched.headers.get('content-disposition')).toBe(
      `attachment; filename*=UTF-8''${encodeURIComponent('mahsulotlar ro‘yxati.csv')}`,
    )
  })

  it('boshqa tenant fayli — 404 (403 emas), metama’lumot ham', async () => {
    const other = await seedFileRow(b.tenantId)
    expect((await files.raw(other.id).expect(404)).body.code).toBe('NOT_FOUND')
    await files.get(other.id).expect(404)
  })

  it('kutilayotgan, karantindagi va o‘chirilgan fayl o‘qilmaydi — 404', async () => {
    const pending = await seedFileRow(a.tenantId, { status: 'pending' })
    const quarantined = await seedFileRow(a.tenantId, { status: 'quarantined' })
    const deleted = await seedFileRow(a.tenantId, { deletedAt: new Date() })
    await files.raw(pending.id).expect(404)
    await files.raw(quarantined.id).expect(404)
    await files.raw(deleted.id).expect(404)
    await files.get(deleted.id).expect(404)
  })

  it('huquq tur bo‘yicha: omborchi rasmni ko‘radi, moliyaviy eksportni — yo‘q (403)', async () => {
    const image = await files.upload(await pngImage(10, 10))
    const exported = await files.upload(Buffer.from('{"sotuv":1}'), 'export', 'application/json', 'eksport.json')
    const keeper = filesApi(app, await bearer(app, a, 'omborchi'))
    await keeper.raw(image).expect(302)
    await keeper.raw(exported).expect(403)
    await keeper.get(exported).expect(403)
    await filesApi(app, await bearer(app, a, 'sotuvchi')).raw(exported).expect(302)
  })

  it('imzolangan havola loglarga yozilmaydi', async () => {
    const id = await files.upload(await pngImage(8, 8))
    const written: string[] = []
    const capture = (chunk: unknown) => {
      written.push(String(chunk))
      return true
    }
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture)
    try {
      await files.raw(id).expect(302)
    } finally {
      out.mockRestore()
      err.mockRestore()
    }
    expect(written.join('')).not.toContain('X-Amz-Signature')
  })
})
