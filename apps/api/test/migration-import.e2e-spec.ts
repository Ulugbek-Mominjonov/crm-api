import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { storeSnapshot } from './helpers/snapshot'

/**
 * Migratsiya importi (T-108, 07 §7.4): tashqi kalitlar tartibida, havolalar
 * saqlanadi, qayta yuborish ikkilanmaydi, hisoblagich eng katta raqamdan
 * davom etadi, foydalanuvchilarga vaqtinchalik parol.
 */
describe('Migratsiya importi (POST /migration/import)', () => {
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
  const importSnapshot = (body: unknown, token = auth) =>
    api().post('/api/v1/migration/import').set('Authorization', token).send(body as object)
  const count = (table: 'product' | 'sale' | 'client' | 'stockMovement' | 'debtPayment') =>
    (testDb[table] as unknown as { count: (a: object) => Promise<number> }).count({ where: { tenantId: a.tenantId } })

  it('toza nusxa to‘liq ko‘chadi: havolalar, omborlar bo‘yicha qoldiq, sozlama, hisoblagich', async () => {
    const res = await importSnapshot(storeSnapshot({ clean: true })).expect(200)
    expect(res.body.valid).toBe(true)
    expect(res.body.issues.filter((i: { severity: string }) => i.severity === 'error')).toEqual([])
    expect(res.body.accepted).toMatchObject({ products: 2, sales: 3, sale_items: 3, clients: 2, stock_movements: 2 })

    // Mahsulot va ombor bo'yicha qoldiq (I1: jami — trigger)
    const cement = await testDb.product.findFirstOrThrow({ where: { tenantId: a.tenantId, sku: 'SEM-400' }, include: { stocks: true } })
    expect(Number(cement.stock)).toBe(120)
    const defaultWarehouse = await testDb.warehouse.findFirstOrThrow({ where: { tenantId: a.tenantId, isDefault: true } })
    expect(defaultWarehouse).toMatchObject({ id: a.warehouseId, name: 'Do‘kon zali', address: 'Chilonzor 5' })
    const byWarehouse = Object.fromEntries(cement.stocks.map((s) => [s.warehouseId, Number(s.qty)]))
    expect(byWarehouse[a.warehouseId]).toBe(100)
    expect(Object.values(byWarehouse).sort((x, y) => x - y)).toEqual([20, 100])

    // Chek → mijoz, qarz to'lovi, qaytarish → asl chek; bazada naqd — kassada qolgani (Q35)
    const credit = await testDb.sale.findFirstOrThrow({ where: { tenantId: a.tenantId, number: 'CHEK-1846' }, include: { customer: true } })
    expect(credit).toMatchObject({ status: 'pending', debtPaid: 200_000n, outstanding: 350_000n })
    expect(credit.customer!.name).toBe('Qurilish MChJ')
    expect(await testDb.debtPayment.count({ where: { saleId: credit.id } })).toBe(1)
    const first = await testDb.sale.findFirstOrThrow({ where: { tenantId: a.tenantId, number: 'CHEK-1845' } })
    expect(first).toMatchObject({ paidCash: 120_000n, change: 30_000n })
    const back = await testDb.sale.findFirstOrThrow({ where: { tenantId: a.tenantId, number: 'QAYT-1001' } })
    expect(back.relatedSaleId).toBe(first.id)

    // Sozlama, kassa (ochiq smena va balans), telefon normallashgan
    expect(await testDb.settings.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).toMatchObject({
      storeName: 'Ali Qurilish', taxEnabled: false, loyaltyRate: 2, maxDiscountPct: 15, receiptFooter: 'Rahmat!',
    })
    const state = await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })
    expect(state.cashBalance).toBe(390_000n)
    expect(state.activeShiftId).not.toBeNull()
    expect((await testDb.client.findFirstOrThrow({ where: { tenantId: a.tenantId, name: 'Vali' } })).phone).toBe('+998901112233')

    // I12: yangi chek — eng katta raqamdan keyin
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    const sale = await api().post('/api/v1/sales').set('Authorization', auth).set('Idempotency-Key', randomUUID())
      .send({ items: [{ productId: cement.id, qty: 1 }], paid: { cash: 60_000, card: 0, transfer: 0 } }).expect(201)
    expect(sale.body.number).toBe('CHEK-1847')

    // Orqa sanali cheklar hisobotda darhol (Q77)
    const pnl = await api().get('/api/v1/reports/pnl?from=2026-09-20&to=2026-09-20').set('Authorization', auth).expect(200)
    expect(pnl.body.current.revenue).toBe(120_000)
  })

  it('qayta yuborish ma’lumotni ikkilantirmaydi', async () => {
    const snapshot = storeSnapshot({ clean: true })
    await importSnapshot(snapshot).expect(200)
    const before = await Promise.all([count('product'), count('sale'), count('client'), count('stockMovement'), count('debtPayment')])
    const again = await importSnapshot(snapshot).expect(200)
    expect(await Promise.all([count('product'), count('sale'), count('client'), count('stockMovement'), count('debtPayment')])).toEqual(before)
    // Foydalanuvchi allaqachon bor — yangi parol berilmaydi
    expect(again.body.users).toEqual([])
    expect(again.body.existing).toMatchObject({ products: 2, sales: 3 })
  })

  it('foydalanuvchilar: parol ko‘chirilmaydi — vaqtinchalik parol bilan kiradi', async () => {
    const res = await importSnapshot(storeSnapshot({ clean: true })).expect(200)
    expect(res.body.users).toHaveLength(1)
    const { email, password } = res.body.users[0]
    expect(email).toBe('kassir@dokon.uz')
    expect(password).toMatch(/^[A-Za-z2-9]{12}$/)
    const user = await testDb.user.findFirstOrThrow({ where: { tenantId: a.tenantId, email }, include: { employee: true } })
    expect(user).toMatchObject({ role: 'sotuvchi', isActive: true })
    expect(user.passwordHash).not.toContain(password)
    await api().post('/api/v1/auth/login').send({ email, password }).expect(201)
  })

  it('eski versiya (v12): omborlar va taqsimot yo‘q — butun qoldiq sukut omborga', async () => {
    const snapshot = storeSnapshot({ clean: true })
    const { warehouses: _w, ...rest } = snapshot.data
    const data = { ...rest, products: rest.products.map(({ stocks: _s, ...p }) => p) }
    await importSnapshot({ ...snapshot, version: 12, data }).expect(200)
    const stocks = await testDb.productStock.findMany({ where: { tenantId: a.tenantId } })
    expect(stocks.every((s) => s.warehouseId === a.warehouseId)).toBe(true)
    expect(stocks.map((s) => Number(s.qty)).sort((x, y) => x - y)).toEqual([120, 5_000])
  })

  it('faqat administrator; nusxa shakli noto‘g‘ri — 400', async () => {
    await importSnapshot(storeSnapshot(), await bearer(app, a, 'manager')).expect(403)
    await importSnapshot({ ...storeSnapshot(), version: 9 }).expect(400)
    await importSnapshot({ ...storeSnapshot(), source: 'excel' }).expect(400)
    expect(await count('product')).toBe(0)
  })
})
