import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { storeSnapshot } from './helpers/snapshot'

interface Issue {
  severity: 'error' | 'warning'
  entity: string
  id?: string
  code: string
}

/**
 * Tekshirish rejimi (T-109, 07 §7.6): YOZMAYDI — nechta yozuv, nima
 * o'tkaziladi (`error`), nima tuzatiladi (`warning`), serverda nima bor.
 */
describe('Migratsiya tekshiruvi (POST /migration/validate)', () => {
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

  const validate = (body: unknown, token = auth) =>
    request(app.getHttpServer()).post('/api/v1/migration/validate').set('Authorization', token).send(body as object)
  const codes = (issues: Issue[], severity: Issue['severity']) =>
    issues.filter((i) => i.severity === severity).map((i) => `${i.entity}:${i.id ?? '-'}:${i.code}`).sort()

  it('hisobot: yozuvlar soni, o‘tkaziladigan va tuzatiladiganlar — bazaga hech narsa yozilmaydi', async () => {
    const res = await validate(storeSnapshot()).expect(200)
    expect(res.body.valid).toBe(false)
    expect(res.body.counts).toMatchObject({ products: 3, sales: 6, clients: 2, movements: 3, shifts: 3, users: 1 })
    expect(codes(res.body.issues, 'error')).toEqual([
      'cashMovement:cm_2:MISSING_SHIFT',
      'movement:mv_3:MISSING_PRODUCT',
      'sale:sa_4:MISSING_PRODUCT',
      'sale:sa_6:MISSING_CUSTOMER',
    ])
    expect(codes(res.body.issues, 'warning')).toEqual([
      'product:pr_3:DUPLICATE_SKU',
      'product:pr_3:NEGATIVE_STOCK',
      'sale:sa_5:MISSING_CUSTOMER',
      'shift:-:EXTRA_OPEN_SHIFT',
      'user:-:PASSWORD_RESET_REQUIRED',
    ])
    expect(res.body.accepted).toMatchObject({ products: 3, sales: 4, stock_movements: 2 })
    expect(res.body.existing).toEqual({ products: 0, clients: 0, sales: 0 })

    expect(await testDb.product.count({ where: { tenantId: a.tenantId } })).toBe(0)
    expect(await testDb.sale.count({ where: { tenantId: a.tenantId } })).toBe(0)
  })

  it('toza nusxa — `valid: true`; serverda ma’lumot bo‘lsa `existing` ko‘rsatadi (takroriy import)', async () => {
    const clean = await validate(storeSnapshot({ clean: true })).expect(200)
    expect(clean.body.valid).toBe(true)
    await request(app.getHttpServer()).post('/api/v1/migration/import').set('Authorization', auth).send(storeSnapshot({ clean: true })).expect(200)
    const again = await validate(storeSnapshot({ clean: true })).expect(200)
    expect(again.body.existing).toMatchObject({ products: 2, clients: 2, sales: 3 })
  })

  it('buzuq yozuv (id yoki obyekt yo‘q) butun so‘rovni yiqitmaydi — hisobotda', async () => {
    const snapshot = storeSnapshot({ clean: true })
    const res = await validate({ ...snapshot, data: { ...snapshot.data, clients: [42, { name: 'Idsiz' }, ...snapshot.data.clients] } }).expect(200)
    expect(codes(res.body.issues, 'error')).toEqual(['client:-:INVALID_RECORD', 'client:-:INVALID_RECORD'])
    expect(res.body.accepted.clients).toBe(2)
  })

  it('faqat administrator', async () => {
    await validate(storeSnapshot(), await bearer(app, a, 'sotuvchi')).expect(403)
  })
})
