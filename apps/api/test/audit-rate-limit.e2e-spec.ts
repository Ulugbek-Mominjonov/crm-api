import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PasswordService } from '@/modules/auth/password.service'
import { TenantProvisioningService } from '@/modules/tenants/tenant-provisioning.service'
import { createTestApp } from './helpers/app'
import { testDb, truncateAll } from './helpers/db'

const PASSWORD = 'Qurilish2026!'
const EMAIL = 'admin@crm.uz'

describe('Audit jurnali va rate limit', () => {
  let app: INestApplication

  beforeAll(async () => { app = await createTestApp() })
  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    await truncateAll()
    await app.get(TenantProvisioningService).provision({
      tenantName: 'Qurilish Mollari',
      owner: {
        name: 'Bobur', phone: '+998901234567', email: EMAIL,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
      },
    })
  })

  const login = () =>
    request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: EMAIL, password: PASSWORD })

  it('yozuvchi amal jurnalga tushadi', async () => {
    const token = (await login().expect(201)).body.accessToken
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'YangiParol2026!' })
      .expect(201)

    const entries = await testDb.auditEntry.findMany()
    expect(entries.length).toBeGreaterThan(0)
    const entry = entries.at(-1)!
    expect(entry.userId).not.toBeNull()
    expect(entry.tenantId).not.toBeNull()
    expect(entry.action).toContain('change-password')
  })

  it('o‘qish amallari jurnalga tushmaydi (shovqin bo‘lmasin)', async () => {
    const token = (await login().expect(201)).body.accessToken
    await testDb.auditEntry.deleteMany().catch(() => undefined)

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    // Trigger o'chirishga yo'l qo'ymagani uchun sonni solishtiramiz
    const after = await testDb.auditEntry.count({ where: { action: { contains: 'me' } } })
    expect(after).toBe(0)
  })

  it('yiqilgan amal jurnalga tushmaydi', async () => {
    const token = (await login().expect(201)).body.accessToken
    const before = await testDb.auditEntry.count()

    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'XatoParol1!', newPassword: 'YangiParol2026!' })
      .expect(401)

    expect(await testDb.auditEntry.count()).toBe(before)
  })

  it('kirish urinishlari daqiqasiga 10 marta bilan cheklangan', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 13; i++) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: EMAIL, password: 'NotoQri1!' })
      statuses.push(res.status)
    }
    expect(statuses).toContain(429)
    // Dastlabki urinishlar o'tadi (401), keyingilari to'siladi (429)
    expect(statuses[0]).toBe(401)
  }, 30_000)
})
