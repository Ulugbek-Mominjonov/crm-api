import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TenantLifecycleJobs } from '@/modules/account/tenant-lifecycle.jobs'
import { S3Service } from '@/modules/files/s3.service'
import { PasswordService } from '@/modules/auth/password.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { appDb, openShift, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, pngImage } from './helpers/files'

const PASSWORD = 'Qurilish2026!'
const DAY = 86_400_000

/**
 * Do'kon hayot sikli (T-127): to'lanmasa `suspended` (o'qish mumkin,
 * yozish yo'q, to'lash mumkin); o'chirishda 30 kun muhlat, keyin ma'lumot
 * va S3 fayllari to'liq o'chadi — boshqa do'konga tegilmaydi.
 */
describe('Do‘konni to‘xtatish va o‘chirish', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let jobs: TenantLifecycleJobs

  beforeAll(async () => {
    app = await createTestApp()
    jobs = app.get(TenantLifecycleJobs)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    a = await seedTenant('A do‘kon')
    b = await seedTenant('B do‘kon')
    auth = await bearer(app, a)
    // Tokenlar bilan ishlaydigan hisob — parol tasdig'i uchun haqiqiy xesh
    await testDb.user.update({ where: { id: a.userId }, data: { passwordHash: await app.get(PasswordService).hash(PASSWORD) } })
  })

  const api = () => request(app.getHttpServer())
  const createProduct = (sku: string) =>
    api().post('/api/v1/products').set('Authorization', auth)
      .send({ name: 'Sement', sku, unit: 'qop', price: 1_000, wholesalePrice: 900, cost: 800 })
  const account = async () => (await api().get('/api/v1/tenants/current').set('Authorization', auth).expect(200)).body

  it('hisob: tarif, chegaralar, ishlatilgan hajm; faqat administrator', async () => {
    expect(await account()).toMatchObject({
      plan: 'free', status: 'active', limits: { users: 3, warehouses: 2 }, usage: { users: 1, warehouses: 1, storageBytes: 0, smsToday: 0 },
    })
    await api().get('/api/v1/tenants/current').set('Authorization', await bearer(app, a, 'manager')).expect(403)
  })

  it('to‘lanmagan tarif (muddat + 3 kun) — suspended: o‘qish bor, yozish 423; to‘lov yo‘li ochiq', async () => {
    await testDb.tenant.update({ where: { id: a.tenantId }, data: { plan: 'basic', planExpiresAt: new Date(Date.now() - 4 * DAY) } })
    await testDb.tenant.update({ where: { id: b.tenantId }, data: { plan: 'basic', planExpiresAt: new Date(Date.now() - 1 * DAY) } })
    expect(await jobs.suspendExpired()).toEqual([a.tenantId])

    await api().get('/api/v1/products').set('Authorization', auth).expect(200)
    const blocked = await createProduct('S-1').expect(423)
    expect(blocked.body).toMatchObject({ code: 'TENANT_READ_ONLY', errors: [{ meta: { status: 'suspended' } }] })
    // To'lov (qayta ochish) ruxsat etilgan; tasdiqlangach yozish darhol ochiladi
    const { invoice } = (await api().post('/api/v1/billing/invoices').set('Authorization', auth).send({ plan: 'basic', months: 1 }).expect(201)).body
    const payme = (method: string, params: Record<string, unknown>) =>
      api().post('/api/v1/billing/payme').set('Authorization', `Basic ${Buffer.from(`Paycom:${process.env.PAYME_KEY}`).toString('base64')}`)
        .send({ id: 1, method, params }).expect(200)
    await payme('CreateTransaction', { id: 'tx-renew', time: Date.now(), amount: invoice.amount * 100, account: { order_id: invoice.id } })
    await payme('PerformTransaction', { id: 'tx-renew' })
    expect(await account()).toMatchObject({ status: 'active', plan: 'basic' })
    await createProduct('S-1').expect(201)
    // Imtiyoz ichidagi B yozishda davom etadi
    await api().post('/api/v1/products').set('Authorization', await bearer(app, b))
      .send({ name: 'Sement', sku: 'B-1', unit: 'qop', price: 1_000, wholesalePrice: 900, cost: 800 }).expect(201)
  })

  it('o‘chirish: parol bilan; 30 kun faqat o‘qish; bekor qilinsa — yana faol', async () => {
    await api().post('/api/v1/tenants/current/delete').set('Authorization', auth).send({ password: 'noto‘g‘ri-parol' }).expect(401)
    const deleting = (await api().post('/api/v1/tenants/current/delete').set('Authorization', auth).send({ password: PASSWORD }).expect(200)).body
    expect(deleting.status).toBe('deleting')
    expect(new Date(deleting.deletionScheduledAt).getTime() - Date.now()).toBeGreaterThan(29 * DAY)
    expect((await createProduct('S-2').expect(423)).body.errors[0].meta).toEqual({ status: 'deleting' })

    expect((await api().post('/api/v1/tenants/current/restore').set('Authorization', auth).expect(200)).body).toMatchObject({
      status: 'active', deletionScheduledAt: null,
    })
    await createProduct('S-2').expect(201)
    // Muhlat o'tmagan so'rov ham, faol do'kon ham tozalanmaydi
    await expect(appDb.$executeRaw`SELECT purge_tenant(${a.tenantId}::uuid)`).rejects.toThrow()
    expect(await jobs.purgeDeleted()).toEqual([])
  })

  it('muhlat tugagach — ma’lumot (audit va ombor jurnali ham) va S3 fayllari to‘liq o‘chadi; B tegilmaydi', async () => {
    // A: hujjatlar, jurnal, fayl
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { taxEnabled: false } })
    const product = await seedProduct(a.tenantId, a.warehouseId, { qty: '5' })
    await openShift(a.tenantId)
    await api().post('/api/v1/sales').set('Authorization', auth).set('Idempotency-Key', randomUUID())
      .send({ items: [{ productId: product, qty: 1 }], paid: { cash: 60_000, card: 0, transfer: 0 } }).expect(201)
    await api().post('/api/v1/stock/intake').set('Authorization', auth).set('Idempotency-Key', randomUUID())
      .send({ productId: product, qty: 2 }).expect(201)
    const fileId = await filesApi(app, auth).upload(await pngImage(10, 10))
    const key = (await testDb.file.findUniqueOrThrow({ where: { id: fileId } })).key
    const bProduct = await seedProduct(b.tenantId, b.warehouseId)

    await api().post('/api/v1/tenants/current/delete').set('Authorization', auth).send({ password: PASSWORD }).expect(200)
    await testDb.tenant.update({ where: { id: a.tenantId }, data: { deletionScheduledAt: new Date(Date.now() - 1000) } })
    expect(await jobs.purgeDeleted()).toEqual([a.tenantId])

    expect(await testDb.tenant.count({ where: { id: a.tenantId } })).toBe(0)
    for (const count of await Promise.all([
      testDb.sale.count({ where: { tenantId: a.tenantId } }),
      testDb.stockMovement.count({ where: { tenantId: a.tenantId } }),
      testDb.auditEntry.count({ where: { tenantId: a.tenantId } }),
      testDb.product.count({ where: { tenantId: a.tenantId } }),
      testDb.file.count({ where: { tenantId: a.tenantId } }),
      testDb.user.count({ where: { tenantId: a.tenantId } }),
    ])) expect(count).toBe(0)
    expect(await app.get(S3Service).size('media', key)).toBeNull()
    // Eski token bilan yozish — rad (do'kon yo'q)
    await createProduct('S-3').expect(423)

    expect(await testDb.product.count({ where: { id: bProduct } })).toBe(1)
    expect(await testDb.tenant.findUniqueOrThrow({ where: { id: b.tenantId } })).toMatchObject({ status: 'active' })
  })

  it('ilova roli jurnal va ombor harakatlarini o‘chira olmaydi (bayroqni o‘zi qo‘ysa ham)', async () => {
    await testDb.auditEntry.create({ data: { tenantId: a.tenantId, action: 'test' } })
    await expect(
      appDb.inTenantTransaction(a.tenantId, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.purge_tenant', ${a.tenantId}, true)`
        await tx.$executeRaw`DELETE FROM audit_log WHERE tenant_id = ${a.tenantId}::uuid`
      }),
    ).rejects.toThrow()
    expect(await testDb.auditEntry.count({ where: { tenantId: a.tenantId } })).toBe(1)
  })
})
