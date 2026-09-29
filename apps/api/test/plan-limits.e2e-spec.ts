import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PLANS } from '@crm/shared'
import { SMS_PROVIDER, type SmsProvider } from '@/modules/messages/sms/sms.provider'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedClient, seedTenant, testDb, truncateAll } from './helpers/db'
import { storeSnapshot } from './helpers/snapshot'

const PASSWORD = 'Qurilish2026!'
/** Kunlik chegara faqat SMS'ga — SMS kanali yoqilgan bo'lsin (yubormaydi: ishchi testda aylanmaydi) */
const sms: SmsProvider = { name: 'fake', send: async () => ({ providerId: 'fake' }) }

/**
 * Tarif chegaralari (T-125, 09 §9.11): foydalanuvchi, ombor, saqlash
 * hajmi, kunlik SMS. Chegara oshsa aniq xato — qaysi chegara, nechta band;
 * tarif oshirilsa darhol ochiladi.
 */
describe('Tarif chegaralari', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(SMS_PROVIDER).useValue(sms))
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    a = await seedTenant('A do‘kon')
    auth = await bearer(app, a)
  })

  const api = () => request(app.getHttpServer())
  const setPlan = (plan: string) => testDb.tenant.update({ where: { id: a.tenantId }, data: { plan } })
  /** Xodim + uning kirish hisobi; javob (status tekshiriladi) */
  const createUser = async (i: number) => {
    const employee = await testDb.employee.create({
      data: { tenantId: a.tenantId, name: `Xodim ${i}`, position: 'Sotuvchi', phone: `+99890000000${i}`, hiredAt: new Date('2026-01-01') },
    })
    const res = await api().post('/api/v1/users').set('Authorization', auth)
      .send({ employeeId: employee.id, email: `u${i}@crm.uz`, password: PASSWORD, role: 'sotuvchi' })
    return res
  }

  it('foydalanuvchilar: bepulda 3 ta (admin bilan) — keyingisi 402, qaysi chegara ekani bilan', async () => {
    for (let i = 1; i < PLANS.free.users; i += 1) expect((await createUser(i)).status).toBe(201)
    const over = await createUser(8)
    expect(over.status).toBe(402)
    expect(over.body).toMatchObject({
      code: 'PLAN_LIMIT_EXCEEDED',
      errors: [{ field: 'users', meta: { resource: 'users', plan: 'free', limit: PLANS.free.users, used: PLANS.free.users } }],
    })
    // Tarif oshsa — darhol (to'lov tasdiqlangach, T-126)
    await setPlan('basic')
    expect((await createUser(9)).status).toBe(201)
  })

  it('parallel qo‘shish oxirgi joyni birga egallamaydi; qayta faollashtirish va tiklash ham joy egallaydi', async () => {
    expect((await createUser(1)).status).toBe(201)
    // Oxirgi bo'sh joyga parallel ikki so'rov — faqat bittasi
    expect((await Promise.all([createUser(2), createUser(3)])).map((r) => r.status).sort()).toEqual([201, 402])

    const user = (email: string) => testDb.user.findFirstOrThrow({ where: { tenantId: a.tenantId, email } })
    const first = await user('u1@crm.uz')
    await api().patch(`/api/v1/users/${first.id}`).set('Authorization', auth).send({ isActive: false }).expect(200)
    expect((await createUser(4)).status).toBe(201)
    const reactivated = await api().patch(`/api/v1/users/${first.id}`).set('Authorization', auth).send({ isActive: true }).expect(402)
    expect(reactivated.body.errors[0].meta).toMatchObject({ resource: 'users', used: PLANS.free.users })

    const fourth = await user('u4@crm.uz')
    await api().delete(`/api/v1/users/${fourth.id}`).set('Authorization', auth).expect(204)
    expect((await createUser(5)).status).toBe(201)
    await api().post(`/api/v1/users/${fourth.id}/restore`).set('Authorization', auth).expect(402)
  })

  it('migratsiya importi ham chegarada: oshsa — 402, hech narsa yozilmaydi; takroriy import o‘tadi', async () => {
    const snapshot = storeSnapshot({ clean: true })
    const users = [1, 2, 3].map((i) => ({ name: `Kassir ${i}`, email: `k${i}@dokon.uz`, role: 'sotuvchi' as const }))
    const over = await api().post('/api/v1/migration/import').set('Authorization', auth).send({ ...snapshot, users }).expect(402)
    expect(over.body.errors[0].meta).toMatchObject({ resource: 'users', limit: PLANS.free.users, used: PLANS.free.users + 1 })
    expect(await testDb.product.count({ where: { tenantId: a.tenantId } })).toBe(0)

    // Nusxadagi 2 ombor (sukut bilan) — bepul chegarada; qayta yuborish soni o'zgartirmaydi
    await api().post('/api/v1/migration/import').set('Authorization', auth).send(snapshot).expect(200)
    expect(await testDb.warehouse.count({ where: { tenantId: a.tenantId, archived: false } })).toBe(PLANS.free.warehouses)
    await api().post('/api/v1/migration/import').set('Authorization', auth).send(snapshot).expect(200)
  })

  it('omborlar: arxivlanmaganlar sanaladi; arxivdan qaytarish ham tekshiriladi', async () => {
    const create = (name: string) => api().post('/api/v1/warehouses').set('Authorization', auth).send({ name })
    const second = await create('Sklad').expect(201)
    expect((await create('Filial').expect(402)).body.errors[0].meta).toMatchObject({ resource: 'warehouses', limit: 2, used: 2 })

    await api().post(`/api/v1/warehouses/${second.body.id}/archive`).set('Authorization', auth).expect(200)
    await create('Filial').expect(201)
    await api().post(`/api/v1/warehouses/${second.body.id}/restore`).set('Authorization', auth).expect(402)
  })

  it('SMS: kunlik chegara tarif bo‘yicha (provayder chegarasidan kichigi)', async () => {
    await testDb.message.create({
      data: { tenantId: a.tenantId, target: 'all', recipientLabel: 'Hamma', recipients: PLANS.free.smsPerDay, text: 'x', deliveryStatus: 'logged' },
    })
    await seedClient(a.tenantId)
    const send = () => api().post('/api/v1/messages').set('Authorization', auth).set('Idempotency-Key', randomUUID()).send({ target: 'all', text: 'Salom' })
    expect((await send().expect(429)).body.errors[0].meta).toEqual({ limit: PLANS.free.smsPerDay, used: PLANS.free.smsPerDay, requested: 1 })
    await setPlan('basic')
    await send().expect(201)
  })

  it('saqlash hajmi — tarif bo‘yicha (bepul 200 MB)', async () => {
    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { storageUsedBytes: BigInt(PLANS.free.storageBytes) } })
    const presign = () => api().post('/api/v1/files/presign').set('Authorization', auth)
      .send({ kind: 'product_image', mime: 'image/png', size: 10, sha256: 'a'.repeat(64) })
    expect((await presign().expect(413)).body.code).toBe('STORAGE_QUOTA_EXCEEDED')
    await setPlan('pro')
    await presign().expect(200)
  })
})
