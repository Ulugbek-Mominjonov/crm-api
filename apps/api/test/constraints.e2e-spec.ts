import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Baza cheklovlari — OXIRGI to'siq.
 *
 * Servisdagi tekshiruv aniq xato xabari uchun; bu testlar esa ilova kodidagi
 * xato ham ma'lumotni buzolmasligini isbotlaydi.
 */
describe('Baza cheklovlari', () => {
  let ctx: Awaited<ReturnType<typeof seedTenant>>

  beforeAll(async () => { await truncateAll() })
  beforeEach(async () => {
    await truncateAll()
    ctx = await seedTenant()
  })
  afterAll(async () => { await testDb.$disconnect() })

  it('I8: ikkinchi ochiq smenani ochib bo‘lmaydi', async () => {
    const open = { tenantId: ctx.tenantId, openedAt: new Date(), openingBalance: 0n }
    await testDb.cashShift.create({ data: open })
    await expect(testDb.cashShift.create({ data: open })).rejects.toThrow()

    // Birinchisi yopilgach ikkinchisi ochiladi
    await testDb.cashShift.updateMany({
      where: { tenantId: ctx.tenantId, status: 'open' },
      data: { status: 'closed', closedAt: new Date() },
    })
    await expect(testDb.cashShift.create({ data: open })).resolves.toBeTruthy()
  })

  it('bir tenantda ikkita sukut ombor bo‘lmaydi', async () => {
    await expect(
      testDb.warehouse.create({
        data: { tenantId: ctx.tenantId, name: 'Ikkinchi', isDefault: true },
      }),
    ).rejects.toThrow()
  })

  it('I2: qoldiq manfiy bo‘lmaydi', async () => {
    const productId = await seedProduct(ctx.tenantId, ctx.warehouseId, { qty: '5' })
    await expect(
      testDb.productStock.update({
        where: { productId_warehouseId: { productId, warehouseId: ctx.warehouseId } },
        data: { qty: '-1' },
      }),
    ).rejects.toThrow()
  })

  it('I14: to‘langan summa chek summasidan oshmaydi', async () => {
    await expect(
      testDb.sale.create({
        data: {
          tenantId: ctx.tenantId, number: 'CHEK-1001', subtotal: 1000n, total: 1000n,
          paidCash: 1500n, date: new Date('2026-08-25'),
        },
      }),
    ).rejects.toThrow()
  })

  it('I15: nasiya sotuv mijozsiz yozilmaydi', async () => {
    await expect(
      testDb.sale.create({
        data: {
          tenantId: ctx.tenantId, number: 'CHEK-1002', subtotal: 1000n, total: 1000n,
          status: 'pending', date: new Date('2026-08-25'),
        },
      }),
    ).rejects.toThrow()

    const client = await testDb.client.create({
      data: { tenantId: ctx.tenantId, name: 'Quruvchi', phone: '+998901112233' },
    })
    await expect(
      testDb.sale.create({
        data: {
          tenantId: ctx.tenantId, number: 'CHEK-1003', subtotal: 1000n, total: 1000n,
          status: 'pending', customerId: client.id, date: new Date('2026-08-25'),
        },
      }),
    ).resolves.toBeTruthy()
  })

  it('I19: qabul buyurtma miqdoridan oshmaydi', async () => {
    const productId = await seedProduct(ctx.tenantId, ctx.warehouseId)
    const supplier = await testDb.supplier.create({
      data: { tenantId: ctx.tenantId, name: 'Ta’minotchi', phone: '+998900000001' },
    })
    const po = await testDb.purchaseOrder.create({
      data: {
        tenantId: ctx.tenantId, number: 'BUY-1001', supplierId: supplier.id,
        total: 100_000n, date: new Date('2026-08-25'),
      },
    })
    const item = await testDb.pOItem.create({
      data: { tenantId: ctx.tenantId, orderId: po.id, productId, name: 'Sement', qty: '10', cost: 10_000n },
    })
    await expect(
      testDb.pOItem.update({ where: { id: item.id }, data: { receivedQty: '11' } }),
    ).rejects.toThrow()
    await expect(
      testDb.pOItem.update({ where: { id: item.id }, data: { receivedQty: '10' } }),
    ).resolves.toBeTruthy()
  })

  it('to‘lov va xarajat musbat bo‘lishi shart', async () => {
    await expect(
      testDb.expense.create({
        data: { tenantId: ctx.tenantId, category: 'rent', amount: 0n, method: 'cash', date: new Date('2026-08-25') },
      }),
    ).rejects.toThrow()
  })

  it('I17: bonus balansi manfiy bo‘lmaydi', async () => {
    const client = await testDb.client.create({
      data: { tenantId: ctx.tenantId, name: 'Mijoz', phone: '+998901112244' },
    })
    await expect(
      testDb.client.update({ where: { id: client.id }, data: { bonusPoints: -1n } }),
    ).rejects.toThrow()
  })

  it('sozlamalardagi foizlar 0..100 oralig‘ida', async () => {
    await expect(
      testDb.settings.update({ where: { tenantId: ctx.tenantId }, data: { taxRate: 150 } }),
    ).rejects.toThrow()
  })

  it('xarajat shabloni kuni davrga mos bo‘lishi kerak (I21)', async () => {
    const base = { tenantId: ctx.tenantId, name: 'Ijara', category: 'rent' as const, amount: 1n, method: 'cash' as const }
    await expect(
      testDb.expenseTemplate.create({ data: { ...base, period: 'weekly', dayOfPeriod: 30 } }),
    ).rejects.toThrow()
    await expect(
      testDb.expenseTemplate.create({ data: { ...base, period: 'monthly', dayOfPeriod: 5 } }),
    ).resolves.toBeTruthy()
  })

  it('D3: chekka bog‘langan yetkazishda alohida narx bo‘lmaydi', async () => {
    const sale = await testDb.sale.create({
      data: { tenantId: ctx.tenantId, number: 'CHEK-1010', subtotal: 1000n, total: 1000n, paidCash: 1000n, date: new Date('2026-08-25') },
    })
    await expect(
      testDb.delivery.create({
        data: {
          tenantId: ctx.tenantId, saleId: sale.id, address: 'Toshkent', phone: '+998901112255',
          standaloneFee: 20_000n, scheduledDate: new Date('2026-08-26'),
        },
      }),
    ).rejects.toThrow()
  })
})
