import { readFileSync } from 'node:fs'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/**
 * Access tokenni darhol bekor qilish (T-147): sessiyalar yopilganda
 * (`logout-all`, parol, faolsizlantirish, bo'shatish) undan OLDIN berilgan
 * access token keyingi so'rovdanoq 401 — 15 daqiqa kutilmaydi.
 */
describe('Access token bekor qilish (/auth/logout-all, PATCH /users)', () => {
  let app: INestApplication
  let a: Tenant

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
    a = await seedTenant('A do‘kon')
  })

  const api = () => request(app.getHttpServer())
  /** Bir necha soniya OLDIN berilgan token (JWT `iat` soniyada — shu soniyadagi bekor qilish uni rad etmaydi) */
  const olderToken = (who: { userId: string; tenantId: string; employeeId: string }, secondsAgo = 5) =>
    app.get(JwtService).signAsync(
      { sub: who.userId, tid: who.tenantId, eid: who.employeeId, jti: 'test', iat: Math.floor(Date.now() / 1000) - secondsAgo },
      { algorithm: 'RS256', privateKey: readFileSync(process.env.JWT_PRIVATE_KEY_PATH!, 'utf8'), expiresIn: '15m' },
    )

  it('«barcha qurilmalardan chiqish» — eski access token darhol 401, yangi kirish esa ishlaydi', async () => {
    const old = `Bearer ${await olderToken(a)}`
    await api().get('/api/v1/auth/me').set('Authorization', old).expect(200)
    await api().post('/api/v1/auth/logout-all').set('Authorization', old).expect(201)
    expect((await api().get('/api/v1/auth/me').set('Authorization', old).expect(401)).body.code).toBe('AUTH_INVALID_CREDENTIALS')
    expect((await testDb.user.findUniqueOrThrow({ where: { id: a.userId } })).tokensInvalidBefore).not.toBeNull()
    // Bekor qilishdan keyin berilgan token — amal qiladi
    await api().get('/api/v1/auth/me').set('Authorization', await bearer(app, a)).expect(200)
  })

  it('administrator hisobni faolsizlantirsa — o‘sha foydalanuvchining eski tokeni darhol 401', async () => {
    const seller = await bearer(app, a, 'sotuvchi')
    const user = await testDb.user.findFirstOrThrow({ where: { tenantId: a.tenantId, email: { startsWith: 'sotuvchi+' } } })
    const old = `Bearer ${await olderToken({ userId: user.id, tenantId: a.tenantId, employeeId: user.employeeId })}`
    await api().get('/api/v1/auth/me').set('Authorization', old).expect(200)
    await api().get('/api/v1/auth/me').set('Authorization', seller).expect(200)

    // Keyingi soniyaga o'tamiz: `seller` tokeni shu soniyada berilgan, bekor qilish vaqti soniyagacha
    await new Promise((r) => setTimeout(r, 1_100))
    const admin = await bearer(app, a)
    const current = (await api().get(`/api/v1/users/${user.id}`).set('Authorization', admin).expect(200)).body
    await api().patch(`/api/v1/users/${user.id}`).set('Authorization', admin).set('If-Match', current.updatedAt)
      .send({ isActive: false }).expect(200)
    await api().get('/api/v1/auth/me').set('Authorization', old).expect(401)
    await api().get('/api/v1/auth/me').set('Authorization', seller).expect(401)
  })
})
