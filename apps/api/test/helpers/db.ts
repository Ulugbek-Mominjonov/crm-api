import { ConfigService } from '@nestjs/config'
import { PrismaClient } from '@prisma/client'
import type { Env } from '@/config/env.schema'
import { PrismaService } from '@/prisma/prisma.service'

/**
 * Test ma'lumotlarini tayyorlash, tozalash va tekshirish uchun — jadval
 * EGASI (RLS'siz): bir nechta tenant yozuvini bevosita yaratadi.
 *
 * Mock ISHLATILMAYDI: tranzaksiya, qulf va cheklovlar aynan mock'da
 * tekshirilmaydigan narsalar — ular esa eng nozik joy.
 */
export const testDb = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
})

/**
 * ILOVA ulanishi — production'dagi kabi `crm_app` roli, RLS qo'llanadi
 * (`createTestApp` shu nusxani beradi). Tenant tranzaksiyasiz ishlaydigan
 * har bir kod yo'li testda darhol ko'rinadi.
 */
export const appDb = new PrismaService(
  new ConfigService<Env, true>({
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  }),
)

/** Barcha domen jadvallarini tozalaydi (migratsiya tarixiga tegmaydi). */
export async function truncateAll(): Promise<void> {
  const rows = await testDb.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `
  if (rows.length === 0) return
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/** Minimal tenant: sozlama, holat, sukut ombor, hisoblagichlar */
export async function seedTenant(name = 'Test do‘kon'): Promise<{
  tenantId: string
  warehouseId: string
  employeeId: string
  userId: string
}> {
  const tenant = await testDb.tenant.create({ data: { name } })
  await testDb.settings.create({ data: { tenantId: tenant.id } })
  const warehouse = await testDb.warehouse.create({
    data: { tenantId: tenant.id, name: 'Asosiy ombor', isDefault: true },
  })
  await testDb.tenantState.create({
    data: { tenantId: tenant.id, activeWarehouseId: warehouse.id },
  })
  const employee = await testDb.employee.create({
    data: {
      tenantId: tenant.id,
      name: 'Test Admin',
      position: 'Direktor',
      phone: '+998900000000',
      hiredAt: new Date('2026-01-01'),
    },
  })
  const user = await testDb.user.create({
    data: {
      tenantId: tenant.id,
      employeeId: employee.id,
      // uuid v7 boshi — vaqt: ketma-ket yaratilgan tenantlarda bir xil bo'lardi
      email: `admin+${tenant.id.slice(-12)}@crm.uz`,
      passwordHash: 'x',
      role: 'admin',
    },
  })
  return {
    tenantId: tenant.id,
    warehouseId: warehouse.id,
    employeeId: employee.id,
    userId: user.id,
  }
}

/** Sinov mahsuloti */
export async function seedProduct(
  tenantId: string,
  warehouseId: string,
  overrides: Partial<{ sku: string; price: bigint; cost: bigint; qty: string; supplierId: string }> = {},
): Promise<string> {
  const product = await testDb.product.create({
    data: {
      tenantId,
      name: 'Sement M400',
      sku: overrides.sku ?? `SKU-${Math.random().toString(36).slice(2, 8)}`,
      unit: 'qop',
      price: overrides.price ?? 60_000n,
      wholesalePrice: 55_000n,
      cost: overrides.cost ?? 45_000n,
      supplierId: overrides.supplierId ?? null,
    },
  })
  await testDb.productStock.create({
    data: {
      tenantId,
      productId: product.id,
      warehouseId,
      qty: overrides.qty ?? '100',
    },
  })
  return product.id
}

/** Ochiq kassa smenasi (I8): smena qatori + `tenant_state` dagi joriy smena */
export async function openShift(tenantId: string, openingBalance = 0n): Promise<string> {
  const shift = await testDb.cashShift.create({
    data: { tenantId, openedAt: new Date(), openingBalance },
  })
  await testDb.tenantState.update({
    where: { tenantId },
    data: { activeShiftId: shift.id, cashBalance: openingBalance },
  })
  return shift.id
}

/** Sinov mijozi */
export async function seedClient(
  tenantId: string,
  overrides: Partial<{ name: string; bonusPoints: bigint; creditLimit: bigint | null; paymentTermDays: number | null }> = {},
): Promise<string> {
  const client = await testDb.client.create({
    data: {
      tenantId,
      name: overrides.name ?? 'Ali Valiyev',
      phone: '+998901112233',
      bonusPoints: overrides.bonusPoints ?? 0n,
      creditLimit: overrides.creditLimit ?? null,
      paymentTermDays: overrides.paymentTermDays ?? null,
    },
  })
  return client.id
}
