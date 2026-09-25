import { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'
import { PRODUCT_CATEGORIES } from '@crm/shared'

/**
 * Ishlab chiqish uchun demo do'kon.
 *
 * Mijoz ilovasidagi mock ma'lumot bilan mos: shunda frontend serverga
 * ulangach ekranlar bo'sh ko'rinmaydi va qo'lda ma'lumot kiritish shart emas.
 *
 * PRODUCTION'da ISHLAMAYDI — real bazaga soxta sotuv tushishi mumkin emas.
 */
// Jadval egasi bilan: seed bir nechta jadvalga tenantni bevosita yozadi,
// ilova roli (`crm_app`) esa RLS bilan cheklangan
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL } },
})

const DEMO_EMAIL = 'admin@crm.uz'
const DEMO_PASSWORD = 'admin12345'

// Telefonlar API saqlaydigan ko'rinishda — raqamlar va boshidagi `+`
// (common/validation/phone.ts): aks holda raqam bo'yicha qidiruv topmaydi
const SUPPLIERS = [
  { name: 'Bekabad Sement', phone: '+998712001010', contactPerson: 'Rustam Aliyev', tin: '201234567', paymentTermDays: 14 },
  { name: 'Qizilqum G‘isht Zavodi', phone: '+998652234455', contactPerson: 'Sanjar Umarov', tin: '302556677', paymentTermDays: 30 },
  { name: 'MetalTrade MChJ', phone: '+998712447788', contactPerson: 'Igor Petrov', tin: '403889900', paymentTermDays: 7 },
]

// `altFactor` — 1 ta QO'SHIMCHA birlik nechta ASOSIY birlik (`@crm/shared` units):
// asosiy `qop`, qo'shimcha `kg` → 1 kg = 1/50 qop = 0.02
const PRODUCTS = [
  { name: 'Sement M400 (50 kg)', sku: 'SEM-400-50', category: 'Sement va aralashmalar', unit: 'qop', price: 62_000n, wholesale: 58_000n, cost: 52_000n, qty: '240', min: '40', altUnit: 'kg', altFactor: '0.02' },
  { name: 'Sement M500 (50 kg)', sku: 'SEM-500-50', category: 'Sement va aralashmalar', unit: 'qop', price: 71_000n, wholesale: 66_000n, cost: 59_000n, qty: '120', min: '30', altUnit: 'kg', altFactor: '0.02' },
  { name: 'Qizil g‘isht M100', sku: 'GISHT-M100', category: 'G‘isht va bloklar', unit: 'dona', price: 1_400n, wholesale: 1_250n, cost: 1_050n, qty: '18000', min: '3000' },
  { name: 'Gazoblok 600×300×200', sku: 'BLOK-6032', category: 'G‘isht va bloklar', unit: 'dona', price: 24_000n, wholesale: 22_000n, cost: 19_500n, qty: '860', min: '150' },
  { name: 'Armatura A500 12mm', sku: 'ARM-A500-12', category: 'Metall va armatura', unit: 'metr', price: 15_500n, wholesale: 14_200n, cost: 12_800n, qty: '2400', min: '400' },
  { name: 'Suvoq aralashmasi 25 kg', sku: 'SUV-25', category: 'Sement va aralashmalar', unit: 'qop', price: 38_000n, wholesale: 35_000n, cost: 30_000n, qty: '95', min: '25' },
  { name: 'Fasad bo‘yog‘i oq 20 l', sku: 'BOY-FAS-20', category: 'Bo‘yoq va laklar', unit: 'litr', price: 34_000n, wholesale: 31_000n, cost: 27_500n, qty: '180', min: '40' },
  { name: 'Kabel VVG 3×2.5', sku: 'KAB-VVG-325', category: 'Elektr mollari', unit: 'metr', price: 12_800n, wholesale: 11_500n, cost: 9_900n, qty: '1500', min: '300' },
  { name: 'PPR quvur 25mm', sku: 'PPR-25', category: 'Santexnika', unit: 'metr', price: 9_600n, wholesale: 8_800n, cost: 7_400n, qty: '640', min: '120' },
  { name: 'Gipsokarton 12.5mm', sku: 'GKL-125', category: 'Yog‘och va gips', unit: 'm2', price: 41_000n, wholesale: 38_000n, cost: 33_000n, qty: '310', min: '60' },
  { name: 'Perforator 850W', sku: 'ASB-PERF-850', category: 'Asboblar', unit: 'dona', price: 1_450_000n, wholesale: 1_340_000n, cost: 1_180_000n, qty: '12', min: '3' },
  { name: 'Qum (tonna)', sku: 'QUM-T', category: 'Boshqa', unit: 'm3', price: 180_000n, wholesale: 165_000n, cost: 140_000n, qty: '38', min: '10' },
] as const

