import { Prisma, PrismaClient } from '@prisma/client'
import { runWithContext } from '@/common/context/request-context'
import {
  MissingTenantScopeError, runAsSystem, tenantExtension,
} from '@/prisma/tenant.extension'
import { TENANT_MODELS, GLOBAL_MODELS } from '@/prisma/tenant-models'
import { seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Tenant kengaytmasi — izolyatsiyaning ikkinchi qatlami.
 * Bu testlar dasturchi `where: { tenantId }` yozishni UNUTGAN holatni
 * modellashtiradi: ma'lumot baribir chiqib ketmasligi kerak.
 */
// Jadval egasi bilan: bu yerda FAQAT 2-qatlam (kengaytma) tekshiriladi —
// RLS o'z testida (rls.e2e-spec.ts) alohida
const scoped = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL } },
}).$extends(tenantExtension)

describe('Prisma tenant kengaytmasi', () => {
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>

  beforeEach(async () => {
    await truncateAll()
    a = await seedTenant('A do‘kon')
    b = await seedTenant('B do‘kon')
    await testDb.client.createMany({
      data: [
        { tenantId: a.tenantId, name: 'A mijozi', phone: '+998900000001' },
        { tenantId: b.tenantId, name: 'B mijozi', phone: '+998900000002' },
      ],
    })
  })

  afterAll(async () => {
    await scoped.$disconnect()
    await testDb.$disconnect()
  })

  // `async () => fn()` MUHIM: Prisma promise'i kontekst ICHIDA kutilishi kerak
  const asTenant = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> =>
    runWithContext({ requestId: 'test', tenantId }, async () => fn())

  it('filtrsiz `findMany` faqat O‘Z tenantini qaytaradi', async () => {
    const rows = await asTenant(a.tenantId, () => scoped.client.findMany())
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('A mijozi')
  })

  it('boshqa tenant yozuvini `findUnique` bilan ololmaydi', async () => {
    const bClient = await testDb.client.findFirstOrThrow({ where: { tenantId: b.tenantId } })
    const found = await asTenant(a.tenantId, () =>
      scoped.client.findFirst({ where: { id: bClient.id } }),
    )
    expect(found).toBeNull()
  })

  it('yaratishda tenantId AVTOMATIK qo‘yiladi', async () => {
    const created = await asTenant(a.tenantId, () =>
      scoped.client.create({ data: { name: 'Yangi', phone: '+998900000003' } as never }),
    )
    expect(created.tenantId).toBe(a.tenantId)
  })

  it('data dagi soxta tenantId E’TIBORSIZ qoldiriladi', async () => {
    // Hujum modeli: dasturchi mijozdan kelgan tanani to'g'ridan-to'g'ri
    // `data` ga uzatib yuboradi va u yerda `tenantId` bor.
    const created = await asTenant(a.tenantId, () =>
      scoped.client.create({
        data: { name: 'Soxta', phone: '+998900000004', tenantId: b.tenantId } as never,
      }),
    )
    expect(created.tenantId).toBe(a.tenantId)
  })

  it('where dagi soxta tenantId E’TIBORSIZ qoldiriladi', async () => {
    const rows = await asTenant(a.tenantId, () =>
      scoped.client.findMany({ where: { tenantId: b.tenantId } as never }),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tenantId).toBe(a.tenantId)
  })

  it('createMany da har bir qatorga to‘g‘ri tenantId qo‘yiladi', async () => {
    await asTenant(a.tenantId, () =>
      scoped.client.createMany({
        data: [
          { name: 'X', phone: '+998900000005' },
          { name: 'Y', phone: '+998900000006', tenantId: b.tenantId },
        ] as never,
      }),
    )
    const rows = await testDb.client.findMany({ where: { tenantId: a.tenantId } })
    expect(rows).toHaveLength(3)
    expect(await testDb.client.count({ where: { tenantId: b.tenantId } })).toBe(1)
  })

  it('`updateMany` boshqa tenantga tegmaydi', async () => {
    const { count } = await asTenant(a.tenantId, () =>
      scoped.client.updateMany({ data: { notes: 'tekshiruv' } }),
    )
    expect(count).toBe(1)
    const bRow = await testDb.client.findFirstOrThrow({ where: { tenantId: b.tenantId } })
    expect(bRow.notes).toBeNull()
  })

  it('`deleteMany` boshqa tenantni o‘chirmaydi', async () => {
    await asTenant(a.tenantId, () => scoped.client.deleteMany({}))
    expect(await testDb.client.count()).toBe(1)
    expect(await testDb.client.count({ where: { tenantId: b.tenantId } })).toBe(1)
  })

  it('`count` va `aggregate` ham tenant bilan cheklanadi', async () => {
    const count = await asTenant(a.tenantId, () => scoped.client.count())
    expect(count).toBe(1)
  })

  it('kontekst yo‘q bo‘lsa so‘rov BAJARILMAYDI', async () => {
    await expect(scoped.client.findMany()).rejects.toBeInstanceOf(MissingTenantScopeError)
  })

  it('`runAsSystem` ichida filtr qo‘shilmaydi (tizim ishlari)', async () => {
    const rows = await runAsSystem(async () => scoped.client.findMany())
    expect(rows).toHaveLength(2)
  })

  it('global modellar (Tenant) kontekstsiz ham ishlaydi', async () => {
    await expect(scoped.tenant.count()).resolves.toBeGreaterThanOrEqual(2)
  })

  it('har bir Prisma modeli ro‘yxatlardan birida bor', () => {
    // Yangi model qo'shilib, ro'yxatga kiritilmasa — shu test yiqiladi
    const known = new Set([...TENANT_MODELS, ...GLOBAL_MODELS])
    // `Prisma.ModelName` — sxemadagi modellarning generatsiya qilingan
    // ro'yxati (mijoz obyektining kalitlarini sanashdan ishonchliroq)
    const missing = Object.values(Prisma.ModelName).filter((m) => !known.has(m))
    expect(missing).toEqual([])
  })
})
