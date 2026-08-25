import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PasswordService } from '@/modules/auth/password.service'
import { TenantProvisioningService } from '@/modules/tenants/tenant-provisioning.service'
import { createTestApp } from './helpers/app'
import { testDb, truncateAll } from './helpers/db'

const PASSWORD = 'Qurilish2026!'
const EMAIL = 'admin@crm.uz'

/** Set-Cookie sarlavhasidan refresh token qiymatini ajratadi */
function cookieValue(res: request.Response): string {
  const raw = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? ''
  return raw.split('=')[1]?.split(';')[0] ?? ''
}

describe('Refresh rotatsiyasi va o‘g‘irlanishni aniqlash', () => {
  let app: INestApplication

  beforeAll(async () => { app = await createTestApp() })
  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  let accessToken: string
  let refreshToken: string

  beforeEach(async () => {
    await truncateAll()
    await app.get(TenantProvisioningService).provision({
      tenantName: 'Qurilish Mollari',
      owner: {
        name: 'Bobur Toshmatov', phone: '+998901234567', email: EMAIL,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
      },
    })
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(201)
    accessToken = res.body.accessToken
    refreshToken = cookieValue(res)
  })

  const refresh = (token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`refresh_token=${token}`])

  it('har yangilashda YANGI token beriladi, eskisi bekor qilinadi', async () => {
    const res = await refresh(refreshToken).expect(201)
    const next = cookieValue(res)

    expect(next).not.toBe(refreshToken)
    expect(res.body.accessToken).toMatch(/^eyJ/)

    const old = await testDb.refreshToken.findFirstOrThrow({
      where: { parentId: null },
      orderBy: { createdAt: 'asc' },
    })
    expect(old.revokedAt).not.toBeNull()
  })

  it('zanjir uzluksiz: yangi token eskisiga bog‘lanadi', async () => {
    const second = cookieValue(await refresh(refreshToken).expect(201))
    await refresh(second).expect(201)

    const tokens = await testDb.refreshToken.findMany({ orderBy: { createdAt: 'asc' } })
    expect(tokens).toHaveLength(3)
    expect(tokens[1]!.parentId).toBe(tokens[0]!.id)
    expect(tokens[2]!.parentId).toBe(tokens[1]!.id)
  })

  it('BEKOR QILINGAN token qayta ishlatilsa barcha sessiyalar yopiladi', async () => {
    const second = cookieValue(await refresh(refreshToken).expect(201))

    // O'g'irlangan eski token bilan urinish
    const res = await refresh(refreshToken).expect(401)
    expect(res.body.code).toBe('AUTH_TOKEN_REUSE')

    // Endi HECH BIR token ishlamaydi — foydalanuvchi qayta kirishi kerak
    await refresh(second).expect(401)
    const active = await testDb.refreshToken.count({ where: { revokedAt: null } })
    expect(active).toBe(0)
  })

  it('noma’lum token → 401 AUTH_INVALID_REFRESH', async () => {
    const res = await refresh('umuman-boshqa-token').expect(401)
    expect(res.body.code).toBe('AUTH_INVALID_REFRESH')
  })

  it('cookie yo‘q bo‘lsa → 401', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401)
    expect(res.body.code).toBe('AUTH_INVALID_REFRESH')
  })

  it('muddati o‘tgan token qabul qilinmaydi', async () => {
    await testDb.refreshToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    const res = await refresh(refreshToken).expect(401)
    expect(res.body.code).toBe('AUTH_INVALID_REFRESH')
  })

  it('logout joriy tokenni bekor qiladi', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', [`refresh_token=${refreshToken}`])
      .expect(201)

    await refresh(refreshToken).expect(401)
  })

  it('logout-all barcha qurilmalardagi sessiyalarni yopadi', async () => {
    // Ikkinchi qurilmadan kirish
    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(201)

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201)
    expect(res.body.revoked).toBe(2)

    await refresh(refreshToken).expect(401)
    await refresh(cookieValue(second)).expect(401)
  })

  it('parol o‘zgarganda barcha sessiyalar yopiladi', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'YangiParol2026!' })
      .expect(201)

    await refresh(refreshToken).expect(401)
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: EMAIL, password: 'YangiParol2026!' })
      .expect(201)
  })

  it('noto‘g‘ri joriy parol bilan o‘zgartirib bo‘lmaydi', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'XatoParol1!', newPassword: 'YangiParol2026!' })
      .expect(401)
    expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS')
  })

  it('kuchsiz yangi parol rad etiladi', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: '12345678' })
      .expect(400)
    expect(res.body.code).toBe('VALIDATION_FAILED')
  })
})
