import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { seedFileRow } from './helpers/files'
import { uuidv7 } from '@/common/ids'

/**
 * `files` reyestri (T-087, 09 §9.5) — baza darajasidagi kafolatlar: ilova
 * kodidagi xato ham ularni buzolmaydi.
 */
describe('files sxemasi', () => {
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>

  beforeEach(async () => {
    await truncateAll()
    a = await seedTenant('A do‘kon')
    b = await seedTenant('B do‘kon')
  })
  afterAll(async () => { await testDb.$disconnect() })

  const row = (tenantId: string, overrides: Record<string, unknown> = {}) => {
    const id = uuidv7()
    return {
      id, tenantId, kind: 'product_image' as const, key: `t/${tenantId}/products/${id}/orig.png`, bucket: 'media',
      mime: 'image/png', sizeBytes: 10n, sha256: 'a'.repeat(64), ...overrides,
    }
  }

  it('bir tarkib (tenant, sha256, kind) bir marta; boshqa tur yoki boshqa tenant — mumkin', async () => {
    await testDb.file.create({ data: row(a.tenantId) })
    await expect(testDb.file.create({ data: row(a.tenantId) })).rejects.toThrow()
    await expect(testDb.file.create({ data: row(a.tenantId, { kind: 'avatar' }) })).resolves.toBeTruthy()
    await expect(testDb.file.create({ data: row(b.tenantId) })).resolves.toBeTruthy()
  })

  it('kalit noyob; hajm musbat; xesh — 64 hex', async () => {
    const first = row(a.tenantId)
    await testDb.file.create({ data: first })
    await expect(testDb.file.create({ data: row(b.tenantId, { key: first.key, sha256: 'b'.repeat(64) }) })).rejects.toThrow()
    await expect(testDb.file.create({ data: row(a.tenantId, { sizeBytes: 0n, sha256: 'c'.repeat(64) }) })).rejects.toThrow()
    await expect(testDb.file.create({ data: row(a.tenantId, { sha256: 'XYZ' }) })).rejects.toThrow()
  })

  it('mahsulot faqat O‘Z tenantining fayliga havola qiladi (kompozit FK)', async () => {
    const foreign = await seedFileRow(b.tenantId)
    const productId = await seedProduct(a.tenantId, a.warehouseId)
    await expect(testDb.product.update({ where: { id: productId }, data: { imageFileId: foreign.id } })).rejects.toThrow()
  })

  it('fayl o‘chsa mahsulot qoladi: faqat image_file_id NULL (tenant_id emas)', async () => {
    const file = await seedFileRow(a.tenantId)
    const productId = await seedProduct(a.tenantId, a.warehouseId)
    await testDb.product.update({ where: { id: productId }, data: { imageFileId: file.id } })
    await testDb.file.delete({ where: { id: file.id } })
    const product = await testDb.product.findUniqueOrThrow({ where: { id: productId } })
    expect(product).toMatchObject({ imageFileId: null, tenantId: a.tenantId, deletedAt: null })
  })

  it('band hajm manfiy bo‘lmaydi', async () => {
    await expect(
      testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { storageUsedBytes: -1n } }),
    ).rejects.toThrow()
  })
})
