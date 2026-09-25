import { runWithContext } from '@/common/context/request-context'
import { DocNumberService, type DocPrefix } from '@/modules/doc-numbers/doc-number.service'
import { appDb, seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Hujjat raqami generatori (T-051, I12): ketma-ket, bo'shliqsiz, tenant
 * ichida noyob. Ilova ulanishi (`crm_app`, RLS) bilan — production'dagi kabi.
 */
describe('Hujjat raqamlari (doc-number-concurrency)', () => {
  const numbers = new DocNumberService(appDb)
  let a: Awaited<ReturnType<typeof seedTenant>>

  beforeEach(async () => {
    await truncateAll()
    a = await seedTenant('A do‘kon')
  })

  afterAll(async () => {
    await appDb.$disconnect()
    await testDb.$disconnect()
  })

  const next = (tenantId: string, prefix: DocPrefix = 'CHEK') =>
    runWithContext({ requestId: 'test', tenantId }, () =>
      appDb.inTenantTransaction(tenantId, () => numbers.next(prefix)),
    )
  const seq = (n: string) => Number(n.split('-')[1])

  it('raqamlar ketma-ket: CHEK-1001, CHEK-1002', async () => {
    expect(await next(a.tenantId)).toBe('CHEK-1001')
    expect(await next(a.tenantId)).toBe('CHEK-1002')
  })

  it('parallel 100 so‘rovda takroriy raqam YO‘Q va bo‘shliq yo‘q', async () => {
    const result = await Promise.all(Array.from({ length: 100 }, () => next(a.tenantId)))
    expect(new Set(result).size).toBe(100)
    expect(result.map(seq).sort((x, y) => x - y)).toEqual(Array.from({ length: 100 }, (_, i) => 1001 + i))
  }, 60_000)

  it('bekor qilingan tranzaksiya raqamni "yemaydi" — bo‘shliq qolmaydi', async () => {
    await expect(
      runWithContext({ requestId: 'test', tenantId: a.tenantId }, () =>
        appDb.inTenantTransaction(a.tenantId, async () => {
          await numbers.next('CHEK')
          throw new Error('sotuv yiqildi')
        }),
      ),
    ).rejects.toThrow('sotuv yiqildi')
    expect(await next(a.tenantId)).toBe('CHEK-1001')
  })

  it('prefikslar va tenantlar mustaqil', async () => {
    const b = await seedTenant('B do‘kon')
    expect(await next(a.tenantId, 'CHEK')).toBe('CHEK-1001')
    expect(await next(a.tenantId, 'QAYT')).toBe('QAYT-1001')
    expect(await next(a.tenantId, 'TKLF')).toBe('TKLF-1001')
    expect(await next(a.tenantId, 'BUY')).toBe('BUY-1001')
    expect(await next(b.tenantId, 'CHEK')).toBe('CHEK-1001')
  })

  it('provisioning yaratgan hisoblagich (1000) dan davom etadi', async () => {
    await testDb.docCounter.create({ data: { tenantId: a.tenantId, prefix: 'CHEK', lastNo: 1041n } })
    expect(await next(a.tenantId)).toBe('CHEK-1042')
  })
})
