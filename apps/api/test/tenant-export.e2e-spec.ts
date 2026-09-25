import { gunzipSync } from 'node:zlib'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { FileGcJobs } from '@/modules/files/files.jobs'
import { S3Service } from '@/modules/files/s3.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { storeSnapshot } from './helpers/snapshot'

const HOUR_MS = 3_600_000
/** Brauzerdagi "Sozlamalar → Zaxira" fayli kalitlari (`CrmSnapshot` + `settings`) */
const BROWSER_KEYS = [
  'clients', 'products', 'suppliers', 'sales', 'employees', 'movements', 'expenses', 'debtPayments', 'shifts', 'cashBalance',
  'activeShiftId', 'cashMovements', 'messages', 'deliveries', 'quotes', 'purchaseOrders', 'supplierPayments', 'expenseTemplates',
  'warehouses', 'audit', 'settings',
]
/** Ko'chirilgandan keyin mazmuni aynan qolishi kerak bo'lgan ro'yxatlar (jurnal va xodimlar — alohida) */
const CONTENT_LISTS = [
  'warehouses', 'categories', 'suppliers', 'clients', 'products', 'sales', 'movements', 'expenses', 'debtPayments', 'shifts',
  'cashMovements', 'messages', 'deliveries', 'quotes', 'purchaseOrders', 'supplierPayments', 'expenseTemplates',
]

type Snapshot = Record<string, unknown[]> & Record<string, unknown>

/**
 * Id'lar do'konga xos (import `uuidv5` beradi) — olib tashlanadi; ro'yxat
 * tartibi ahamiyatsiz. Ombor qoldig'i — faqat qiymatlar (kalit — ombor id).
 */
function content(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => JSON.stringify(content(v))).sort()
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'id' && !key.endsWith('Id'))
      .map(([key, v]) => [key, key === 'stocks' ? Object.values(v as object).sort() : content(v)]),
  )
}

/**
 * Do'kon zaxirasi (T-128, 08 §8.5): administrator butun ma'lumotni
 * brauzer zaxirasi shaklida oladi; fayl S3'da (gzip), havola 1 soat.
 * Zaxira boshqa do'konga import qilinsa — mazmun o'zgarmaydi.
 */
