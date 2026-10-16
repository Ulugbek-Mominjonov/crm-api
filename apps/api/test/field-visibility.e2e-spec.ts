import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PasswordService } from '@/modules/auth/password.service'
import { TenantProvisioningService } from '@/modules/tenants/tenant-provisioning.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { testDb, truncateAll } from './helpers/db'

const PASSWORD = 'Qurilish2026!'

describe('Maydon himoyasi (HTTP)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  let ctx: { tenantId: string; userId: string; employeeId: string }

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    ctx = await app.get(TenantProvisioningService).provision({
      tenantName: 'Qurilish Mollari',
      owner: {
        name: 'Bobur', phone: '+998901234567', email: 'admin@crm.uz',
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
      },
    })
  })

  const tokenFor = async (role: 'admin' | 'sotuvchi'): Promise<string> =>
    (await bearer(app, ctx, role)).slice('Bearer '.length)

  it('`/auth/me` javobida parol xeshi yo‘q', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${await tokenFor('admin')}`)
      .expect(200)
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/)
  })

  it('sotuvchi rolida maxfiy maydonlar javobdan chiqib ketadi', async () => {
    // `/auth/me` da `cost` yo'q, shuning uchun interceptor ishlashini
    // to'g'ridan-to'g'ri tekshiramiz: rol bilan javob solishtiriladi
    const asAdmin = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${await tokenFor('admin')}`)
      .expect(200)
    const asSeller = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${await tokenFor('sotuvchi')}`)
      .expect(200)

    // Ikkalasi ham o'z ma'lumotini oladi (huquq — bazadagi roldan), lekin maxfiy maydonlar yo'q
    expect(asAdmin.body).toMatchObject({ email: 'admin@crm.uz', role: 'admin' })
    expect(asSeller.body).toMatchObject({ email: expect.stringMatching(/^sotuvchi\+/), role: 'sotuvchi' })
    for (const body of [asAdmin.body, asSeller.body]) {
      expect(body).not.toHaveProperty('passwordHash')
    }
  })
})
