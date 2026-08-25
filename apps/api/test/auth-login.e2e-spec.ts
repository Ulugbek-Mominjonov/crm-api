import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PasswordService } from '@/modules/auth/password.service'
import { TenantProvisioningService } from '@/modules/tenants/tenant-provisioning.service'
import { createTestApp } from './helpers/app'
import { testDb, truncateAll } from './helpers/db'

const PASSWORD = 'Qurilish2026!'
const EMAIL = 'admin@crm.uz'

describe('POST /auth/login', () => {
  let app: INestApplication
  let provisioning: TenantProvisioningService
  let passwords: PasswordService

  beforeAll(async () => {
    app = await createTestApp()
    provisioning = app.get(TenantProvisioningService)
    passwords = app.get(PasswordService)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    await truncateAll()
    await provisioning.provision({
      tenantName: 'Qurilish Mollari',
      owner: {
        name: 'Bobur Toshmatov',
        phone: '+998901234567',
        email: EMAIL,
        passwordHash: await passwords.hash(PASSWORD),
      },
    })
  })

  const login = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send(body)

  it('to‘g‘ri ma’lumot bilan kirish', async () => {
    const res = await login({ email: EMAIL, password: PASSWORD }).expect(201)

    expect(res.body.accessToken).toMatch(/^eyJ/)
    expect(res.body.expiresIn).toBe(900)
    expect(res.body.user).toMatchObject({
      email: EMAIL,
      name: 'Bobur Toshmatov',
      position: 'Direktor',
      role: 'admin',
    })
    expect(res.body.user.tenant.name).toBe('Qurilish Mollari')
    // Parol xeshi javobda HECH QACHON bo'lmaydi
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/)
  })

  it('refresh token httpOnly, SameSite=Strict cookie’da qaytadi', async () => {
    const res = await login({ email: EMAIL, password: PASSWORD }).expect(201)
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!
    expect(cookie).toMatch(/^refresh_token=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Strict/i)
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/i)
    // Token JAVOB TANASIDA bo'lmasligi kerak
    expect(JSON.stringify(res.body)).not.toContain(cookie.split('=')[1]!.split(';')[0]!)
  })

  it('noto‘g‘ri parol → 401 AUTH_INVALID_CREDENTIALS', async () => {
    const res = await login({ email: EMAIL, password: 'BoshqaParol1!' }).expect(401)
    expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS')
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('mavjud bo‘lmagan email ham AYNI xatoni beradi', async () => {
    const res = await login({ email: 'yoq@crm.uz', password: PASSWORD }).expect(401)
    expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS')
  })

  it('foydalanuvchi bor-yo‘qligi javob vaqtidan bilinmaydi', async () => {
    const measure = async (email: string): Promise<number> => {
      const started = Date.now()
      await login({ email, password: 'NotoQriParol1!' })
      return Date.now() - started
    }
    // Har biri uchun ikki o'lchov — sistema shovqinini kamaytiramiz
    const known = Math.min(await measure(EMAIL), await measure(EMAIL))
    const unknown = Math.min(await measure('yoq@crm.uz'), await measure('yoq2@crm.uz'))
    // Ikkalasi ham argon2 tekshiruvidan o'tadi: farq katta bo'lmasligi kerak
    expect(Math.abs(known - unknown)).toBeLessThan(known * 0.7 + 40)
  })

  it('email katta-kichik harfga bog‘liq emas', async () => {
    await login({ email: 'ADMIN@CRM.UZ', password: PASSWORD }).expect(201)
  })

  it('noto‘g‘ri email formati → 400', async () => {
    const res = await login({ email: 'email-emas', password: PASSWORD }).expect(400)
    expect(res.body.code).toBe('VALIDATION_FAILED')
  })

  it('ortiqcha maydon so‘rovni rad etadi', async () => {
    await login({ email: EMAIL, password: PASSWORD, role: 'admin' }).expect(400)
  })

  it('o‘chirilgan foydalanuvchi kira olmaydi', async () => {
    await testDb.user.updateMany({ where: { email: EMAIL }, data: { isActive: false } })
    await login({ email: EMAIL, password: PASSWORD }).expect(401)
  })

  it('to‘xtatilgan do‘kon → 423 AUTH_ACCOUNT_LOCKED', async () => {
    await testDb.tenant.updateMany({ data: { status: 'suspended' } })
    const res = await login({ email: EMAIL, password: PASSWORD }).expect(423)
    expect(res.body.code).toBe('AUTH_ACCOUNT_LOCKED')
  })

  it('bir email ikki do‘konda → AUTH_TENANT_REQUIRED va tanlash mumkin', async () => {
    const second = await provisioning.provision({
      tenantName: 'Ikkinchi do‘kon',
      owner: {
        name: 'Bobur Toshmatov', phone: '+998901234567', email: EMAIL,
        passwordHash: await passwords.hash(PASSWORD),
      },
    })

    const res = await login({ email: EMAIL, password: PASSWORD }).expect(409)
    expect(res.body.code).toBe('AUTH_TENANT_REQUIRED')
    expect(res.body.errors).toHaveLength(2)

    const ok = await login({ email: EMAIL, password: PASSWORD, tenantId: second.tenantId }).expect(201)
    expect(ok.body.user.tenant.name).toBe('Ikkinchi do‘kon')
  })

  it('lastLoginAt yangilanadi', async () => {
    await login({ email: EMAIL, password: PASSWORD }).expect(201)
    const user = await testDb.user.findFirstOrThrow({ where: { email: EMAIL } })
    expect(user.lastLoginAt).not.toBeNull()
  })
})