describe('Do‘kon zaxirasi (GET /backup/export)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
  let authA: string
  let authB: string

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
    authA = await bearer(app, a)
    authB = await bearer(app, b)
  })

  const api = () => request(app.getHttpServer())
  const importInto = async (auth: string, body: object) => {
    const res = await api().post('/api/v1/migration/import').set('Authorization', auth).send(body).expect(200)
    expect(res.body.issues.filter((i: { severity: string }) => i.severity === 'error')).toEqual([])
  }
  const exportBackup = async (auth = authA) => (await api().get('/api/v1/backup/export').set('Authorization', auth).expect(200)).body
  const download = async (url: string) => {
    const res = await fetch(url)
    expect(res.status).toBe(200)
    const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('utf8')
    return { res, text, snapshot: JSON.parse(text) as Snapshot }
  }

  it('brauzer zaxirasi shaklida, gzip, havola 1 soat; parolsiz; boshqa do‘kon ma’lumoti yo‘q; faqat administrator', async () => {
    await importInto(authA, storeSnapshot({ clean: true }))
    await testDb.client.create({ data: { tenantId: b.tenantId, name: 'B-MAXFIY-MIJOZ', phone: '+998901111111' } })
    await seedProduct(b.tenantId, b.warehouseId, { sku: 'B-MAXFIY-SKU' })

    const backup = await exportBackup()
    expect(backup.filename).toMatch(/^crm-zaxira-\d{4}-\d{2}-\d{2}\.json\.gz$/)
    expect(new URL(backup.url).searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(Date.parse(backup.expiresAt) - Date.now()).toBeGreaterThan(HOUR_MS - 60_000)

    const { res, text, snapshot } = await download(backup.url)
    expect(res.headers.get('content-type')).toBe('application/gzip')
    expect(res.headers.get('content-disposition')).toContain(`attachment; filename*=UTF-8''${backup.filename}`)
    expect(Number(res.headers.get('content-length'))).toBe(backup.sizeBytes)
    expect(Object.keys(snapshot)).toEqual(expect.arrayContaining([...BROWSER_KEYS, 'version', 'exportedAt', 'categories', 'users']))
    expect(snapshot).toMatchObject({ version: 15, tenant: { id: a.tenantId }, cashBalance: 390_000, settings: { storeName: 'Ali Qurilish', taxEnabled: false } })

    // Brauzer ma'nosi: `paid.cash` — BERILGAN naqd (bazada — kassada qolgani, Q35)
    const sales = snapshot.sales as { id: string; number: string; paid: object; change: number; total: number; deliveryFee: number }[]
    expect(sales.find((s) => s.number === 'CHEK-1845')).toMatchObject({ total: 120_000, paid: { cash: 150_000, card: 0, transfer: 0 }, change: 30_000 })
    const cement = (snapshot.products as { sku: string; stock: number; stocks: Record<string, number>; category: string }[]).find((p) => p.sku === 'SEM-400')!
    expect(cement).toMatchObject({ stock: 120, category: 'Sement' })
    expect(cement.stocks[a.warehouseId]).toBe(100)
    // Chekka bog'liq yetkazish narxi — chekda (D3)
    const [delivery] = snapshot.deliveries as { saleId: string }[]
    expect(delivery).toMatchObject({ fee: sales.find((s) => s.id === delivery!.saleId)!.deliveryFee, status: 'pending', scheduledDate: '2026-09-23' })
    const openShift = (snapshot.shifts as { id: string; status: string }[]).find((s) => s.status === 'open')!
    expect(snapshot.activeShiftId).toBe(openShift.id)

    // Foydalanuvchilar — parolsiz (migratsiya importi `users` shakli)
    expect(snapshot.users).toHaveLength(2)
    expect(snapshot.users).toEqual(expect.arrayContaining([
      { name: 'Test Admin', email: expect.stringMatching(/^admin\+/), role: 'admin' },
      { name: 'Vali Kassir', email: 'kassir@dokon.uz', role: 'sotuvchi' },
    ]))
    expect(text).not.toMatch(/password/i)
    expect(text).not.toContain('B-MAXFIY')

    expect(await testDb.file.findUniqueOrThrow({ where: { id: backup.fileId } })).toMatchObject({
      tenantId: a.tenantId, kind: 'tenant_backup', bucket: 'backup', status: 'ready', mime: 'application/gzip',
    })
    expect(await testDb.auditEntry.count({ where: { tenantId: a.tenantId, action: 'backup.export', entityId: backup.fileId } })).toBe(1)
    await api().get('/api/v1/backup/export').set('Authorization', await bearer(app, a, 'manager')).expect(403)
  })

  it('boshqa do‘konga import qilinsa — mazmun aynan o‘sha (id’lardan tashqari)', async () => {
    await importInto(authA, storeSnapshot({ clean: true }))
    const { snapshot: fromA } = await download((await exportBackup()).url)

    await importInto(authB, { source: 'localStorage', version: fromA.version, exportedAt: fromA.exportedAt, data: fromA, settings: fromA.settings })
    const { snapshot: fromB } = await download((await exportBackup(authB)).url)

    for (const key of CONTENT_LISTS) {
      expect(fromA[key]!.length, key).toBeGreaterThan(0)
      expect({ [key]: content(fromB[key]) }).toEqual({ [key]: content(fromA[key]) })
    }
    expect(fromB).toMatchObject({ cashBalance: fromA.cashBalance, settings: fromA.settings, activeShiftId: expect.any(String) })
    // B ning o'z administratori ham bor — A xodimlari unga qo'shiladi
    expect(content(fromB.employees)).toEqual(expect.arrayContaining(content(fromA.employees) as string[]))
    expect(fromB.employees).toHaveLength(fromA.employees!.length + 1)
  })

  it('katta ro‘yxat sahifalab to‘liq chiqadi; o‘chirish muhlatidagi do‘kon ham zaxira oladi', async () => {
    const CLIENTS = 2_345
    await testDb.client.createMany({
      data: Array.from({ length: CLIENTS }, (_, i) => ({ tenantId: a.tenantId, name: `Mijoz ${i}`, phone: `+99890${String(i).padStart(7, '0')}` })),
    })
    await testDb.tenant.update({ where: { id: a.tenantId }, data: { status: 'deleting', deletionScheduledAt: new Date(Date.now() + 30 * 24 * HOUR_MS) } })

    const { snapshot } = await download((await exportBackup()).url)
    const ids = (snapshot.clients as { id: string }[]).map((c) => c.id)
    expect(ids).toHaveLength(CLIENTS)
    expect(new Set(ids).size).toBe(CLIENTS)
  })

  it('havola muddati o‘tgach fayl tozalanadi: S3’dan o‘chadi, hajm bo‘shaydi', async () => {
    const backup = await exportBackup()
    const { key } = await testDb.file.findUniqueOrThrow({ where: { id: backup.fileId } })
    const storage = async () => Number((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).storageUsedBytes)
    expect(await storage()).toBe(backup.sizeBytes)

    const jobs = app.get(FileGcJobs)
    // Havola hali amal qiladi — tegilmaydi
    await jobs.gcOrphans(new Date(Date.now() + HOUR_MS / 2))
    expect(await testDb.file.findUniqueOrThrow({ where: { id: backup.fileId } })).toMatchObject({ deletedAt: null })

    const later = new Date(Date.now() + 2 * HOUR_MS)
    await jobs.gcOrphans(later)
    await jobs.purge(later)
    expect(await testDb.file.count({ where: { id: backup.fileId } })).toBe(0)
    expect(await app.get(S3Service).size('backup', key)).toBeNull()
    expect(await storage()).toBe(0)
  })
})
