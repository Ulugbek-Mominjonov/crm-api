import type { INestApplication } from '@nestjs/common'
import { ReportViewJobs } from '@/modules/reports/report-views.jobs'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { salesApi } from './helpers/sales'

/**
 * Kunlik agregat ko'rinishlari (T-079): materiallashgan nusxa jonli
 * hisob bilan AYNAN bir xil; qoida I4 (nasiya ichida, bekor qilingan
 * tashqarida, qaytarish alohida).
 */
describe('Kunlik ko‘rinishlar (mv-matches-live)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>

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
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    await openShift(a.tenantId)
  })

  it('materiallashgan = jonli; I4 qoidasi', async () => {
    const api = salesApi(app, await bearer(app, a))
    const p = await seedProduct(a.tenantId, a.warehouseId, { qty: '1000', price: 100_000n, cost: 60_000n })
    const c = await seedClient(a.tenantId)
    const cash = await api.sell({ date: '2026-09-01', items: [{ productId: p, qty: 2 }], paid: { cash: 200_000, card: 0, transfer: 0 } })
    await api.sell({ date: '2026-09-01', customerId: c, items: [{ productId: p, qty: 1 }], paid: { cash: 0, card: 0, transfer: 0 } })
    const cancelled = await api.sell({ date: '2026-09-02', items: [{ productId: p, qty: 5 }], paid: { cash: 500_000, card: 0, transfer: 0 } })
    await api.cancel(cancelled.id)
    await api.giveBack(cash.id, [{ saleItemId: cash.items[0].id, qty: 1 }])

    expect(await app.get(ReportViewJobs).refresh()).toBe(true)
    const [mv, live] = await Promise.all([
      testDb.$queryRaw<unknown[]>`SELECT * FROM daily_sales_summary WHERE tenant_id = ${a.tenantId}::uuid ORDER BY date`,
      testDb.$queryRaw<unknown[]>`SELECT * FROM daily_sales_live WHERE tenant_id = ${a.tenantId}::uuid ORDER BY date`,
    ])
    expect(mv).toEqual(live)
    expect(mv.length).toBeGreaterThan(0)

    const [first] = await testDb.$queryRaw<{ revenue: bigint; cogs: string; sale_count: bigint; paid_cash: bigint }[]>`
      SELECT revenue, cogs::text, sale_count, paid_cash FROM daily_sales_summary
       WHERE tenant_id = ${a.tenantId}::uuid AND date = '2026-09-01'`
    // Nasiya ham tushumda (I4): 200 000 + 100 000
    expect(first).toMatchObject({ revenue: 300_000n, sale_count: 2n, paid_cash: 200_000n })
    expect(Number(first!.cogs)).toBe(180_000)
    // Bekor qilingan kun — umuman yo'q
    const cancelledDay = await testDb.$queryRaw<unknown[]>`
      SELECT 1 FROM daily_sales_summary WHERE tenant_id = ${a.tenantId}::uuid AND date = '2026-09-02'`
    expect(cancelledDay).toHaveLength(0)

    const [mvProducts, liveProducts] = await Promise.all([
      testDb.$queryRaw<unknown[]>`SELECT * FROM daily_product_sales WHERE tenant_id = ${a.tenantId}::uuid ORDER BY date, product_id`,
      testDb.$queryRaw<unknown[]>`SELECT * FROM daily_product_sales_live WHERE tenant_id = ${a.tenantId}::uuid ORDER BY date, product_id`,
    ])
    expect(mvProducts).toEqual(liveProducts)
  })

  it('ilova roli materiallashgan nusxani to‘g‘ridan-to‘g‘ri o‘qiy olmaydi (RLS o‘rnini bosuvchi ko‘rinish)', async () => {
    const privileges = await testDb.$queryRaw<{ mv: boolean; view: boolean }[]>`
      SELECT has_table_privilege('crm_app', 'daily_sales_summary', 'SELECT') AS mv,
             has_table_privilege('crm_app', 'tenant_daily_sales', 'SELECT') AS view`
    expect(privileges[0]).toEqual({ mv: false, view: true })
  })
})
