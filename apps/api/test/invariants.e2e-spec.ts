import { randomUUID } from 'node:crypto'
import { Logger, type INestApplication } from '@nestjs/common'
import request from 'supertest'
import { runInvariantsJob } from '@/jobs/invariants.job'
import { InvariantsService } from '@/modules/invariants/invariants.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Tunlik invariant tekshiruvi (T-123, 10 §10.2): servislar orqali
 * bajarilgan amallardan keyin buzilish yo'q; bazani chetlab o'zgartirilgan
 * har denormalizatsiya topiladi va `critical` log bilan xabar qilinadi.
 */
describe('Invariant tekshiruvi (invariant-check)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let product: string

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
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    product = await seedProduct(a.tenantId, a.warehouseId, { qty: '0', price: 100_000n })
    await openShift(a.tenantId, 50_000n)
  })

  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(`/api/v1/${path}`).set('Authorization', auth).set('Idempotency-Key', randomUUID()).send(body)
  const check = () => app.get(InvariantsService).checkAll()

  /** Oddiy ish kuni: kirim, naqd va nasiya sotuv, qarz to'lovi, qaytarish */
  async function workday(): Promise<{ creditSaleId: string }> {
    await post('stock/intake', { productId: product, qty: 20, unitCost: 70_000 }).expect(201)
    const customerId = await seedClient(a.tenantId)
    const credit = await post('sales', { customerId, items: [{ productId: product, qty: 3 }], paid: { cash: 0, card: 0, transfer: 0 } }).expect(201)
    await post('debts/payments', { saleId: credit.body.id, amount: 100_000, method: 'cash' }).expect(201)
    await post(`sales/${credit.body.id}/return`, { items: [{ saleItemId: credit.body.items[0].id, qty: 1 }], reason: 'Ortiqcha' }).expect(201)
    await post('sales', { items: [{ productId: product, qty: 2 }], paid: { cash: 200_000, card: 0, transfer: 0 } }).expect(201)
    return { creditSaleId: credit.body.id }
  }

  it('servislar orqali ishlangan kun — buzilish yo‘q', async () => {
    await workday()
    const report = await check()
    expect(report.violations.filter((v) => v.tenantId === a.tenantId)).toEqual([])
    expect(report.failed).toEqual([])
  })

  it('bazani chetlab o‘zgartirilgan qiymatlar topiladi va critical log', async () => {
    const { creditSaleId } = await workday()
    // Qoldiq jurnalsiz o'zgardi; so'ng jami (trigger qayta hisoblamasligi uchun — oxirida)
    await testDb.$executeRaw`UPDATE product_stocks SET qty = qty + 1 WHERE product_id = ${product}::uuid`
    await testDb.$executeRaw`UPDATE products SET stock = stock + 5 WHERE id = ${product}::uuid`
    await testDb.$executeRaw`UPDATE sales SET debt_paid = debt_paid + 1 WHERE id = ${creditSaleId}::uuid`
    await testDb.$executeRaw`UPDATE tenant_state SET cash_balance = cash_balance + 7 WHERE tenant_id = ${a.tenantId}::uuid`
    await testDb.$executeRaw`UPDATE doc_counters SET last_no = 1000 WHERE tenant_id = ${a.tenantId}::uuid AND prefix = 'CHEK'`

    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    try {
      const report = await check()
      const checks = [...new Set(report.violations.filter((v) => v.tenantId === a.tenantId).map((v) => v.check))].sort()
      expect(checks).toEqual([
        'doc_counters.last_no', 'products.stock', 'sales.debt_paid', 'stock_movements.balance_after', 'tenant_state.cash_balance',
      ])
      expect(report.violations).toContainEqual(expect.objectContaining({ check: 'sales.debt_paid', entityId: creditSaleId, cached: '200001', actual: '200000' }))
      expect(error).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical' }), 'Invariantlar buzilgan')
    } finally {
      error.mockRestore()
    }
  })

  it('bir martalik ish (`npm run job:invariants`): buzilish bo‘lsa chiqish kodi 1, bo‘lmasa 0', async () => {
    await workday()
    expect(await runInvariantsJob()).toMatchObject({ exitCode: 0, violations: 0, failed: 0 })
    await testDb.$executeRaw`UPDATE products SET stock = stock + 1 WHERE id = ${product}::uuid`
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    try {
      expect(await runInvariantsJob()).toMatchObject({ exitCode: 1, violations: 1 })
    } finally {
      error.mockRestore()
    }
  })
})
