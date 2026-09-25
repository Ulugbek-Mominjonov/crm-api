import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { addDays, businessDate } from '@/common/time'
import { INLINE_MAX_ROWS } from '@/modules/exports/exports.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'

const BOM = '\uFEFF'
const today = businessDate()

/** CSV javob tanasi — matn sifatida (supertest aks holda buffer beradi) */
const asText = (res: request.Response, cb: (err: Error | null, body: string) => void) => {
  let text = ''
  res.setEncoding('utf8')
  res.on('data', (chunk: string) => (text += chunk))
  res.on('end', () => cb(null, text))
}

/**
 * Eksport (T-084, 09 §9.2): kichik ro'yxat — darhol fayl; katta — fonda
 * yasalib S3'ga qo'yiladi, so'rovchi havola oladi. CSV — UTF-8 BOM bilan
 * (Excel), ustunlar rolga qarab.
 */
describe('Eksport (/exports)', () => {
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

  const api = () => request(app.getHttpServer())
  const exportAs = (path: string, token = auth) =>
    api().get(`/api/v1/exports/${path}`).set('Authorization', token).buffer(true).parse(asText)
  const seedProducts = (count: number, name = (i: number) => `Mahsulot ${i}`) =>
    testDb.product.createMany({
      data: Array.from({ length: count }, (_, i) => ({
        tenantId: a.tenantId, name: name(i), sku: `SKU-${i}`, unit: 'dona' as const,
        price: 10_000n, wholesalePrice: 9_000n, cost: 7_000n,
      })),
    })

  it('kichik ro‘yxat — darhol CSV: BOM, o‘zbekcha sarlavha, `attachment`; jurnalga yoziladi', async () => {
    await seedProducts(2)
    const res = await exportAs('products').expect(200)
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers['content-disposition']).toBe(`attachment; filename="mahsulotlar-${today}.csv"`)
    const text = res.body as string
    expect(text.startsWith(BOM)).toBe(true)
    const lines = text.slice(1).split('\r\n')
    expect(lines[0]).toBe('Nomi,Artikul,Shtrix-kod,Kategoriya,Birlik,Chakana narx,Ulgurji narx,Tannarx,Qoldiq,Minimal qoldiq,Arxivda')
    expect(lines[1]).toBe('Mahsulot 0,SKU-0,,,dona,10000,9000,7000,0,0,false')
    expect(lines).toHaveLength(4) // sarlavha + 2 qator + oxirgi bo'sh
    expect(await testDb.auditEntry.count({ where: { action: 'export.download' } })).toBe(1)
  })

  it('sotuvchi — tannarx va ulgurji narx ustunlarisiz; ruxsatsiz ro‘yxat — 403', async () => {
    await seedProducts(1)
    const seller = await bearer(app, a, 'sotuvchi')
    const res = await exportAs('products', seller).expect(200)
    expect((res.body as string).slice(1).split('\r\n')[0]).toBe('Nomi,Artikul,Shtrix-kod,Kategoriya,Birlik,Chakana narx,Qoldiq,Minimal qoldiq,Arxivda')
    await exportAs('expenses', seller).expect(403)
    await exportAs('expenses', await bearer(app, a, 'omborchi')).expect(403)
  })

  it('JSON — massiv, kalitlar ustun nomlari, sonlar son; sana oralig‘i qo‘llanadi', async () => {
    const yesterday = addDays(today, -1)
    await testDb.expense.createMany({
      data: [
        { tenantId: a.tenantId, category: 'rent', amount: 1_500_000n, method: 'bank', date: new Date(`${yesterday}T00:00:00Z`), note: 'Ijara' },
        { tenantId: a.tenantId, category: 'salary', amount: 900_000n, method: 'cash', date: new Date(`${today}T00:00:00Z`) },
      ],
    })
    const res = await api().get(`/api/v1/exports/expenses?format=json&dateFrom=${yesterday}&dateTo=${yesterday}`).set('Authorization', auth).expect(200)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(res.body).toEqual([{ date: yesterday, category: 'rent', amount: 1_500_000, method: 'bank', note: 'Ijara' }])
    await exportAs(`expenses?dateFrom=${today}&dateTo=${yesterday}`).expect(400)
    await exportAs('noma-lum').expect(400)
  })

  it('audit jurnali: Toshkent kuni va vaqti, kim qilgani (tizim — `Tizim`); faqat admin', async () => {
    // 20:30 UTC — Toshkentda ertasi kun 01:30
    await testDb.auditEntry.createMany({
      data: [
        { tenantId: a.tenantId, userId: a.userId, action: 'sale.create', detail: 'CHEK-1001', createdAt: new Date('2026-09-01T20:30:00Z') },
        { tenantId: a.tenantId, action: 'expense.recurring', createdAt: new Date('2026-09-01T05:00:00Z') },
      ],
    })
    const res = await api().get('/api/v1/exports/audit?format=json&dateFrom=2026-09-02&dateTo=2026-09-02').set('Authorization', auth).expect(200)
    expect(res.body).toEqual([{ createdAt: '2026-09-02 01:30', user: 'Test Admin', action: 'sale.create', detail: 'CHEK-1001' }])
    const day1 = await api().get('/api/v1/exports/audit?format=json&dateFrom=2026-09-01&dateTo=2026-09-01').set('Authorization', auth).expect(200)
    expect(day1.body).toEqual([{ createdAt: '2026-09-01 10:00', user: 'Tizim', action: 'expense.recurring', detail: null }])
    await exportAs('audit', await bearer(app, a, 'manager')).expect(403)
  })

  it('formula in’yeksiyasi: `=`, `+`, `@` bilan boshlangan matn Excel’da bajarilmaydi', async () => {
    await seedProducts(1, () => '=HYPERLINK("http://x","Bosing")')
    const text = (await exportAs('products').expect(200)).body as string
    expect(text.split('\r\n')[1]!.startsWith(`"'=HYPERLINK(""http://x"",""Bosing"")"`)).toBe(true)
  })

  describe('katta ro‘yxat — fonda (S3), havola', () => {
    const waitReady = async (id: string, token = auth) => {
      const deadline = Date.now() + 20_000
      for (;;) {
        const job = (await api().get(`/api/v1/exports/jobs/${id}`).set('Authorization', token).expect(200)).body
        if (job.status !== 'queued' && job.status !== 'running') return job
        if (Date.now() > deadline) throw new Error('Eksport tugamadi')
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    it(`${INLINE_MAX_ROWS} dan ko‘p — 202, fon ishi, tayyor fayl so‘rovchiga havola bilan`, async () => {
      const count = INLINE_MAX_ROWS + 50
      await seedProducts(count)
      const started = await api().get('/api/v1/exports/products').set('Authorization', auth).expect(202)
      expect(started.body).toMatchObject({ resource: 'products', format: 'csv', status: 'queued', fileId: null, url: null, expiresAt: null })
      expect(await testDb.auditEntry.count({ where: { action: 'export.create', entityId: started.body.id } })).toBe(1)

      const job = await waitReady(started.body.id)
      expect(job).toMatchObject({ status: 'ready', rowCount: count, error: null })
      const file = await testDb.file.findUniqueOrThrow({ where: { id: job.fileId } })
      expect(file).toMatchObject({ kind: 'export', mime: 'text/csv', uploadedById: a.userId, originalName: `mahsulotlar-${today}.csv` })

      // Havola JSON'da (brauzer `window.location` bilan ochadi) — token talab qilmaydi
      expect(new Date(job.expiresAt).getTime() - Date.now()).toBeGreaterThan(5 * 60_000)
      const fetched = await fetch(job.url)
      expect(fetched.headers.get('content-disposition')).toContain('attachment')
      // `fetch().text()` BOM'ni yutadi — baytlar tekshiriladi
      const bytes = Buffer.from(await fetched.arrayBuffer())
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      expect(bytes.toString('utf8').split('\r\n').filter(Boolean)).toHaveLength(count + 1)

      // 302 yo'li ham (API frontend bilan bir manbada bo'lganda) — o'sha fayl
      const link = await api().get(`/api/v1/exports/jobs/${job.id}/download`).set('Authorization', auth).expect(302)
      const viaRedirect = Buffer.from(await (await fetch(link.headers.location!)).arrayBuffer())
      expect(viaRedirect.equals(bytes)).toBe(true)
    })

    it('ishni faqat so‘rovchi ko‘radi va yuklab oladi — boshqa foydalanuvchiga 404', async () => {
      await seedProducts(INLINE_MAX_ROWS + 1)
      const started = await api().get('/api/v1/exports/products').set('Authorization', auth).expect(202)
      await waitReady(started.body.id)

      const employee = await testDb.employee.create({
        data: { tenantId: a.tenantId, name: 'Menejer', position: 'Menejer', phone: '+998901112244', hiredAt: new Date('2026-01-01') },
      })
      const user = await testDb.user.create({
        data: { tenantId: a.tenantId, employeeId: employee.id, email: 'menejer@crm.uz', passwordHash: 'x', role: 'manager' },
      })
      const other = await bearer(app, { tenantId: a.tenantId, userId: user.id, employeeId: employee.id }, 'manager')
      await api().get(`/api/v1/exports/jobs/${started.body.id}`).set('Authorization', other).expect(404)
      await api().get(`/api/v1/exports/jobs/${started.body.id}/download`).set('Authorization', other).expect(404)
    })
  })
})
