import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { Socket } from 'socket.io-client'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { appDb, seedClient, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { connect, listen, record, settle, until, type Received } from './helpers/realtime'

/**
 * Domen hodisalari (T-095): tranzaksiya COMMIT bo'lgandan KEYIN
 * yuboriladi. Yiqilgan amal hodisa bermaydi; hodisa kelganda ma'lumot
 * allaqachon o'qiladi. Yukda faqat identifikatorlar.
 */
describe('Hodisalar COMMIT’dan keyin', () => {
  let app: INestApplication
  let url: string
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let product: string
  let receivedA: Received[]
  let receivedB: Received[]
  const sockets: Socket[] = []

  beforeAll(async () => {
    app = await createTestApp()
    url = await listen(app)
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
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    product = await seedProduct(a.tenantId, a.warehouseId, { qty: '10', price: 100_000n })
    receivedA = await listenAs(a)
    receivedB = await listenAs(b)
  })

  afterEach(() => {
    for (const s of sockets.splice(0)) s.close()
  })

  async function listenAs(who: typeof a): Promise<Received[]> {
    const socket = await connect(url, { token: (await bearer(app, who)).slice('Bearer '.length) })
    sockets.push(socket)
    return record(socket)
  }

  const api = () => request(app.getHttpServer())
  const post = (path: string, body: Record<string, unknown>) =>
    api().post(`/api/v1/${path}`).set('Authorization', auth).set('Idempotency-Key', randomUUID()).send(body)
  const types = () => receivedA.map((e) => e.type)

  it('sotuv: `sale.created` (id’lar bilan) va hodisa kelganda chek bazada bor', async () => {
    await post('cash/shifts/open', { openingBalance: 0 }).expect(201)
    let committed: boolean | undefined
    const socket = sockets[0]!
    socket.on('sale.created', ({ saleId }: { saleId: string }) => {
      void testDb.sale.count({ where: { id: saleId } }).then((n) => (committed = n === 1))
    })

    const sale = await post('sales', { items: [{ productId: product, qty: 2 }], paid: { cash: 200_000, card: 0, transfer: 0 } }).expect(201)
    await until(() => committed !== undefined)
    expect(committed).toBe(true)
    expect(receivedA).toContainEqual({
      type: 'sale.created',
      payload: { saleId: sale.body.id, warehouseId: a.warehouseId, productIds: [product] },
    })
    // To'liq obyekt EMAS — narx, tannarx yo'q
    expect(JSON.stringify(receivedA)).not.toContain('100000')
    await settle()
    expect(receivedB).toEqual([])
  })

  it('yiqilgan amal hodisa bermaydi (qoldiq yetmaydi — 422, smena yopiq — 423)', async () => {
    await post('sales', { items: [{ productId: product, qty: 1 }], paid: { cash: 100_000, card: 0, transfer: 0 } }).expect(423)
    await post('cash/shifts/open', { openingBalance: 0 }).expect(201)
    await until(() => types().includes('shift.opened'))
    await post('sales', { items: [{ productId: product, qty: 50 }], paid: { cash: 5_000_000, card: 0, transfer: 0 } }).expect(422)
    await settle()
    expect(types()).toEqual(['shift.opened'])
  })

  it('e’lon qilingan, lekin tranzaksiya bekor bo‘lgan hodisa — yuborilmaydi; COMMIT bo‘lgani — yuboriladi', async () => {
    const events = app.get(DomainEvents)
    await expect(
      appDb.inTenantTransaction(a.tenantId, async () => {
        events.publish('shift.opened', { shiftId: 'bekor' })
        throw new Error('ROLLBACK')
      }),
    ).rejects.toThrow('ROLLBACK')
    await appDb.inTenantTransaction(a.tenantId, async () => {
      events.publish('shift.opened', { shiftId: 'saqlandi' })
    })
    await until(() => receivedA.length > 0)
    await settle()
    expect(receivedA).toEqual([{ type: 'shift.opened', payload: { shiftId: 'saqlandi' } }])
  })

  it('smena, ombor, qaytarish, bekor qilish, qarz — har biri o‘z hodisasi bilan', async () => {
    const shift = await post('cash/shifts/open', { openingBalance: 0 }).expect(201)
    const intake = await post('stock/intake', { productId: product, qty: 5, warehouseId: a.warehouseId }).expect(201)
    expect(intake.body.movementId).toBeDefined()

    const customerId = await seedClient(a.tenantId)
    const credit = await post('sales', { customerId, items: [{ productId: product, qty: 1 }], paid: { cash: 0, card: 0, transfer: 0 } }).expect(201)
    await post('debts/payments', { saleId: credit.body.id, amount: 40_000, method: 'cash' }).expect(201)
    const cashSale = await post('sales', { items: [{ productId: product, qty: 1 }], paid: { cash: 100_000, card: 0, transfer: 0 } }).expect(201)
    const returned = await post(`sales/${cashSale.body.id}/return`, { items: [{ saleItemId: cashSale.body.items[0].id, qty: 1 }], reason: 'Test' }).expect(201)
    await post(`sales/${credit.body.id}/cancel`, {}).expect(409)
    const other = await post('sales', { items: [{ productId: product, qty: 1 }], paid: { cash: 100_000, card: 0, transfer: 0 } }).expect(201)
    await post(`sales/${other.body.id}/cancel`, {}).expect(200)
    await post('cash/shifts/close', { countedBalance: 140_000 }).expect(200)

    await until(() => types().includes('shift.closed'))
    expect(receivedA).toEqual([
      { type: 'shift.opened', payload: { shiftId: shift.body.id } },
      { type: 'stock.changed', payload: { warehouseId: a.warehouseId, productIds: [product] } },
      { type: 'sale.created', payload: { saleId: credit.body.id, warehouseId: a.warehouseId, productIds: [product] } },
      { type: 'debt.paid', payload: { saleId: credit.body.id, customerId } },
      { type: 'sale.created', payload: { saleId: cashSale.body.id, warehouseId: a.warehouseId, productIds: [product] } },
      { type: 'sale.created', payload: { saleId: returned.body.id, warehouseId: a.warehouseId, productIds: [product] } },
      { type: 'sale.created', payload: { saleId: other.body.id, warehouseId: a.warehouseId, productIds: [product] } },
      { type: 'sale.cancelled', payload: { saleId: other.body.id } },
      { type: 'shift.closed', payload: { shiftId: shift.body.id } },
    ])
    expect(receivedB).toEqual([])
  })
})
