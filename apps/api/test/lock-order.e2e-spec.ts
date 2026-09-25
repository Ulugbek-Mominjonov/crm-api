import { runWithContext } from '@/common/context/request-context'
import { lockProducts } from '@/common/db/lock'
import { appDb, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Qulflash yordamchisi (T-042, 01 §1.7).
 *
 * Ilova ulanishi (`crm_app`, RLS) bilan — qulf production'dagi kabi tenant
 * tranzaksiyasida olinadi.
 */
describe('Qulflash yordamchisi (lock-order)', () => {
  let ctx: Awaited<ReturnType<typeof seedTenant>>
  let p1: string
  let p2: string
  let p3: string

  beforeEach(async () => {
    await truncateAll()
    ctx = await seedTenant()
    ;[p1, p2, p3] = await Promise.all([
      seedProduct(ctx.tenantId, ctx.warehouseId, { sku: 'A' }),
      seedProduct(ctx.tenantId, ctx.warehouseId, { sku: 'B' }),
      seedProduct(ctx.tenantId, ctx.warehouseId, { sku: 'C' }),
    ])
  })

  afterAll(async () => {
    await appDb.$disconnect()
    await testDb.$disconnect()
  })

  const inTenant = <T>(fn: Parameters<typeof appDb.inTenantTransaction<T>>[1]): Promise<T> =>
    runWithContext({ requestId: 'test', tenantId: ctx.tenantId }, async () =>
      appDb.inTenantTransaction(ctx.tenantId, fn),
    )

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  it('teskari tartibda so‘ralgan qulflar deadlock bermaydi (id tartibida olinadi)', async () => {
    // 20 juft parallel tranzaksiya: biri [p1,p2,p3], ikkinchisi [p3,p2,p1].
    // Tartiblanmagan qulflashda Postgres ulardan birini 40P01 bilan uzardi
    const rounds = Array.from({ length: 20 }, (_, i) =>
      Promise.all([
        inTenant(async (tx) => {
          await lockProducts(tx, [p1, p2, p3])
          await sleep(i % 3)
        }),
        inTenant(async (tx) => {
          await lockProducts(tx, [p3, p2, p1])
          await sleep(i % 2)
        }),
      ]),
    )
    await expect(Promise.all(rounds)).resolves.toHaveLength(20)
  })

  it('qulf ushlanguncha boshqa yozuvchi KUTADI', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let locked!: () => void
    const isLocked = new Promise<void>((resolve) => { locked = resolve })

    const holder = inTenant(async (tx) => {
      await lockProducts(tx, [p1])
      locked()
      await held
      await tx.product.update({ where: { id: p1 }, data: { name: 'Birinchi' } })
    })
    await isLocked

    const started = Date.now()
    const writer = testDb.product.update({ where: { id: p1 }, data: { name: 'Ikkinchi' } })
    await sleep(300)
    release()
    await Promise.all([holder, writer])

    // Yozuvchi qulf bo'shaguncha kutdi va OXIRIDA yozdi
    expect(Date.now() - started).toBeGreaterThanOrEqual(290)
    expect((await testDb.product.findUniqueOrThrow({ where: { id: p1 } })).name).toBe('Ikkinchi')
  })

  it('tranzaksiyasiz qulf olib bo‘lmaydi', async () => {
    // Tranzaksiya mijozini tashqariga olib chiqish — qulf darhol bo'shardi
    const escaped = await inTenant(async (tx) => tx)
    await expect(lockProducts(escaped, [p1])).rejects.toThrow(/tranzaksiya/)
  })

  it('o‘chirilgan va boshqa tenant mahsuloti qulflanmaydi (qaytmaydi)', async () => {
    const other = await seedTenant('B do‘kon')
    const foreign = await seedProduct(other.tenantId, other.warehouseId)
    await testDb.product.update({ where: { id: p2 }, data: { deletedAt: new Date() } })

    const locked = await inTenant((tx) => lockProducts(tx, [p1, p2, foreign]))
    expect([...locked.keys()]).toEqual([p1])
  })
})
