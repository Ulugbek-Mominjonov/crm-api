import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Env } from '@/config/env.schema'
import request from 'supertest'
import { PasswordService } from '@/modules/auth/password.service'
import { PlatformAuditService } from '@/modules/platform/platform-audit.service'
import { PlatformBootstrapService } from '@/modules/platform/platform-bootstrap.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { appDb, seedTenant, testDb, truncateAll } from './helpers/db'

const OWNER_EMAIL = 'owner@workspaces.uz'
const OWNER_PASSWORD = 'Egasi-2026!'
const STORE_PASSWORD = 'Qurilish2026!'
const DAY = 86_400_000
const MONTH_MIN_DAYS = 28

/** Set-Cookie sarlavhasidan `platform_refresh` qiymati va yo'li */
function refreshCookie(res: request.Response): { value: string; path: string } {
  const raw = (res.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) => c.startsWith('platform_refresh=')) ?? ''
  return { value: raw.split('=')[1]?.split(';')[0] ?? '', path: /Path=([^;]+)/.exec(raw)?.[1] ?? '' }
}

/**
 * Platforma egasi paneli (T-135): alohida kirish va token turi (do'kon
 * yo'llarida o'tmaydi, do'kon tokeni egasi yo'llarida o'tmaydi); do'konlar
 * ro'yxati va kartasi (RLS ostidagi ko'rsatkichlar bilan); do'kon ochish;
 * blok (faqat o'qish, to'lov ochmaydi, o'chirishdan qaytganda ham qoladi);
 * qo'lda to'lov — Payme bilan bir xil tarif qoidasi; parolni tiklash;
 * ikki jurnal (do'konniki va egasiniki); boshqaruv paneli.
 */
