import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { totpCode, totpStep } from '@/common/security/totp'
import { PasswordService } from '@/modules/auth/password.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { seedTenant, testDb, truncateAll } from './helpers/db'

const OWNER_EMAIL = 'owner@workspaces.uz'
const OPERATOR_EMAIL = 'operator@workspaces.uz'
const PASSWORD = 'Egasi-2026!'
const MINUTE = 60_000

/**
 * Egasi hisoblari va operatorlar (T-139): rol — operator do'konni o'chira
 * olmaydi, hisob va sozlamani boshqarmaydi; o'z rolini/faolligini
 * o'zgartirib bo'lmaydi. Ikki bosqichli kirish (TOTP): sozlash → tasdiq →
 * kirishda kod majburiy, kod bir martalik, boshqa egasi olib tashlaydi.
 * Platforma sozlamasi (T-138): ro'yxatdan o'tish yopiq — 403, egasi ochadi.
 */
describe('Egasi hisoblari, TOTP va sozlama', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let owner: string
  let ownerId: string

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const api = () => request(app.getHttpServer())
  const login = (email: string, password = PASSWORD, totpCode?: string) =>
    api().post('/api/v1/platform/auth/login').send({ email, password, ...(totpCode && { totpCode }) })
  const token = async (email: string, password = PASSWORD, code?: string): Promise<string> =>
    `Bearer ${(await login(email, password, code).expect(201)).body.accessToken}`
  const createAdmin = (auth: string, body: Record<string, unknown>) => api().post('/api/v1/platform/admins').set('Authorization', auth).send(body)
  const createOperator = async (): Promise<{ id: string; auth: string }> => {
    const res = await createAdmin(owner, { email: OPERATOR_EMAIL, name: 'Dilnoza', password: PASSWORD, role: 'operator' }).expect(201)
    expect(res.body).toMatchObject({ email: OPERATOR_EMAIL, role: 'operator', isActive: true, totpEnabled: false, telegramLinked: false })
    return { id: res.body.id, auth: await token(OPERATOR_EMAIL) }
  }
  const auditActions = async (): Promise<string[]> =>
    (await api().get('/api/v1/platform/audit?group=platform&pageSize=100').set('Authorization', owner).expect(200)).body.items.map((e: { action: string }) => e.action)
  /** Vaqtni faqat `Date` uchun soxtalashtiradi (HTTP va taymerlar haqiqiy qoladi) va `ms` ga suradi */
  const advance = (ms: number) => vi.setSystemTime(Date.now() + ms)

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    const passwords = app.get(PasswordService)
    ownerId = (await testDb.platformAdmin.create({ data: { email: OWNER_EMAIL, name: 'Egasi', role: 'owner', passwordHash: await passwords.hash(PASSWORD) } })).id
    a = await seedTenant('A do‘kon')
    owner = await token(OWNER_EMAIL)
  })

  describe('rollar', () => {
    it('operator: do‘konlar bilan ishlaydi, lekin o‘chirish/qaytarish, hisoblar va sozlama — 403', async () => {
      const operator = await createOperator()
      const me = await api().get('/api/v1/platform/auth/me').set('Authorization', operator.auth).expect(200)
      expect(me.body).toMatchObject({ email: OPERATOR_EMAIL, role: 'operator' })

      await api().get('/api/v1/platform/tenants').set('Authorization', operator.auth).expect(200)
      await api().get('/api/v1/platform/stats').set('Authorization', operator.auth).expect(200)
      await api().get('/api/v1/platform/settings').set('Authorization', operator.auth).expect(200)
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/block`).set('Authorization', operator.auth).send({ reason: 'Tekshiruv' }).expect(200)
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/unblock`).set('Authorization', operator.auth).expect(200)
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/plan`).set('Authorization', operator.auth).send({ plan: 'basic', months: 1, provider: 'cash' }).expect(200)

      // So'rovlar KECH yaratiladi: supertest birinchisi tugaganda serverni yopadi
      for (const forbidden of [
        () => api().post(`/api/v1/platform/tenants/${a.tenantId}/delete`).set('Authorization', operator.auth),
        () => api().post(`/api/v1/platform/tenants/${a.tenantId}/restore`).set('Authorization', operator.auth),
        () => api().get('/api/v1/platform/admins').set('Authorization', operator.auth),
        () => api().post('/api/v1/platform/admins').set('Authorization', operator.auth).send({ email: 'x@y.uz', name: 'X', password: PASSWORD, role: 'owner' }),
        () => api().patch('/api/v1/platform/settings').set('Authorization', operator.auth).send({ registrationMode: 'closed' }),
      ]) {
        const res = await forbidden().expect(403)
        expect(res.body.code).toBe('PERMISSION_DENIED')
      }
      // Egasi uchun o'sha yo'llar ochiq
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/delete`).set('Authorization', owner).expect(200)
      await api().post(`/api/v1/platform/tenants/${a.tenantId}/restore`).set('Authorization', owner).expect(200)
      expect(await auditActions()).toContain('platform.admin.create')
    })
  })

  describe('hisoblarni boshqarish', () => {
    it('ro‘yxat; takror email — 409; kuchsiz parol — 400; o‘z rolini/faolligini o‘zgartirish — 422; noma’lum — 404', async () => {
      const operator = await createOperator()
      const list = await api().get('/api/v1/platform/admins').set('Authorization', owner).expect(200)
      expect(list.body.map((x: { email: string }) => x.email)).toEqual([OWNER_EMAIL, OPERATOR_EMAIL])
      expect(list.body[0].passwordHash).toBeUndefined()

      expect((await createAdmin(owner, { email: OPERATOR_EMAIL.toUpperCase(), name: 'X', password: PASSWORD, role: 'owner' }).expect(409)).body.code).toBe('ALREADY_EXISTS')
      await createAdmin(owner, { email: 'weak@workspaces.uz', name: 'X', password: 'password', role: 'operator' }).expect(400)
      await createAdmin(owner, { email: 'r@workspaces.uz', name: 'X', password: PASSWORD, role: 'boss' }).expect(400)

      expect((await api().patch(`/api/v1/platform/admins/${ownerId}`).set('Authorization', owner).send({ role: 'operator' }).expect(422)).body.code).toBe('SELF_ROLE_CHANGE')
      expect((await api().patch(`/api/v1/platform/admins/${ownerId}`).set('Authorization', owner).send({ isActive: false }).expect(422)).body.code).toBe('SELF_DELETE')
      // O'z nomini o'zgartirish mumkin
      expect((await api().patch(`/api/v1/platform/admins/${ownerId}`).set('Authorization', owner).send({ name: 'Ulug‘bek' }).expect(200)).body.name).toBe('Ulug‘bek')
      await api().patch(`/api/v1/platform/admins/${randomUUID()}`).set('Authorization', owner).send({ name: 'X' }).expect(404)

      // Operatorni egasi qilish va qaytarish
      expect((await api().patch(`/api/v1/platform/admins/${operator.id}`).set('Authorization', owner).send({ role: 'owner' }).expect(200)).body.role).toBe('owner')
      await api().get('/api/v1/platform/admins').set('Authorization', operator.auth).expect(200)
      await api().patch(`/api/v1/platform/admins/${operator.id}`).set('Authorization', owner).send({ role: 'operator' }).expect(200)
      await api().get('/api/v1/platform/admins').set('Authorization', operator.auth).expect(403)
    })

    it('faolsizlantirish — token va refresh darhol yopiladi; parolni tiklash — eski 401, yangi kiradi, sessiyalar yopiq', async () => {
      const operator = await createOperator()
      const loginRes = await login(OPERATOR_EMAIL).expect(201)
      const cookie = (loginRes.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('platform_refresh='))!.split(';')[0]!

      await api().patch(`/api/v1/platform/admins/${operator.id}`).set('Authorization', owner).send({ isActive: false }).expect(200)
      await api().get('/api/v1/platform/tenants').set('Authorization', operator.auth).expect(401)
      await api().post('/api/v1/platform/auth/refresh').set('Cookie', cookie).expect(401)
      await login(OPERATOR_EMAIL).expect(401)
      await api().patch(`/api/v1/platform/admins/${operator.id}`).set('Authorization', owner).send({ isActive: true }).expect(200)

      // Kirish chegarasi (5/daqiqa) testga emas, hujumga — tozalanadi
      resetThrottle(app)
      const fresh = await login(OPERATOR_EMAIL).expect(201)
      const freshCookie = (fresh.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('platform_refresh='))!.split(';')[0]!
      await api().post(`/api/v1/platform/admins/${operator.id}/reset-password`).set('Authorization', owner).send({ password: 'Yangi-parol-2026' }).expect(204)
      await login(OPERATOR_EMAIL).expect(401)
      await api().post('/api/v1/platform/auth/refresh').set('Cookie', freshCookie).expect(401)
      await login(OPERATOR_EMAIL, 'Yangi-parol-2026').expect(201)
      await api().post(`/api/v1/platform/admins/${operator.id}/reset-password`).set('Authorization', owner).send({ password: 'password' }).expect(400)

      const actions = await auditActions()
      expect(actions).toEqual(expect.arrayContaining(['platform.admin.update', 'platform.admin.resetPassword']))
    })
  })

  describe('ikki bosqichli kirish (TOTP)', () => {
    it('sozlash → tasdiq (noto‘g‘ri kod 401) → kirishda kod majburiy, bir martalik → o‘chirish ham kod bilan', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      const setup = await api().post('/api/v1/platform/auth/totp/setup').set('Authorization', owner).expect(201)
      const secret: string = setup.body.secret
      expect(secret).toMatch(/^[A-Z2-7]{32}$/)
      expect(setup.body.otpauthUrl).toContain(`otpauth://totp/CRM%20egasi:owner%40workspaces.uz?secret=${secret}`)
      // Tasdiqlanmaguncha kirishga ta'sir qilmaydi
      await login(OWNER_EMAIL).expect(201)
      expect((await api().get('/api/v1/platform/auth/me').set('Authorization', owner).expect(200)).body.totpEnabled).toBe(false)

      expect((await api().post('/api/v1/platform/auth/totp/enable').set('Authorization', owner).send({ code: '000000' }).expect(401)).body.code).toBe('AUTH_TOTP_INVALID')
      await api().post('/api/v1/platform/auth/totp/enable').set('Authorization', owner).send({ code: '12345' }).expect(400)
      const enabled = await api().post('/api/v1/platform/auth/totp/enable').set('Authorization', owner).send({ code: totpCode(secret, totpStep()) }).expect(200)
      expect(enabled.body.totpEnabled).toBe(true)
      expect((await api().post('/api/v1/platform/auth/totp/setup').set('Authorization', owner).expect(422)).body.code).toBe('INVALID_STATUS_TRANSITION')

      // Kirish: kodsiz — alohida kod (frontend kod maydonini ko'rsatadi), noto'g'ri — boshqa kod
      resetThrottle(app)
      expect((await login(OWNER_EMAIL).expect(401)).body.code).toBe('AUTH_TOTP_REQUIRED')
      expect((await login(OWNER_EMAIL, PASSWORD, '000000').expect(401)).body.code).toBe('AUTH_TOTP_INVALID')
      // Noto'g'ri parol kod bilan ham — parol xatosi (kod tekshirilmaydi)
      expect((await login(OWNER_EMAIL, 'xato', totpCode(secret, totpStep())).expect(401)).body.code).toBe('AUTH_INVALID_CREDENTIALS')

      // Yoqishda ishlatilgan kod kirishda qayta o'tmaydi; bir daqiqadan keyingi kod — o'tadi, lekin faqat bir marta
      expect((await login(OWNER_EMAIL, PASSWORD, totpCode(secret, totpStep())).expect(401)).body.code).toBe('AUTH_TOTP_INVALID')
      advance(MINUTE)
      resetThrottle(app)
      const code = totpCode(secret, totpStep())
      await login(OWNER_EMAIL, PASSWORD, code).expect(201)
      expect((await login(OWNER_EMAIL, PASSWORD, code).expect(401)).body.code).toBe('AUTH_TOTP_INVALID')

      // O'chirish ham kod bilan
      advance(MINUTE)
      expect((await api().post('/api/v1/platform/auth/totp/disable').set('Authorization', owner).send({ code: '000000' }).expect(401)).body.code).toBe('AUTH_TOTP_INVALID')
      const disabled = await api().post('/api/v1/platform/auth/totp/disable').set('Authorization', owner).send({ code: totpCode(secret, totpStep()) }).expect(200)
      expect(disabled.body.totpEnabled).toBe(false)
      resetThrottle(app)
      await login(OWNER_EMAIL).expect(201)
      expect((await api().post('/api/v1/platform/auth/totp/disable').set('Authorization', owner).send({ code: '000000' }).expect(422)).body.code).toBe('INVALID_STATUS_TRANSITION')

      expect(await auditActions()).toEqual(expect.arrayContaining(['platform.totp.enable', 'platform.totp.disable']))
    })

    it('qurilma yo‘qolganda egasi boshqa hisobning TOTP’ini olib tashlaydi; kod tekshiruvi daqiqasiga 5 urinish', async () => {
      const operator = await createOperator()
      const secret: string = (await api().post('/api/v1/platform/auth/totp/setup').set('Authorization', operator.auth).expect(201)).body.secret
      await api().post('/api/v1/platform/auth/totp/enable').set('Authorization', operator.auth).send({ code: totpCode(secret, totpStep()) }).expect(200)
      expect((await login(OPERATOR_EMAIL).expect(401)).body.code).toBe('AUTH_TOTP_REQUIRED')

      expect((await api().post(`/api/v1/platform/admins/${operator.id}/totp/reset`).set('Authorization', operator.auth).expect(403)).body.code).toBe('PERMISSION_DENIED')
      await api().post(`/api/v1/platform/admins/${operator.id}/totp/reset`).set('Authorization', owner).expect(204)
      await login(OPERATOR_EMAIL).expect(201)
      await api().post(`/api/v1/platform/admins/${operator.id}/totp/reset`).set('Authorization', owner).expect(422)
      expect(await auditActions()).toContain('platform.admin.totpReset')

      resetThrottle(app)
      await api().post('/api/v1/platform/auth/totp/setup').set('Authorization', owner).expect(201)
      for (let i = 0; i < 5; i++) {
        await api().post('/api/v1/platform/auth/totp/enable').set('Authorization', owner).send({ code: '000000' }).expect(401)
      }
      await api().post('/api/v1/platform/auth/totp/enable').set('Authorization', owner).send({ code: '000000' }).expect(429)
    })
  })

  describe('platforma sozlamasi — ro‘yxatdan o‘tish', () => {
    const register = (email: string) =>
      api().post('/api/v1/tenants/register').send({ storeName: 'Yangi do‘kon', ownerName: 'Ali', phone: '+998901234567', email, password: PASSWORD })

    it('yopiq: ochiq yo‘l 403 `REGISTRATION_CLOSED`, holat hisobsiz ko‘rinadi, egasi baribir ochadi; ochiq — yana ishlaydi', async () => {
      expect((await api().get('/api/v1/platform/settings').set('Authorization', owner).expect(200)).body).toMatchObject({ registrationMode: 'open', updatedBy: null })
      expect((await api().get('/api/v1/tenants/registration').expect(200)).body).toEqual({ mode: 'open' })
      await register('ali1@dokon.uz').expect(201)

      const closed = await api().patch('/api/v1/platform/settings').set('Authorization', owner).send({ registrationMode: 'closed' }).expect(200)
      expect(closed.body).toMatchObject({ registrationMode: 'closed', updatedBy: 'Egasi' })
      expect((await api().get('/api/v1/tenants/registration').expect(200)).body).toEqual({ mode: 'closed' })
      expect((await register('ali2@dokon.uz').expect(403)).body.code).toBe('REGISTRATION_CLOSED')
      await api().post('/api/v1/platform/tenants').set('Authorization', owner)
        .send({ storeName: 'Egasi ochdi', ownerName: 'Vali', phone: '+998901234568', email: 'vali@dokon.uz', password: PASSWORD }).expect(201)
      await api().patch('/api/v1/platform/settings').set('Authorization', owner).send({ registrationMode: 'yarim' }).expect(400)

      await api().patch('/api/v1/platform/settings').set('Authorization', owner).send({ registrationMode: 'open' }).expect(200)
      await register('ali3@dokon.uz').expect(201)
      // Jurnal: faqat haqiqiy o'zgarish (ikki marta)
      expect((await auditActions()).filter((x) => x === 'platform.settings.update')).toHaveLength(2)
      await api().patch('/api/v1/platform/settings').set('Authorization', owner).send({ registrationMode: 'open' }).expect(200)
      expect((await auditActions()).filter((x) => x === 'platform.settings.update')).toHaveLength(2)
    })
  })
})
