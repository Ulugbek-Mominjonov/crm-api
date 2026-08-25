import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

describe('Baza triggerlari', () => {
  let ctx: Awaited<ReturnType<typeof seedTenant>>

  beforeEach(async () => {
    await truncateAll()
    ctx = await seedTenant()
  })
  afterAll(async () => { await testDb.$disconnect() })

  describe('I1: products.stock = Σ product_stocks.qty', () => {
    it('kirimda jami qoldiq avtomatik yangilanadi', async () => {
      const productId = await seedProduct(ctx.tenantId, ctx.warehouseId, { qty: '100' })
      const p = await testDb.product.findUniqueOrThrow({ where: { id: productId } })
      expect(p.stock.toString()).toBe('100')
    })

    it('ikkinchi omborga qoldiq qo‘shilsa jami o‘sadi', async () => {
      const productId = await seedProduct(ctx.tenantId, ctx.warehouseId, { qty: '100' })
      const second = await testDb.warehouse.create({
        data: { tenantId: ctx.tenantId, name: 'Sklad' },
      })
      await testDb.productStock.create({
        data: { tenantId: ctx.tenantId, productId, warehouseId: second.id, qty: '40' },
      })
      const p = await testDb.product.findUniqueOrThrow({ where: { id: productId } })
      expect(p.stock.toString()).toBe('140')
    })

    it('qoldiq kamaysa jami ham kamayadi', async () => {
      const productId = await seedProduct(ctx.tenantId, ctx.warehouseId, { qty: '100' })
      await testDb.productStock.update({
        where: { productId_warehouseId: { productId, warehouseId: ctx.warehouseId } },
        data: { qty: '75.5' },
      })
      const p = await testDb.product.findUniqueOrThrow({ where: { id: productId } })
      expect(p.stock.toString()).toBe('75.5')
    })

    it('taqsimot o‘chirilsa jami 0 bo‘ladi', async () => {
      const productId = await seedProduct(ctx.tenantId, ctx.warehouseId, { qty: '100' })
      await testDb.productStock.delete({
        where: { productId_warehouseId: { productId, warehouseId: ctx.warehouseId } },
      })
      const p = await testDb.product.findUniqueOrThrow({ where: { id: productId } })
      expect(p.stock.toString()).toBe('0')
    })

    it('kod to‘g‘ridan-to‘g‘ri stock yozsa ham keyingi taqsimot uni tuzatadi', async () => {
      const productId = await seedProduct(ctx.tenantId, ctx.warehouseId, { qty: '100' })
      // Ilova kodidagi "xato": jami qoldiqni qo'lda o'zgartirish
      await testDb.product.update({ where: { id: productId }, data: { stock: '9999' } })
      // Keyingi haqiqiy harakat invariantni tiklaydi
      await testDb.productStock.update({
        where: { productId_warehouseId: { productId, warehouseId: ctx.warehouseId } },
        data: { qty: '80' },
      })
      const p = await testDb.product.findUniqueOrThrow({ where: { id: productId } })
      expect(p.stock.toString()).toBe('80')
    })
  })

  describe('I22: jurnal faqat qo‘shiladi', () => {
    it('audit yozuvini o‘zgartirib bo‘lmaydi', async () => {
      const entry = await testDb.auditEntry.create({
        data: { tenantId: ctx.tenantId, userId: ctx.userId, action: 'sale.create' },
      })
      await expect(
        testDb.auditEntry.update({ where: { id: entry.id }, data: { action: 'boshqa' } }),
      ).rejects.toThrow(/faqat qo/)
    })

    it('audit yozuvini o‘chirib bo‘lmaydi', async () => {
      const entry = await testDb.auditEntry.create({
        data: { tenantId: ctx.tenantId, action: 'sale.create' },
      })
      await expect(
        testDb.auditEntry.delete({ where: { id: entry.id } }),
      ).rejects.toThrow(/faqat qo/)
    })

    it('ombor harakatini o‘zgartirib va o‘chirib bo‘lmaydi', async () => {
      const productId = await seedProduct(ctx.tenantId, ctx.warehouseId)
      const mv = await testDb.stockMovement.create({
        data: {
          tenantId: ctx.tenantId, productId, productName: 'Sement M400', type: 'intake',
          qty: '10', balanceAfter: '110', warehouseId: ctx.warehouseId, date: new Date('2026-08-25'),
        },
      })
      await expect(
        testDb.stockMovement.update({ where: { id: mv.id }, data: { qty: '999' } }),
      ).rejects.toThrow(/faqat qo/)
      await expect(
        testDb.stockMovement.delete({ where: { id: mv.id } }),
      ).rejects.toThrow(/faqat qo/)
    })
  })
})
