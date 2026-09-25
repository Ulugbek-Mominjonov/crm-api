import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { storeSnapshot } from './helpers/snapshot'

/**
 * Buzilgan havolalar va invariantlarni tiklash (T-110, 07 §7.4): import
 * TO'XTAMAYDI — o'tkaziladigan yozuv o'tkaziladi, tuzatiladigani
 * tuzatiladi, natijada barcha invariantlar bajariladi.
 */
describe('Migratsiya: buzilgan havola va invariantlar', () => {
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

  const importDirty = () =>
    request(app.getHttpServer()).post('/api/v1/migration/import').set('Authorization', auth).send(storeSnapshot()).expect(200)

  it('osilgan havolalar: mahsulotsiz chek va harakat — o‘tkaziladi; yo‘q mijoz — NULL; qarz egasiz qolmaydi', async () => {
    await importDirty()
    const numbers = (await testDb.sale.findMany({ where: { tenantId: a.tenantId }, select: { number: true } })).map((s) => s.number).sort()
    expect(numbers).toEqual(['CHEK-1840', 'CHEK-1845', 'CHEK-1846', 'QAYT-1001'])
    const orphan = await testDb.sale.findFirstOrThrow({ where: { tenantId: a.tenantId, number: 'CHEK-1840' } })
    expect(orphan.customerId).toBeNull()
    expect(await testDb.stockMovement.count({ where: { tenantId: a.tenantId } })).toBe(2)
    // Smenasiz kassa harakati — o'tkazildi (smena majburiy)
    expect(await testDb.cashMovement.count({ where: { tenantId: a.tenantId } })).toBe(1)
  })

  it('invariantlar: I1 (jami = taqsimot), I2 (manfiy qoldiq yo‘q), I8 (bitta ochiq smena), noyob SKU, I12', async () => {
    await importDirty()
    const products = await testDb.product.findMany({ where: { tenantId: a.tenantId }, include: { stocks: true } })
    for (const p of products) {
      expect(Number(p.stock)).toBe(p.stocks.reduce((sum, s) => sum + Number(s.qty), 0))
    }
    expect(await testDb.productStock.count({ where: { tenantId: a.tenantId, qty: { lt: 0 } } })).toBe(0)
    const sand = products.find((p) => p.name === 'Qum')!
    expect([sand.sku, Number(sand.stock)]).toEqual(['SEM-400-2', 0])

    expect(await testDb.cashShift.count({ where: { tenantId: a.tenantId, status: 'open' } })).toBe(1)
    const state = await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })
    const open = await testDb.cashShift.findFirstOrThrow({ where: { tenantId: a.tenantId, status: 'open' } })
    expect(state.activeShiftId).toBe(open.id)
    expect(open.openedAt.toISOString()).toBe('2026-09-22T08:00:00.000Z')

    const counters = await testDb.docCounter.findMany({ where: { tenantId: a.tenantId }, orderBy: { prefix: 'asc' } })
    expect(Object.fromEntries(counters.map((c) => [c.prefix, Number(c.lastNo)]))).toMatchObject({
      CHEK: 1846, QAYT: 1001, TKLF: 1005, BUY: 1003,
    })
  })

  it('serverda allaqachon ochiq smena bo‘lsa — nusxadagi ochiq smena yopiladi, kassa balansiga tegilmaydi', async () => {
    const shift = await testDb.cashShift.create({ data: { tenantId: a.tenantId, openedAt: new Date(), openingBalance: 7_000n } })
    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeShiftId: shift.id, cashBalance: 7_000n } })
    await importDirty()
    expect(await testDb.cashShift.count({ where: { tenantId: a.tenantId, status: 'open' } })).toBe(1)
    expect(await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).toMatchObject({
      activeShiftId: shift.id, cashBalance: 7_000n,
    })
  })

  it('oldindan kiritilgan ma’lumot bilan to‘qnashuv (SKU, chek raqami) — yiqilmaydi, raqam qo‘shiladi', async () => {
    await testDb.product.create({
      data: { tenantId: a.tenantId, name: 'Qo‘lda', sku: 'SEM-400', unit: 'qop', price: 1n, wholesalePrice: 1n, cost: 1n },
    })
    const res = await importDirty()
    expect(res.body.issues).toContainEqual(expect.objectContaining({ entity: 'product', id: 'pr_1', code: 'DUPLICATE_SKU' }))
    expect(await testDb.product.count({ where: { tenantId: a.tenantId } })).toBe(4)
  })
})
