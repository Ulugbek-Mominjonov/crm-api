import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Tenant izolyatsiyasi — BAZA darajasida.
 *
 * Ilova qatlamidagi filtr (Prisma kengaytmasi, RLS) unutilishi mumkin;
 * kompozit tashqi kalit esa unutilmaydi. Bu testlar aynan shuni isbotlaydi.
 */
describe('Tenantlararo havola imkonsiz', () => {
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>

  beforeEach(async () => {
    await truncateAll()
    a = await seedTenant('A do‘kon')
    b = await seedTenant('B do‘kon')
  })
  afterAll(async () => { await testDb.$disconnect() })

  it('A ning cheki B ning mahsulotiga havola qila olmaydi', async () => {
    const productOfB = await seedProduct(b.tenantId, b.warehouseId)
    const sale = await testDb.sale.create({
      data: {
        tenantId: a.tenantId, number: 'CHEK-1001', subtotal: 1000n, total: 1000n,
        paidCash: 1000n, date: new Date('2026-08-25'),
      },
    })
    await expect(
      testDb.saleItem.create({
        data: {
          tenantId: a.tenantId, saleId: sale.id, productId: productOfB,
          name: 'O‘zganiki', unit: 'qop', qty: '1', baseQty: '1',
          price: 1000n, cost: 500n, lineNo: 1,
        },
      }),
    ).rejects.toThrow()
  })

  it('A ning mahsuloti B ning omboriga qoldiq yoza olmaydi', async () => {
    const productOfA = await seedProduct(a.tenantId, a.warehouseId)
    await expect(
      testDb.productStock.create({
        data: { tenantId: a.tenantId, productId: productOfA, warehouseId: b.warehouseId, qty: '10' },
      }),
    ).rejects.toThrow()
  })

  it('A ning cheki B ning mijoziga bog‘lanmaydi', async () => {
    const { id: clientOfB } = await testDb.client.create({
      data: { tenantId: b.tenantId, name: 'B mijozi', phone: '+998900000009' },
    })
    await expect(
      testDb.sale.create({
        data: {
          tenantId: a.tenantId, number: 'CHEK-1002', subtotal: 1000n, total: 1000n,
          status: 'pending', customerId: clientOfB, date: new Date('2026-08-25'),
        },
      }),
    ).rejects.toThrow()
  })

  it('A ning kirim buyurtmasi B ning ta’minotchisiga bog‘lanmaydi', async () => {
    const { id: supplierOfB } = await testDb.supplier.create({
      data: { tenantId: b.tenantId, name: 'B ta’minotchisi', phone: '+998900000008' },
    })
    await expect(
      testDb.purchaseOrder.create({
        data: {
          tenantId: a.tenantId, number: 'BUY-1001', supplierId: supplierOfB,
          total: 1000n, date: new Date('2026-08-25'),
        },
      }),
    ).rejects.toThrow()
  })

  it('A ning kirish hisobi B ning xodimiga bog‘lanmaydi', async () => {
    await expect(
      testDb.user.create({
        data: {
          tenantId: a.tenantId, employeeId: b.employeeId,
          email: 'x@crm.uz', passwordHash: 'x', role: 'sotuvchi',
        },
      }),
    ).rejects.toThrow()
  })

  it('bir tenant ichidagi havola normal ishlaydi', async () => {
    const productOfA = await seedProduct(a.tenantId, a.warehouseId)
    const sale = await testDb.sale.create({
      data: {
        tenantId: a.tenantId, number: 'CHEK-1003', subtotal: 1000n, total: 1000n,
        paidCash: 1000n, date: new Date('2026-08-25'),
      },
    })
    await expect(
      testDb.saleItem.create({
        data: {
          tenantId: a.tenantId, saleId: sale.id, productId: productOfA,
          name: 'Sement', unit: 'qop', qty: '1', baseQty: '1',
          price: 1000n, cost: 500n, lineNo: 1,
        },
      }),
    ).resolves.toBeTruthy()
  })
})
