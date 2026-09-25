import { Logger, type INestApplication } from '@nestjs/common'
import { EXPORT_TTL_MS, FileGcJobs, ORPHAN_GRACE_MS, PENDING_TTL_MS, PURGE_AFTER_MS } from '@/modules/files/files.jobs'
import { ImageVariantsWorker } from '@/modules/files/image-variants.worker'
import { S3Service } from '@/modules/files/s3.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, pngImage, putSigned, seedFileRow, sha256 } from './helpers/files'

const ago = (ms: number) => new Date(Date.now() - ms - 60_000)

/**
 * Fayllar hayot sikli (T-092, 09 §9.10): tashlab ketilgan `pending`,
 * havolasiz rasmlar, 30 kundan keyin tozalash. Havolasi bor fayl HECH
 * QACHON o'chmaydi; band hajm kamayadi. Natija soni emas, HOLAT
 * tekshiriladi (soatlik cron parallel ishlashi mumkin).
 */
describe('Fayllar GC (FileGcJobs)', () => {
  let app: INestApplication
  let gc: FileGcJobs
  let s3: S3Service
  let a: Awaited<ReturnType<typeof seedTenant>>
  let files: ReturnType<typeof filesApi>

  beforeAll(async () => {
    app = await createTestApp()
    gc = app.get(FileGcJobs)
    s3 = app.get(S3Service)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    a = await seedTenant('A do‘kon')
    files = filesApi(app, await bearer(app, a))
  })

  const keyOf = async (id: string) => (await testDb.file.findUniqueOrThrow({ where: { id } })).key
  const exists = async (id: string) => (await testDb.file.count({ where: { id } })) === 1
  const storageUsed = async () =>
    (await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).storageUsedBytes

  it('24 soatdan oshgan pending — obyekt (yuklangan bo‘lsa) va qator o‘chadi; yangisi qoladi', async () => {
    const body = await pngImage(20, 20)
    const stale = await files.presign({ kind: 'product_image', mime: 'image/png', size: body.length, sha256: sha256(body) }).expect(200)
    await putSigned(stale.body.upload, body)
    const staleKey = await keyOf(stale.body.file.id)
    await testDb.file.update({ where: { id: stale.body.file.id }, data: { createdAt: ago(PENDING_TTL_MS) } })
    const fresh = await files.presign({ kind: 'product_image', mime: 'image/png', size: 10, sha256: 'e'.repeat(64) }).expect(200)

    await gc.gcPending()
    expect(await exists(stale.body.file.id)).toBe(false)
    expect(await s3.size('media', staleKey)).toBeNull()
    expect(await exists(fresh.body.file.id)).toBe(true)
    expect(await storageUsed()).toBe(0n)
  })

  it('havolasiz rasm (grace’dan keyin) — deletedAt; tirik mahsulot rasmi va yangi rasm — tegilmaydi', async () => {
    const orphan = await files.upload(await pngImage(21, 21))
    const used = await files.upload(await pngImage(22, 22))
    const young = await files.upload(await pngImage(23, 23))
    const ofDeletedProduct = await files.upload(await pngImage(24, 24))
    await testDb.file.updateMany({ where: { id: { in: [orphan, used, ofDeletedProduct] } }, data: { createdAt: ago(ORPHAN_GRACE_MS) } })
    const live = await seedProduct(a.tenantId, a.warehouseId)
    const gone = await seedProduct(a.tenantId, a.warehouseId)
    await testDb.product.update({ where: { id: live }, data: { imageFileId: used } })
    await testDb.product.update({ where: { id: gone }, data: { imageFileId: ofDeletedProduct, deletedAt: new Date() } })

    await gc.gcOrphans()
    const rows = await testDb.file.findMany({ where: { id: { in: [orphan, used, young, ofDeletedProduct] } } })
    const deleted = (id: string) => rows.find((r) => r.id === id)!.deletedAt !== null
    expect([deleted(orphan), deleted(used), deleted(young), deleted(ofDeletedProduct)]).toEqual([true, false, false, true])
    // Obyekt hali o'chmaydi (30 kunlik undo), hajm ham
    expect(await s3.size('media', await keyOf(orphan))).not.toBeNull()
  })

  it('eksport fayli 7 kundan keyin o‘chirilgan deb belgilanadi (yangisi qoladi)', async () => {
    const old = await seedFileRow(a.tenantId, { kind: 'export', createdAt: ago(EXPORT_TTL_MS) })
    const fresh = await seedFileRow(a.tenantId, { kind: 'export' })
    await gc.gcOrphans()
    const rows = await testDb.file.findMany({ where: { id: { in: [old.id, fresh.id] } }, orderBy: { createdAt: 'asc' } })
    expect(rows.map((r) => r.deletedAt !== null)).toEqual([true, false])
  })

  it('30 kundan keyin: S3 (asl + variantlar) va qator o‘chadi, band hajm kamayadi', async () => {
    const body = await pngImage(600, 400)
    const id = await files.upload(body)
    await app.get(ImageVariantsWorker).processPending()
    const row = await testDb.file.findUniqueOrThrow({ where: { id } })
    const keys = [row.key, ...Object.values(row.variants as Record<string, string>)]
    expect(keys).toHaveLength(3)
    const kept = await files.upload(await pngImage(25, 25))
    const before = await storageUsed()

    await files.remove(id).expect(204)
    await testDb.file.update({ where: { id }, data: { deletedAt: ago(PURGE_AFTER_MS) } })
    await gc.purge()

    expect(await exists(id)).toBe(false)
    for (const key of keys) expect(await s3.size('media', key)).toBeNull()
    expect(await storageUsed()).toBe(before - BigInt(body.length))
    expect(await exists(kept)).toBe(true)
  })

  it('havolasi bor fayl hech qachon o‘chmaydi; o‘chirilgan mahsulot havolasi esa uziladi', async () => {
    const linked = await files.upload(await pngImage(26, 26))
    const ofDeletedProduct = await files.upload(await pngImage(27, 27))
    const live = await seedProduct(a.tenantId, a.warehouseId)
    const gone = await seedProduct(a.tenantId, a.warehouseId)
    await testDb.product.update({ where: { id: live }, data: { imageFileId: linked } })
    await testDb.product.update({ where: { id: gone }, data: { imageFileId: ofDeletedProduct, deletedAt: new Date() } })
    // Noto'g'ri holat taqlidi: tirik mahsulot rasmi o'chirilgan deb belgilangan
    await testDb.file.updateMany({ where: { id: { in: [linked, ofDeletedProduct] } }, data: { deletedAt: ago(PURGE_AFTER_MS) } })

    await gc.purge()
    expect(await exists(linked)).toBe(true)
    expect(await s3.size('media', await keyOf(linked))).not.toBeNull()
    expect(await exists(ofDeletedProduct)).toBe(false)
    const product = await testDb.product.findUniqueOrThrow({ where: { id: gone } })
    expect(product).toMatchObject({ imageFileId: null, tenantId: a.tenantId })
  })

  it('karantindagi/pending o‘chirilgan fayl tozalanganda hajm kamaymaydi (u hisobga kirmagan)', async () => {
    const ready = await files.upload(await pngImage(28, 28))
    const pending = await files.presign({ kind: 'product_image', mime: 'image/png', size: 10, sha256: 'f'.repeat(64) }).expect(200)
    await files.remove(pending.body.file.id).expect(204)
    await testDb.file.update({ where: { id: pending.body.file.id }, data: { deletedAt: ago(PURGE_AFTER_MS) } })
    const before = await storageUsed()

    await gc.purge()
    expect(await exists(pending.body.file.id)).toBe(false)
    expect(await storageUsed()).toBe(before)
    expect(await exists(ready)).toBe(true)
  })

  it('tunlik solishtirish: hisoblagich SUM dan farq qilsa — ogohlantirish (qiymat o‘zgartirilmaydi)', async () => {
    const body = await pngImage(29, 29)
    await files.upload(body)
    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { storageUsedBytes: 5n } })
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    try {
      await gc.purge()
      expect(warn).toHaveBeenCalledWith(
        { tenantId: a.tenantId, cached: 5, actual: body.length },
        'tenant_state.storage_used_bytes fayllar yig‘indisidan farq qiladi',
      )
    } finally {
      warn.mockRestore()
    }
    expect(await storageUsed()).toBe(5n)
  })
})
