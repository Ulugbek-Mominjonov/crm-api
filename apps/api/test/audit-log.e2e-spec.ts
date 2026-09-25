import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { businessDayStart } from '@/common/time'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Amallar jurnali (04 §2: `/audit`, `users` huquqi): yangisi birinchi,
 * kalitli sahifa (sahifalar orasida takror/yo'qolish yo'q), filtrlar,
 * boshqa do'kon jurnali ko'rinmaydi.
 */
describe('Audit jurnali (GET /audit)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
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
    b = await seedTenant('B do‘kon')
    auth = await bearer(app, a)
  })

  const list = (query: Record<string, string | number> = {}, token = auth) =>
    request(app.getHttpServer()).get('/api/v1/audit').set('Authorization', token).query(query)

  it('yangisi birinchi; sahifalar orasida takror va yo‘qolish yo‘q; kim qilgani — ism bilan; B ko‘rinmaydi', async () => {
    const base = Date.parse('2026-09-20T09:00:00Z')
    await testDb.auditEntry.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        tenantId: a.tenantId, userId: a.userId, action: i % 2 ? 'sale.create' : 'stock.intake', detail: `#${i}`,
        // Ikkitasi bir xil vaqtda — kursor `id` bo'yicha ajratadi
        createdAt: new Date(base + Math.min(i, 5) * 60_000),
      })),
    })
    await testDb.auditEntry.create({ data: { tenantId: b.tenantId, action: 'sale.create', detail: 'B' } })

    const seen: string[] = []
    let cursor: string | null = null
    do {
      const page: { items: { detail: string }[]; nextCursor: string | null } =
        (await list(cursor ? { limit: 3, cursor } : { limit: 3 }).expect(200)).body
      seen.push(...page.items.map((e) => e.detail))
      cursor = page.nextCursor
    } while (cursor)
    expect(seen).toHaveLength(7)
    expect(new Set(seen).size).toBe(7)
    expect(seen.slice(2)).toEqual(['#4', '#3', '#2', '#1', '#0'])

    const [first] = (await list({ limit: 1 }).expect(200)).body.items
    expect(first).toMatchObject({ action: expect.any(String), user: { id: a.userId, name: 'Test Admin' }, entityType: null })
  })

  it('filtrlar: foydalanuvchi, amal guruhi, yozuv, Toshkent kuni, matn', async () => {
    const other = await testDb.user.create({
      data: { tenantId: a.tenantId, employeeId: (await testDb.employee.create({ data: { tenantId: a.tenantId, name: 'Kassir', position: 'Sotuvchi', phone: '+998901234567', hiredAt: new Date('2026-01-01') } })).id, email: 'kassir@crm.uz', passwordHash: 'x', role: 'sotuvchi' },
    })
    const saleId = crypto.randomUUID()
    await testDb.auditEntry.createMany({
      data: [
        // Toshkentda 23-sentabr 00:30 (UTC bo'yicha hali 22-sentabr)
        { tenantId: a.tenantId, userId: a.userId, action: 'sale.create', entityType: 'sale', entityId: saleId, detail: 'CHEK-1001', createdAt: new Date('2026-09-22T19:30:00Z') },
        { tenantId: a.tenantId, userId: other.id, action: 'sale.cancel', entityType: 'sale', entityId: saleId, detail: 'Xato chek', createdAt: new Date('2026-09-23T08:00:00Z') },
        { tenantId: a.tenantId, userId: other.id, action: 'stock.writeoff', detail: 'Singan', createdAt: new Date('2026-09-22T18:00:00Z') },
      ],
    })
    const details = async (query: Record<string, string>) =>
      (await list(query).expect(200)).body.items.map((e: { detail: string }) => e.detail)

    expect(await details({ userId: other.id })).toEqual(['Xato chek', 'Singan'])
    expect(await details({ group: 'sale' })).toEqual(['Xato chek', 'CHEK-1001'])
    expect(await details({ entityId: saleId })).toEqual(['Xato chek', 'CHEK-1001'])
    expect(await details({ dateFrom: '2026-09-23', dateTo: '2026-09-23' })).toEqual(['Xato chek', 'CHEK-1001'])
    expect(await details({ dateTo: '2026-09-22' })).toEqual(['Singan'])
    expect(await details({ q: 'singan' })).toEqual(['Singan'])
    expect(businessDayStart('2026-09-23').toISOString()).toBe('2026-09-22T19:00:00.000Z')
  })

  it('faqat `users` huquqi (administrator); buzuq kursor va guruh — 400', async () => {
    await list({}, await bearer(app, a, 'manager')).expect(403)
    await list({ cursor: 'buzuq' }).expect(400)
    await list({ group: 'SALE; drop' }).expect(400)
  })
})