describe('Egasi paneli', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
  let storeAuth: string
  let owner: string

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  const api = () => request(app.getHttpServer())
  const login = () => api().post('/api/v1/platform/auth/login').send({ email: OWNER_EMAIL, password: OWNER_PASSWORD })
  const tenant = async (id: string) => (await api().get(`/api/v1/platform/tenants/${id}`).set('Authorization', owner).expect(200)).body
  const createProduct = (auth: string, sku: string) =>
    api().post('/api/v1/products').set('Authorization', auth).send({ name: 'Sement', sku, unit: 'qop', price: 1_000, wholesalePrice: 900, cost: 800 })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    const passwords = app.get(PasswordService)
    await testDb.platformAdmin.create({ data: { email: OWNER_EMAIL, name: 'Egasi', passwordHash: await passwords.hash(OWNER_PASSWORD) } })
    a = await seedTenant('A do‘kon')
    b = await seedTenant('B do‘kon')
    await testDb.user.update({ where: { id: a.userId }, data: { passwordHash: await passwords.hash(STORE_PASSWORD) } })
    storeAuth = await bearer(app, a)
    owner = `Bearer ${(await login().expect(201)).body.accessToken}`
  })

  describe('kirish va token turi', () => {
    it('login: xato parol — 401; to‘g‘ri — token, egasi, alohida cookie; me; refresh rotatsiyasi; chiqish', async () => {
      await api().post('/api/v1/platform/auth/login').send({ email: OWNER_EMAIL, password: 'noto‘g‘ri' }).expect(401)

      const res = await login().expect(201)
      expect(res.body).toMatchObject({ expiresIn: 900, admin: { email: OWNER_EMAIL, name: 'Egasi' } })
      expect(res.body.admin.passwordHash).toBeUndefined()
      const cookie = refreshCookie(res)
      expect(cookie.value).not.toBe('')
      expect(cookie.path).toBe('/api/v1/platform/auth')

      const me = await api().get('/api/v1/platform/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200)
      expect(me.body.email).toBe(OWNER_EMAIL)

      const refreshed = await api().post('/api/v1/platform/auth/refresh').set('Cookie', `platform_refresh=${cookie.value}`).expect(201)
      expect(refreshed.body.accessToken).toBeTruthy()
      // Eski cookie qayta ishlatildi — o'g'irlangan deb hisoblanadi, barcha sessiyalar yopiladi.
      // Keyingi soniyaga o'tamiz: bekor qilish vaqti soniyagacha, `owner` tokeni shu soniyada berilgan bo'lsa amal qilaverardi
      await new Promise((r) => setTimeout(r, 1_100))
      const reuse = await api().post('/api/v1/platform/auth/refresh').set('Cookie', `platform_refresh=${cookie.value}`).expect(401)
      expect(reuse.body.code).toBe('AUTH_TOKEN_REUSE')
      await api().post('/api/v1/platform/auth/refresh').set('Cookie', `platform_refresh=${refreshCookie(refreshed).value}`).expect(401)

      await api().post('/api/v1/platform/auth/logout').expect(201)
      // Barcha sessiyalar yopilgach undan oldingi ACCESS token ham darhol 401 (T-147); yangi kirish ishlaydi
      await api().get('/api/v1/platform/auth/me').set('Authorization', owner).expect(401)
      const fresh = `Bearer ${(await login().expect(201)).body.accessToken}`
      // Egasi kirishi egasi jurnalida
      const audit = await api().get('/api/v1/platform/audit?group=platform').set('Authorization', fresh).expect(200)
      expect(audit.body.items.map((e: { action: string }) => e.action)).toContain('platform.login')
    })

    it('egasi tokeni do‘kon yo‘lida, do‘kon tokeni egasi yo‘lida — 401; tokensiz — 401; faolsiz egasi — 401', async () => {
      await api().get('/api/v1/products').set('Authorization', owner).expect(401)
      await api().get('/api/v1/auth/me').set('Authorization', owner).expect(401)
      await api().get('/api/v1/platform/tenants').set('Authorization', storeAuth).expect(401)
      await api().get('/api/v1/platform/stats').set('Authorization', storeAuth).expect(401)
      await api().get('/api/v1/platform/tenants').expect(401)

      await testDb.platformAdmin.updateMany({ where: { email: OWNER_EMAIL }, data: { isActive: false } })
      await api().get('/api/v1/platform/tenants').set('Authorization', owner).expect(401)
      await login().expect(401)
    })

    it('login chegarasi: daqiqasiga 5 urinish', async () => {
      resetThrottle(app)
      for (let i = 0; i < 5; i++) await api().post('/api/v1/platform/auth/login').send({ email: OWNER_EMAIL, password: 'x' }).expect(401)
      await api().post('/api/v1/platform/auth/login').send({ email: OWNER_EMAIL, password: 'x' }).expect(429)
    })

    it('ketma-ket 5 ta noto‘g‘ri parol — hisob 15 daqiqa bloklanadi (423), to‘g‘ri parol ham o‘tmaydi; muddat o‘tgach kiradi va hisob tozalanadi', async () => {
      resetThrottle(app)
      for (let i = 0; i < 5; i++) await api().post('/api/v1/platform/auth/login').send({ email: OWNER_EMAIL, password: 'x' }).expect(401)
      resetThrottle(app)
      const locked = await login().expect(423)
      expect(locked.body.code).toBe('AUTH_ACCOUNT_LOCKED')
      expect(locked.body.errors[0].meta.until).toBeDefined()
      expect((await testDb.platformAdmin.findUniqueOrThrow({ where: { email: OWNER_EMAIL } })).failedLogins).toBe(5)

      await testDb.platformAdmin.updateMany({ where: { email: OWNER_EMAIL }, data: { lockedUntil: new Date(Date.now() - 1_000) } })
      await login().expect(201)
      expect(await testDb.platformAdmin.findUniqueOrThrow({ where: { email: OWNER_EMAIL } })).toMatchObject({ failedLogins: 0, lockedUntil: null })
    })
  })

  describe('do‘konlar', () => {
    it('ro‘yxat: ko‘rsatkichlar, administrator aloqasi, filtr va qidiruv; karta; yo‘q do‘kon — 404', async () => {
      const list = await api().get('/api/v1/platform/tenants').set('Authorization', owner).expect(200)
      expect(list.body).toMatchObject({ total: 2, page: 1, pageCount: 1 })
      const rowA = list.body.items.find((t: { id: string }) => t.id === a.tenantId)
      expect(rowA).toMatchObject({
        name: 'A do‘kon', plan: 'free', status: 'active', blockedAt: null,
        usage: { users: 1, warehouses: 1, storageBytes: 0 },
        admin: { name: 'Test Admin', phone: '+998900000000' },
        activity: { lastSaleAt: null, sales30d: 0 },
        limits: { users: 3 },
      })
      expect(rowA.admin.email).toContain('admin+')

      await testDb.tenant.update({ where: { id: b.tenantId }, data: { plan: 'pro', status: 'suspended', planExpiresAt: new Date(Date.now() - 5 * DAY) } })
      const suspended = await api().get('/api/v1/platform/tenants?status=suspended').set('Authorization', owner).expect(200)
      expect(suspended.body.items.map((t: { id: string }) => t.id)).toEqual([b.tenantId])
      const expiring = await api().get('/api/v1/platform/tenants?expiresWithinDays=7').set('Authorization', owner).expect(200)
      expect(expiring.body.items.map((t: { id: string }) => t.id)).toEqual([b.tenantId])
      const byName = await api().get('/api/v1/platform/tenants?q=a%20do').set('Authorization', owner).expect(200)
      expect(byName.body.items.map((t: { id: string }) => t.id)).toEqual([a.tenantId])
      const byPlan = await api().get('/api/v1/platform/tenants?plan=free&sort=name').set('Authorization', owner).expect(200)
      expect(byPlan.body.items.map((t: { name: string }) => t.name)).toEqual(['A do‘kon'])

      expect(await tenant(b.tenantId)).toMatchObject({ plan: 'pro', status: 'suspended', limits: { users: 50 } })
      await api().get(`/api/v1/platform/tenants/${randomUUID()}`).set('Authorization', owner).expect(404)
      await api().get('/api/v1/platform/tenants/x').set('Authorization', owner).expect(400)
    })

    it('do‘kon ochish: egasi hisobi kira oladi; boshlang‘ich pullik tarif — bonus hisob-faktura; izoh; jurnal', async () => {
      const bad = await api().post('/api/v1/platform/tenants').set('Authorization', owner)
        .send({ storeName: 'Yangi', ownerName: 'Vali', phone: '+998901112233', email: 'vali@dokon.uz', password: STORE_PASSWORD, plan: 'basic' })
        .expect(400)
      expect(bad.body.errors.some((e: { field: string }) => e.field === 'months')).toBe(true)

      const created = await api().post('/api/v1/platform/tenants').set('Authorization', owner)
        .send({ storeName: 'Yangi do‘kon', ownerName: 'Vali Aliyev', phone: '+998901112233', email: 'Vali@Dokon.uz', password: STORE_PASSWORD, plan: 'basic', months: 2, notes: 'Telefon orqali kelishildi' })
        .expect(201)
      expect(created.body).toMatchObject({ name: 'Yangi do‘kon', plan: 'basic', status: 'active', notes: 'Telefon orqali kelishildi', usage: { users: 1, warehouses: 1 }, admin: { name: 'Vali Aliyev', email: 'vali@dokon.uz' } })
      const expires = Date.parse(created.body.planExpiresAt)
      expect(expires).toBeGreaterThan(Date.now() + 2 * MONTH_MIN_DAYS * DAY)

      const invoices = await api().get(`/api/v1/platform/tenants/${created.body.id}/invoices`).set('Authorization', owner).expect(200)
      expect(invoices.body.items).toHaveLength(1)
      expect(invoices.body.items[0]).toMatchObject({ plan: 'basic', months: 2, amount: 0, state: 'paid', provider: 'bonus', tenantName: 'Yangi do‘kon' })

      const session = await api().post('/api/v1/auth/login').send({ email: 'vali@dokon.uz', password: STORE_PASSWORD }).expect(201)
      expect(session.body.user).toMatchObject({ role: 'admin', tenant: { id: created.body.id, status: 'active' } })

      const audit = await api().get(`/api/v1/platform/audit?tenantId=${created.body.id}`).set('Authorization', owner).expect(200)
      expect(audit.body.items.map((e: { action: string }) => e.action).sort()).toEqual(['tenant.create', 'tenant.plan'])
      expect(audit.body.items[0]).toMatchObject({ admin: { email: OWNER_EMAIL }, targetTenantName: 'Yangi do‘kon' })
    })

    it('nom va izoh tahriri', async () => {
      const updated = await api().patch(`/api/v1/platform/tenants/${a.tenantId}`).set('Authorization', owner).send({ name: 'A plus', notes: 'VIP' }).expect(200)
      expect(updated.body).toMatchObject({ name: 'A plus', notes: 'VIP' })
      const cleared = await api().patch(`/api/v1/platform/tenants/${a.tenantId}`).set('Authorization', owner).send({ notes: '' }).expect(200)
      expect(cleared.body.notes).toBeNull()
      // Do'kon o'z sozlamasidagi nomni ko'radi — egasi izohi do'konga chiqmaydi
      const account = await api().get('/api/v1/tenants/current').set('Authorization', storeAuth).expect(200)
      expect(account.body.notes).toBeUndefined()
    })
  })

  describe('blok', () => {
    it('bloklangan do‘kon faqat o‘qiydi (423, sabab administratorga), to‘lov blokni ochmaydi, blokdan chiqarish — active', async () => {
      const blocked = await api().post(`/api/v1/platform/tenants/${a.tenantId}/block`).set('Authorization', owner).send({ reason: 'To‘lov kelishuvi buzildi' }).expect(200)
      expect(blocked.body).toMatchObject({ status: 'blocked', blockedReason: 'To‘lov kelishuvi buzildi' })
      expect(blocked.body.blockedAt).toBeTruthy()

      await api().get('/api/v1/products').set('Authorization', storeAuth).expect(200)
      const denied = await createProduct(storeAuth, 'S-1').expect(423)
      expect(denied.body).toMatchObject({ code: 'TENANT_READ_ONLY', errors: [{ meta: { status: 'blocked' } }] })
      expect(denied.body.detail).toContain('platforma')
      const account = await api().get('/api/v1/tenants/current').set('Authorization', storeAuth).expect(200)
      expect(account.body).toMatchObject({ status: 'blocked', blockedReason: 'To‘lov kelishuvi buzildi' })
      // Kirish ishlaydi, javobda holat
      const session = await api().post('/api/v1/auth/login').send({ email: `admin+${a.tenantId.slice(-12)}@crm.uz`, password: STORE_PASSWORD }).expect(201)
      expect(session.body.user.tenant.status).toBe('blocked')

      // To'lov (Payme) o'tadi, tarif uzayadi, lekin blok qoladi
      const { invoice } = (await api().post('/api/v1/billing/invoices').set('Authorization', storeAuth).send({ plan: 'basic', months: 1 }).expect(201)).body
      const payme = (method: string, params: Record<string, unknown>) =>
        api().post('/api/v1/billing/payme').set('Authorization', `Basic ${Buffer.from(`Paycom:${process.env.PAYME_KEY}`).toString('base64')}`)
          .send({ id: 1, method, params }).expect(200)
      await payme('CreateTransaction', { id: 'tx-blocked', time: Date.now(), amount: invoice.amount * 100, account: { order_id: invoice.id } })
      await payme('PerformTransaction', { id: 'tx-blocked' })
      expect(await tenant(a.tenantId)).toMatchObject({ status: 'blocked', plan: 'basic' })
      await createProduct(storeAuth, 'S-1').expect(423)

      // Do'kon jurnalida «Platforma» yozuvi (userId yo'q)
      const entry = await testDb.auditEntry.findFirst({ where: { tenantId: a.tenantId, action: 'tenant.blocked' } })
      expect(entry).toMatchObject({ userId: null, detail: 'Platforma: To‘lov kelishuvi buzildi' })

      const unblocked = await api().post(`/api/v1/platform/tenants/${a.tenantId}/unblock`).set('Authorization', owner).expect(200)
      expect(unblocked.body).toMatchObject({ status: 'active', blockedAt: null, blockedReason: null })
      await createProduct(storeAuth, 'S-1').expect(201)
      const again = await api().post(`/api/v1/platform/tenants/${a.tenantId}/unblock`).set('Authorization', owner).expect(422)
      expect(again.body.code).toBe('INVALID_STATUS_TRANSITION')
    })

    it('blok o‘chirishdan qaytganda ham qoladi; muddati o‘tgan tarifda blokdan chiqarish — suspended', async () => {
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/block`).set('Authorization', owner).send({ reason: 'Tekshiruv' }).expect(200)
      // Do'kon administratori o'chirishni so'raydi (faqat-o'qishda ruxsat etilgan yo'l) va qaytaradi
      const deleting = await api().post('/api/v1/tenants/current/delete').set('Authorization', storeAuth).send({ password: STORE_PASSWORD }).expect(200)
      expect(deleting.body.status).toBe('deleting')
      expect((await tenant(a.tenantId)).blockedAt).toBeTruthy()
      const restored = await api().post('/api/v1/tenants/current/restore').set('Authorization', storeAuth).expect(200)
      expect(restored.body.status).toBe('blocked')

      await testDb.tenant.update({ where: { id: a.tenantId }, data: { plan: 'basic', planExpiresAt: new Date(Date.now() - 10 * DAY) } })
      const unblocked = await api().post(`/api/v1/platform/tenants/${a.tenantId}/unblock`).set('Authorization', owner).expect(200)
      expect(unblocked.body.status).toBe('suspended')
    })

    it('egasi o‘chirishi va qaytarishi: 30 kun muhlat; muhlatdagi do‘konni yana o‘chirish — 422', async () => {
      const deleting = await api().post(`/api/v1/platform/tenants/${b.tenantId}/delete`).set('Authorization', owner).expect(200)
      expect(deleting.body.status).toBe('deleting')
      expect(Date.parse(deleting.body.deletionScheduledAt)).toBeGreaterThan(Date.now() + 29 * DAY)
      await api().post(`/api/v1/platform/tenants/${b.tenantId}/delete`).set('Authorization', owner).expect(422)
      await api().post('/api/v1/products').set('Authorization', await bearer(app, b))
        .send({ name: 'Sement', sku: 'B-1', unit: 'qop', price: 1_000, wholesalePrice: 900, cost: 800 }).expect(423)
      const restored = await api().post(`/api/v1/platform/tenants/${b.tenantId}/restore`).set('Authorization', owner).expect(200)
      expect(restored.body).toMatchObject({ status: 'active', deletionScheduledAt: null })
      await api().post(`/api/v1/platform/tenants/${b.tenantId}/restore`).set('Authorization', owner).expect(422)
    })
  })

  describe('tarif va to‘lov', () => {
    it('qo‘lda to‘lov: hisob-faktura `paid`, tarif uzayadi, suspended ochiladi; bonus — summa 0; free — muddat o‘chadi; ro‘yxat va statistika', async () => {
      await testDb.tenant.update({ where: { id: a.tenantId }, data: { plan: 'basic', status: 'suspended', planExpiresAt: new Date(Date.now() - 10 * DAY) } })
      const paid = await api().post(`/api/v1/platform/tenants/${a.tenantId}/plan`).set('Authorization', owner)
        .send({ plan: 'basic', months: 1, provider: 'cash', note: 'Kvitansiya №12' }).expect(200)
      expect(paid.body).toMatchObject({ plan: 'basic', status: 'active' })
      // Muddati o'tgan — hozirdan uzayadi
      expect(Date.parse(paid.body.planExpiresAt)).toBeGreaterThan(Date.now() + MONTH_MIN_DAYS * DAY)
      await createProduct(storeAuth, 'S-1').expect(201)

      const bonus = await api().post(`/api/v1/platform/tenants/${a.tenantId}/plan`).set('Authorization', owner)
        .send({ plan: 'basic', months: 1, provider: 'bonus' }).expect(200)
      // O'sha tarif — joriy muddat oxiridan
      expect(Date.parse(bonus.body.planExpiresAt)).toBeGreaterThan(Date.parse(paid.body.planExpiresAt) + MONTH_MIN_DAYS * DAY)

      const all = await api().get('/api/v1/platform/invoices').set('Authorization', owner).expect(200)
      expect(all.body.total).toBe(2)
      expect(all.body.items.map((i: { provider: string; amount: number; note: string | null }) => [i.provider, i.amount, i.note])).toEqual([
        ['bonus', 0, null], ['cash', 99_000, 'Kvitansiya №12'],
      ])
      const cash = await api().get('/api/v1/platform/invoices?provider=cash').set('Authorization', owner).expect(200)
      expect(cash.body.items).toHaveLength(1)
      const second = await api().get('/api/v1/platform/invoices?page=2&pageSize=1').set('Authorization', owner).expect(200)
      expect(second.body).toMatchObject({ total: 2, pageCount: 2, items: [{ provider: 'cash' }] })
      const empty = await api().get('/api/v1/platform/invoices?page=5&pageSize=1').set('Authorization', owner).expect(200)
      expect(empty.body).toMatchObject({ total: 2, items: [] })
      // Do'kon o'zi ham ko'radi (Payme/Click bilan bir xil ro'yxat)
      const own = await api().get('/api/v1/billing/invoices').set('Authorization', storeAuth).expect(200)
      expect(own.body.map((i: { provider: string }) => i.provider)).toEqual(['bonus', 'cash'])

      const stats = await api().get('/api/v1/platform/stats').set('Authorization', owner).expect(200)
      expect(stats.body.tenants).toMatchObject({ total: 2, byStatus: { active: 2 }, byPlan: { basic: 1, free: 1 }, newThisMonth: 2 })
      expect(stats.body.revenue.thisMonth).toBe(99_000)
      expect(stats.body.revenue.months).toHaveLength(1)

      const free = await api().post(`/api/v1/platform/tenants/${a.tenantId}/plan`).set('Authorization', owner).send({ plan: 'free' }).expect(200)
      expect(free.body).toMatchObject({ plan: 'free', planExpiresAt: null, status: 'active' })
      // Egasi jurnali: uchala amal
      const audit = await api().get(`/api/v1/platform/audit?tenantId=${a.tenantId}&group=tenant`).set('Authorization', owner).expect(200)
      expect(audit.body.items.map((e: { action: string }) => e.action)).toEqual(['tenant.plan', 'tenant.plan', 'tenant.plan'])
      expect(audit.body.items[2].diff).toMatchObject({ plan: 'basic', provider: 'cash', note: 'Kvitansiya №12' })
    })

    it('pullik tarifda `months` va `provider` shart; summa manfiy bo‘lmaydi', async () => {
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/plan`).set('Authorization', owner).send({ plan: 'pro' }).expect(400)
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/plan`).set('Authorization', owner).send({ plan: 'pro', months: 1 }).expect(400)
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/plan`).set('Authorization', owner).send({ plan: 'pro', months: 1, provider: 'cash', amount: -1 }).expect(400)
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/plan`).set('Authorization', owner).send({ plan: 'gold', months: 1, provider: 'cash' }).expect(400)
    })
  })

  describe('hisoblar', () => {
    it('do‘kon hisoblari ro‘yxati; parolni tiklash — sessiyalar yopiladi, yangi parol bilan kiradi; boshqa do‘kon hisobi — 404', async () => {
      const users = await api().get(`/api/v1/platform/tenants/${a.tenantId}/users`).set('Authorization', owner).expect(200)
      expect(users.body).toHaveLength(1)
      expect(users.body[0]).toMatchObject({ id: a.userId, name: 'Test Admin', role: 'admin', roleName: 'Administrator', isActive: true })

      const email = `admin+${a.tenantId.slice(-12)}@crm.uz`
      const session = await api().post('/api/v1/auth/login').send({ email, password: STORE_PASSWORD }).expect(201)
      const cookie = (session.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!

      await api().post(`/api/v1/platform/tenants/${a.tenantId}/users/${a.userId}/reset-password`).set('Authorization', owner).send({ password: 'short' }).expect(400)
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/users/${a.userId}/reset-password`).set('Authorization', owner).send({ password: 'Yangi-parol-2026' }).expect(204)
      await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401)
      await api().post('/api/v1/auth/login').send({ email, password: STORE_PASSWORD }).expect(401)
      await api().post('/api/v1/auth/login').send({ email, password: 'Yangi-parol-2026' }).expect(201)
      expect(await testDb.auditEntry.findFirst({ where: { tenantId: a.tenantId, action: 'user.passwordReset' } })).toMatchObject({ entityId: a.userId, userId: null })

      await api().post(`/api/v1/platform/tenants/${a.tenantId}/users/${b.userId}/reset-password`).set('Authorization', owner).send({ password: 'Yangi-parol-2026' }).expect(404)
    })
  })

  describe('birinchi egasi (env)', () => {
    it('PLATFORM_OWNER_* bilan hisob bir marta yaratiladi, mavjudiga tegilmaydi', async () => {
      // Jurnal faqat qo'shiladi (egasi kirishi yozilgan) — hisobni o'chirib bo'lmaydi, jadvallar tozalanadi
      await truncateAll()
      const env: Record<string, string> = { PLATFORM_OWNER_EMAIL: 'Boss@Workspaces.uz', PLATFORM_OWNER_PASSWORD: 'Birinchi-2026!' }
      const config = { get: (key: string) => env[key] } as unknown as ConfigService<Env, true>
      const bootstrap = new PlatformBootstrapService(appDb, app.get(PasswordService), app.get(PlatformAuditService), config)
      await bootstrap.onModuleInit()
      const created = await testDb.platformAdmin.findUniqueOrThrow({ where: { email: 'boss@workspaces.uz' } })
      await api().post('/api/v1/platform/auth/login').send({ email: 'boss@workspaces.uz', password: 'Birinchi-2026!' }).expect(201)

      env.PLATFORM_OWNER_PASSWORD = 'Boshqa-parol-2026'
      await bootstrap.onModuleInit()
      expect((await testDb.platformAdmin.findUniqueOrThrow({ where: { email: 'boss@workspaces.uz' } })).passwordHash).toBe(created.passwordHash)
      expect(await testDb.platformAdmin.count()).toBe(1)
      expect(await testDb.platformAuditEntry.count({ where: { action: 'platform.bootstrap' } })).toBe(1)
    })
  })
})
