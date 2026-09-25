import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { cogsOf, revenueOf, type Sale } from '@crm/shared'
import { addDays, businessDate } from '@/common/time'
import { ReportViewJobs } from '@/modules/reports/report-views.jobs'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries } from './helpers/queries'
import { salesApi } from './helpers/sales'

/**
 * Hisobotlar (T-081…T-083, T-085): dashboard, P&L (frontend hisobi bilan
 * solishtirish — `pnl-matches-frontend`), ABC, kesh.
 */
describe('Hisobotlar', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let api: ReturnType<typeof salesApi>
  const today = businessDate()
  const yesterday = addDays(today, -1)

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
    api = salesApi(app, auth)
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    await openShift(a.tenantId)
  })

  const get = (path: string, token = auth) => request(app.getHttpServer()).get(`/api/v1/${path}`).set('Authorization', token)
  const refresh = () => app.get(ReportViewJobs).refresh()
  const cash = (amount: number) => ({ cash: amount, card: 0, transfer: 0 })

  /** API'dagi chek → frontend `Sale` shakli (shared hisob uchun) */
  const asFrontendSale = async (id: string): Promise<Sale> => (await get(`sales/${id}`).expect(200)).body as Sale

  describe('Dashboard (T-081)', () => {
    it('bugun/kecha, balanslar, toplar — bitta so‘rov; o‘tgan kunlar ko‘rinishdan, bugun jonli', async () => {
      const cement = await seedProduct(a.tenantId, a.warehouseId, { sku: 'SEM', qty: '100', price: 100_000n, cost: 60_000n })
      const brick = await seedProduct(a.tenantId, a.warehouseId, { sku: 'GSH', qty: '10', price: 1_000n, cost: 500n })
      await testDb.product.update({ where: { id: brick }, data: { minStock: '20', name: 'G‘isht' } })
      const ali = await seedClient(a.tenantId, { name: 'Ali' })

      await api.sell({ date: yesterday, items: [{ productId: cement, qty: 1 }], paid: cash(100_000) })
      await refresh() // kecha — ko'rinishda
      await api.sell({ items: [{ productId: cement, qty: 2 }], paid: cash(200_000) })
      await api.sell({ customerId: ali, items: [{ productId: brick, qty: 5 }], paid: cash(0) })
      await api.expense({ category: 'transport', amount: 30_000, method: 'cash' })

      const { result, queries } = await captureQueries(() => get('dashboard?days=7'))
      expect(result.status).toBe(200)
      expect(queries).toHaveLength(1)
      expect(result.body).toMatchObject({
        today: { revenue: 205_000, profit: 205_000 - 120_000 - 2_500, expenses: 30_000, salesCount: 2 },
        yesterday: { revenue: 100_000, profit: 40_000, expenses: 0, salesCount: 1 },
        receivables: 5_000, debtors: 1, payables: 0, lowStockCount: 1,
        lowStock: [{ id: brick, name: 'G‘isht', stock: 5, minStock: 20 }],
        topProducts: [{ id: cement, value: 300_000 }, { id: brick, value: 5_000 }],
        topDebtors: [{ id: ali, name: 'Ali', value: 5_000 }],
      })
      expect(result.body.trend).toHaveLength(7)
      expect(result.body.trend.at(-1)).toEqual({ bucket: today, revenue: 205_000, profit: 82_500 })
      expect(result.body.recentSales).toHaveLength(3)

      // I4: Dashboard va Hisobot bir kun uchun BIR XIL raqam beradi
      const pnl = await get(`reports/pnl?from=${today}&to=${today}`).expect(200)
      expect(pnl.body.current.revenue).toBe(result.body.today.revenue)
      expect(pnl.body.current.grossProfit).toBe(result.body.today.profit)
    })

    it('sotuvchi foyda ko‘rmaydi; omborchida moliya huquqi yo‘q', async () => {
      const seller = await bearer(app, a, 'sotuvchi')
      const res = await get('dashboard', seller).expect(200)
      expect(res.body.today).not.toHaveProperty('profit')
      // Sof foyda ham yashirin — undan (xarajat bilan) yalpi foyda tiklanardi
      const today = businessDate()
      const pnl = await get(`reports/pnl?from=${today}&to=${today}`, seller).expect(200)
      for (const totals of [pnl.body.current, pnl.body.previous]) {
        expect(totals).not.toHaveProperty('netProfit')
        expect(totals).not.toHaveProperty('grossProfit')
      }
      expect(pnl.body.change).not.toHaveProperty('netProfit')
      await get('dashboard', await bearer(app, a, 'omborchi')).expect(403)
    })
  })

  describe('Foyda/zarar (T-082, pnl-matches-frontend)', () => {
    it('natija frontend (shared) hisobi bilan bir xil; oldingi davr bilan solishtirish', async () => {
      const p1 = await seedProduct(a.tenantId, a.warehouseId, { sku: 'A', qty: '1000', price: 90_000n, cost: 55_000n })
      const p2 = await seedProduct(a.tenantId, a.warehouseId, { sku: 'B', qty: '1000', price: 12_500n, cost: 7_300n })
      const c = await seedClient(a.tenantId)
      const ids: string[] = []
      const sell = async (body: Record<string, unknown>) => {
        const sale = await api.sell(body)
        ids.push(sale.id)
        return sale
      }
      // Oldingi davr: 1–10 sentabr; joriy: 11–20
      await sell({ date: '2026-09-03', items: [{ productId: p1, qty: 2 }], paid: cash(180_000) })
      await sell({ date: '2026-09-12', items: [{ productId: p1, qty: 3 }, { productId: p2, qty: 7 }], paid: cash(357_500) })
      await sell({ date: '2026-09-15', customerId: c, items: [{ productId: p2, qty: 10, discount: 5_000 }], paid: cash(50_000) })
      const x = await sell({ date: '2026-09-18', items: [{ productId: p1, qty: 1 }], paid: cash(90_000) })
      await api.cancel(x.id)
      await api.expense({ category: 'rent', amount: 400_000, method: 'bank', date: '2026-09-14' })
      await api.expense({ category: 'transport', amount: 25_000, method: 'bank', date: '2026-09-05' })
      await refresh()

      const { result, queries } = await captureQueries(() => get('reports/pnl?from=2026-09-11&to=2026-09-20'))
      expect(result.status).toBe(200)
      expect(queries.length).toBeLessThanOrEqual(2)
      const body = result.body

      // Frontend Hisobotlar sahifasi hisobi — shared funksiyalar bilan
      const all = await Promise.all(ids.map(asFrontendSale))
      const inRange = (s: Sale, from: string, to: string) => s.date >= from && s.date <= to
      const cur = all.filter((s) => inRange(s, '2026-09-11', '2026-09-20'))
      const prev = all.filter((s) => inRange(s, '2026-09-01', '2026-09-10'))
      expect(body.current).toMatchObject({
        revenue: revenueOf(cur),
        cogs: Math.round(cogsOf(cur)),
        grossProfit: revenueOf(cur) - Math.round(cogsOf(cur)),
        expenses: 400_000,
        netProfit: revenueOf(cur) - Math.round(cogsOf(cur)) - 400_000,
        salesCount: 2,
      })
      expect(body.previous).toMatchObject({ revenue: revenueOf(prev), cogs: Math.round(cogsOf(prev)), expenses: 25_000 })
      expect(body.previousPeriod).toEqual({ from: '2026-09-01', to: '2026-09-10' })
      expect(body.change.revenue).toBe(Math.round(((revenueOf(cur) - revenueOf(prev)) / revenueOf(prev)) * 100))

      expect(body.payments).toEqual({ cash: 407_500, card: 0, transfer: 0, debt: 70_000 })
      expect(body.expensesByCategory).toEqual([{ category: 'rent', amount: 400_000 }])
      expect(body.topProducts.map((t: { productId: string; revenue: number }) => [t.productId, t.revenue])).toEqual([
        [p1, 270_000], [p2, 207_500],
      ])
      expect(body.sellers).toEqual([{ sellerId: a.employeeId, name: 'Test Admin', count: 2, revenue: revenueOf(cur) }])
      expect(body.trend.map((t: { bucket: string }) => t.bucket)).toEqual(['2026-09-12', '2026-09-15'])
    })

    it('sotilmayotgan tovar: faol, qoldig‘i bor, davrda sotilmagan', async () => {
      const sold = await seedProduct(a.tenantId, a.warehouseId, { sku: 'S', qty: '10', cost: 1_000n })
      const idle = await seedProduct(a.tenantId, a.warehouseId, { sku: 'I', qty: '4', cost: 2_500n })
      const archived = await seedProduct(a.tenantId, a.warehouseId, { sku: 'X', qty: '9', cost: 1n })
      await testDb.product.update({ where: { id: archived }, data: { archived: true } })
      await api.sell({ items: [{ productId: sold, qty: 1 }], paid: cash(60_000) })
      const res = await get(`reports/pnl?from=${today}&to=${today}`).expect(200)
      expect(res.body.deadStock).toEqual({
        stockValue: 9 * 1_000 + 4 * 2_500,
        deadValue: 10_000,
        items: [{ productId: idle, name: 'Sement M400', unit: 'qop', stock: 4, stockValue: 10_000 }],
      })
      // Sotuvchiga tannarxdan hosil bo'lgan qiymat chiqmaydi (qiymat ÷ qoldiq = tannarx)
      const seller = await get(`reports/pnl?from=${today}&to=${today}`, await bearer(app, a, 'sotuvchi')).expect(200)
      expect(seller.body.deadStock).toEqual({ items: [{ productId: idle, name: 'Sement M400', unit: 'qop', stock: 4 }] })
    })

    it('noto‘g‘ri davr — 400', async () => {
      await get('reports/pnl?from=2026-09-20&to=2026-09-01').expect(400)
      await get('reports/pnl?from=2020-01-01&to=2026-09-01').expect(400)
    })
  })

  describe('Analitika — ABC (T-083)', () => {
    it('A ≤ 80%, B ≤ 95%, C — qolgani; bitta so‘rov', async () => {
      const make = async (sku: string, price: bigint) => seedProduct(a.tenantId, a.warehouseId, { sku, qty: '100', price })
      const [p70, p15, p10, p5] = await Promise.all([make('A70', 70_000n), make('B15', 15_000n), make('B10', 10_000n), make('C5', 5_000n)])
      await api.sell({
        items: [p70, p15, p10, p5].map((productId) => ({ productId, qty: 1 })),
        paid: cash(100_000),
      })
      const { result, queries } = await captureQueries(() => get(`analytics?from=${today}&to=${today}`))
      expect(queries).toHaveLength(1)
      expect(result.body.totalRevenue).toBe(100_000)
      expect(result.body.abc.map((r: { productId: string; class: string; cumulative: number }) => [r.productId, r.class, r.cumulative])).toEqual([
        [p70, 'A', 70], [p15, 'B', 85], [p10, 'B', 95], [p5, 'C', 100],
      ])
      expect(result.body.payments).toMatchObject({ cash: 100_000 })
    })
  })

  describe('Kesh (T-085, reports-cache-invalidation)', () => {
    it('tugallangan davr keshlanadi; sotuv qo‘shilsa — bekor bo‘ladi; bugun — keshlanmaydi', async () => {
      const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '100', price: 10_000n })
      await api.sell({ date: yesterday, items: [{ productId: p, qty: 1 }], paid: cash(10_000) })
      const past = `reports/pnl?from=${yesterday}&to=${yesterday}`

      expect((await get(past).expect(200)).body.current.revenue).toBe(10_000)
      const warm = await captureQueries(() => get(past))
      expect(warm.queries).toHaveLength(0)

      await api.sell({ date: yesterday, items: [{ productId: p, qty: 2 }], paid: cash(20_000) })
      const fresh = await captureQueries(() => get(past))
      expect(fresh.queries.length).toBeGreaterThan(0)
      expect(fresh.result.body.current.revenue).toBe(30_000)

      const current = `reports/pnl?from=${yesterday}&to=${today}`
      await get(current).expect(200)
      expect((await captureQueries(() => get(current))).queries.length).toBeGreaterThan(0)
    })
  })
})