const CLIENTS = [
  { name: 'Alisher Qodirov', phone: '+998901234567', group: 'retail', type: 'individual' },
  { name: 'Qurilish Servis MChJ', phone: '+998712332211', group: 'wholesale', type: 'company', creditLimit: 30_000_000n, paymentTermDays: 21 },
  { name: 'Zafar Mahmudov', phone: '+998935551122', group: 'vip', type: 'individual', creditLimit: 10_000_000n, paymentTermDays: 14 },
] as const

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo ma’lumot production bazasiga yozilmaydi')
  }

  const existing = await prisma.tenant.findFirst({ where: { name: 'Qurilish Mollari (demo)' } })
  if (existing) {
    console.warn('Demo tenant allaqachon bor, o‘tkazib yuborildi:', existing.id)
    return
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id })

  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: 'Qurilish Mollari (demo)', plan: 'pro' } })
    // Egasi superuser bo'lmasa ham RLS (WITH CHECK) yozuvlarni qabul qilsin
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`
    await tx.settings.create({
      data: {
        tenantId: tenant.id,
        storeName: 'Qurilish Mollari',
        receiptPhone: '+998 71 200 00 00',
        receiptAddress: 'Toshkent sh., Qurilish ko‘chasi 1',
        receiptFooter: 'Xaridingiz uchun rahmat!',
        onboarded: true,
      },
    })

    const main = await tx.warehouse.create({
      data: { tenantId: tenant.id, name: 'Asosiy ombor', isDefault: true },
    })
    const sklad = await tx.warehouse.create({
      data: { tenantId: tenant.id, name: 'Sklad', address: 'Sergeli, 4-uy' },
    })
    await tx.tenantState.create({
      data: { tenantId: tenant.id, activeWarehouseId: main.id },
    })

    await tx.category.createMany({
      data: PRODUCT_CATEGORIES.map((name, i) => ({ tenantId: tenant.id, name, sortOrder: i })),
    })
    await tx.docCounter.createMany({
      data: ['CHEK', 'QAYT', 'TKLF', 'BUY'].map((prefix) => ({ tenantId: tenant.id, prefix })),
    })

    const categories = await tx.category.findMany({ where: { tenantId: tenant.id } })
    const catId = (name: string): string =>
      categories.find((c) => c.name === name)?.id ?? categories[0]!.id

    const owner = await tx.employee.create({
      data: { tenantId: tenant.id, name: 'Bobur Toshmatov', position: 'Direktor', phone: '+998901112233', hiredAt: new Date('2024-03-01') },
    })
    await tx.user.create({
      data: { tenantId: tenant.id, employeeId: owner.id, email: DEMO_EMAIL, passwordHash, role: 'admin' },
    })

    for (const [i, e] of [
      { name: 'Otabek Normatov', position: 'Sotuvchi', role: 'sotuvchi' as const, email: 'sotuvchi@crm.uz' },
      { name: 'Nodira Saidova', position: 'Omborchi', role: 'omborchi' as const, email: 'ombor@crm.uz' },
      { name: 'Jasur Aliyev', position: 'Menejer', role: 'manager' as const, email: 'manager@crm.uz' },
    ].entries()) {
      const emp = await tx.employee.create({
        data: { tenantId: tenant.id, name: e.name, position: e.position, phone: `+99890222000${i}`, hiredAt: new Date('2025-01-15') },
      })
      await tx.user.create({
        data: { tenantId: tenant.id, employeeId: emp.id, email: e.email, passwordHash, role: e.role },
      })
    }

    const suppliers = []
    for (const s of SUPPLIERS) {
      suppliers.push(await tx.supplier.create({ data: { tenantId: tenant.id, ...s } }))
    }

    for (const [i, p] of PRODUCTS.entries()) {
      const product = await tx.product.create({
        data: {
          tenantId: tenant.id,
          name: p.name,
          sku: p.sku,
          barcode: `478${String(1000000 + i).padStart(10, '0')}`,
          categoryId: catId(p.category),
          unit: p.unit,
          price: p.price,
          wholesalePrice: p.wholesale,
          cost: p.cost,
          minStock: p.min,
          supplierId: suppliers[i % suppliers.length]!.id,
          ...('altUnit' in p ? { altUnit: p.altUnit, altFactor: p.altFactor } : {}),
        },
      })
      // Qoldiq ikki ombor bo'yicha taqsimlanadi — I1 triggeri jamini hisoblaydi
      await tx.productStock.create({
        data: { tenantId: tenant.id, productId: product.id, warehouseId: main.id, qty: p.qty },
      })
      if (i % 3 === 0) {
        await tx.productStock.create({
          data: { tenantId: tenant.id, productId: product.id, warehouseId: sklad.id, qty: '25' },
        })
      }
    }

    for (const c of CLIENTS) {
      await tx.client.create({
        data: { tenantId: tenant.id, status: 'active', ...c },
      })
    }
  }, { timeout: 30_000 })

  const counts = {
    mahsulot: await prisma.product.count(),
    mijoz: await prisma.client.count(),
    xodim: await prisma.employee.count(),
    ombor: await prisma.warehouse.count(),
  }
  console.warn('Demo do‘kon yaratildi:', counts)
  console.warn(`Kirish: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`)
}

main()
  .catch((err: unknown) => {
    console.error('Seed xatosi:', err)
    process.exitCode = 1
  })
  .finally(() => void prisma.$disconnect())
