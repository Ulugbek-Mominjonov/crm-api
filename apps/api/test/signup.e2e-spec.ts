import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { testDb, truncateAll } from './helpers/db'

const BODY = {
  storeName: 'Ali Qurilish Mollari',
  ownerName: 'Ali Valiyev',
  phone: '+998 90 123-45-67',
  email: 'Ali@Dokon.uz',
  password: 'Qurilish2026!',
}

/**
 * Ro'yxatdan o'tish (T-124, 07 §7.9): yangi do'kon — sozlama, sukut
 * ombor, kategoriyalar, egasi (administrator) va darhol sessiya; keyin
 * mavjud sozlash sehrgari (`onboarded = false`).
 */
describe('Yangi do‘kon (POST /tenants/register)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
  })

  const register = (body: Record<string, unknown>) => request(app.getHttpServer()).post('/api/v1/tenants/register').send(body)

  it('do‘kon va administrator yaratiladi, sessiya darhol (token + refresh cookie)', async () => {
    const res = await register(BODY).expect(201)
    expect(res.body).toMatchObject({
      expiresIn: 900,
      user: { name: 'Ali Valiyev', email: 'ali@dokon.uz', role: 'admin', position: 'Direktor', tenant: { name: 'Ali Qurilish Mollari' } },
    })
    expect(String(res.headers['set-cookie'])).toContain('refresh_token=')

    const tenantId = res.body.user.tenant.id as string
    const [settings, warehouses, categories, employee] = await Promise.all([
      testDb.settings.findUniqueOrThrow({ where: { tenantId } }),
      testDb.warehouse.findMany({ where: { tenantId } }),
      testDb.category.count({ where: { tenantId } }),
      testDb.employee.findFirstOrThrow({ where: { tenantId } }),
    ])
    expect(settings).toMatchObject({ storeName: 'Ali Qurilish Mollari', onboarded: false })
    expect(warehouses).toMatchObject([{ isDefault: true }])
    expect(categories).toBeGreaterThan(0)
    expect(employee.phone).toBe('+998901234567')

    // Token ishlaydi (RLS: faqat o'z do'koni) va keyin oddiy kirish
    const me = await request(app.getHttpServer()).get('/api/v1/settings').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200)
    expect(me.body.storeName).toBe('Ali Qurilish Mollari')
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'ali@dokon.uz', password: BODY.password }).expect(201)
  })

  it('kuchsiz parol, noto‘g‘ri email/telefon, bo‘sh nom — 400, hech narsa yaratilmaydi', async () => {
    const weak = await register({ ...BODY, password: '12345678' }).expect(400)
    expect(weak.body.errors[0]).toMatchObject({ field: 'password', code: 'VALIDATION_FAILED' })
    await register({ ...BODY, email: 'emas' }).expect(400)
    await register({ ...BODY, phone: '12' }).expect(400)
    await register({ ...BODY, storeName: '  ' }).expect(400)
    await register({ ...BODY, role: 'admin', tenantId: 'x' }).expect(400)
    expect(await testDb.tenant.count()).toBe(0)
  })

  it('bir IP dan soatiga 5 tadan ortiq — 429', async () => {
    for (let i = 0; i < 5; i += 1) await register({ ...BODY, email: `a${i}@dokon.uz` }).expect(201)
    await register({ ...BODY, email: 'a6@dokon.uz' }).expect(429)
  })
})
