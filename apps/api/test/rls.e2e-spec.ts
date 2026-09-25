import { PrismaClient } from '@prisma/client'
import { seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Row Level Security — izolyatsiyaning uchinchi qatlami.
 *
 * Bu testlar ilova roli (`crm_app`) bilan ulanadi: u jadval EGASI emas,
 * shuning uchun RLS unga qo'llanadi. Egasi (`crm`) siyosatlarni chetlab
 * o'tadi — shuning uchun migratsiya va tizim ishlari egasi bilan bajariladi.
 */
const APP_URL =
  process.env.DATABASE_URL?.replace('//crm:crm@', '//crm_app:crm_app@') ?? ''

const appDb = new PrismaClient({ datasources: { db: { url: APP_URL } } })

/** `crm_app` roli bilan tenant kontekstida ishlaydi */
async function asTenant<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof appDb.$transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return appDb.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx)
  })
}

describe('Row Level Security', () => {
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
    await appDb.$disconnect()
    await testDb.$disconnect()
  })

  it('`tenant_id` li HAR jadvalda RLS yoqilgan, majburiy va siyosati bor', async () => {
    // Sanoq qo'lda yozilmaydi: yangi tenant jadvali siyosatsiz qolsa — test yiqiladi
    const rows = await testDb.$queryRaw<{ table: string; rls: boolean; forced: boolean; policy: boolean }[]>`
      SELECT c.relname AS table, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
             EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public' AND p.tablename = c.relname
                        AND p.policyname LIKE '%_tenant_isolation') AS policy
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND EXISTS (SELECT 1 FROM information_schema.columns col
                      WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'tenant_id')
    `
    expect(rows.length).toBeGreaterThanOrEqual(29)
    expect(rows.filter((r) => !r.rls || !r.forced || !r.policy).map((r) => r.table)).toEqual([])
  })

  it('kirish siyosati: faqat berilgan ANIQ email ko‘rinadi va faqat o‘qish uchun', async () => {
    const aUser = await testDb.user.findUniqueOrThrow({ where: { id: a.userId } })
    const lookup = <T>(fn: (tx: Parameters<Parameters<typeof appDb.$transaction>[0]>[0]) => Promise<T>) =>
      appDb.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.auth_email', ${aUser.email}, true)`
        return fn(tx)
      })

    // Sozlamasiz — hech kim ko'rinmaydi
    expect(await appDb.user.findMany()).toEqual([])
    // Email bo'yicha — faqat o'sha foydalanuvchi (tenant noma'lum bo'lsa ham)
    const found = await lookup((tx) => tx.user.findMany({ select: { id: true } }))
    expect(found).toEqual([{ id: a.userId }])
    // Siyosat faqat SELECT uchun: yozib bo'lmaydi
    const { count } = await lookup((tx) =>
      tx.user.updateMany({ where: { id: a.userId }, data: { isActive: false } }),
    )
    expect(count).toBe(0)
  })

  it('ilova roli FAQAT o‘z tenantini ko‘radi — filtr yozilmasa ham', async () => {
    const rows = await asTenant(a.tenantId, (tx) => tx.client.findMany())
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('A mijozi')
  })

  it('boshqa tenant qatorini `id` bilan ham ololmaydi', async () => {
    const bRow = await testDb.client.findFirstOrThrow({ where: { tenantId: b.tenantId } })
    const found = await asTenant(a.tenantId, (tx) =>
      tx.client.findUnique({ where: { id: bRow.id } }),
    )
    expect(found).toBeNull()
  })

  it('boshqa tenant qatorini o‘zgartira olmaydi', async () => {
    const bRow = await testDb.client.findFirstOrThrow({ where: { tenantId: b.tenantId } })
    const { count } = await asTenant(a.tenantId, (tx) =>
      tx.client.updateMany({ where: { id: bRow.id }, data: { notes: 'buzildi' } }),
    )
    expect(count).toBe(0)
    const after = await testDb.client.findUniqueOrThrow({ where: { id: bRow.id } })
    expect(after.notes).toBeNull()
  })

  it('boshqa tenant nomidan yozuv QO‘SHA olmaydi (WITH CHECK)', async () => {
    await expect(
      asTenant(a.tenantId, (tx) =>
        tx.client.create({
          data: { tenantId: b.tenantId, name: 'Soxta', phone: '+998900000007' },
        }),
      ),
    ).rejects.toThrow()
  })

  it('boshqa tenant qatorini o‘chira olmaydi', async () => {
    const { count } = await asTenant(a.tenantId, (tx) =>
      tx.client.deleteMany({ where: { tenantId: b.tenantId } }),
    )
    expect(count).toBe(0)
    expect(await testDb.client.count({ where: { tenantId: b.tenantId } })).toBe(1)
  })

  it('tenant o‘rnatilmagan bo‘lsa HECH NARSA ko‘rinmaydi', async () => {
    // Kontekstsiz: `current_tenant_id()` NULL → hech bir qator mos kelmaydi
    const rows = await appDb.client.findMany()
    expect(rows).toEqual([])
  })

  it('ilova roli RLS ni chetlab o‘ta olmaydi', async () => {
    const rows = await testDb.$queryRaw<{ rolbypassrls: boolean }[]>`
      SELECT rolbypassrls FROM pg_roles WHERE rolname = 'crm_app'
    `
    expect(rows[0]!.rolbypassrls).toBe(false)
  })

  it('jadval egasiga ham RLS qo‘llanadi (FORCE)', async () => {
    const rows = await testDb.$queryRaw<{ relforcerowsecurity: boolean }[]>`
      SELECT relforcerowsecurity FROM pg_class WHERE relname = 'clients'
    `
    expect(rows[0]!.relforcerowsecurity).toBe(true)
  })
})
