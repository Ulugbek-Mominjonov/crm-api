import { Controller, Get, Module } from '@nestjs/common'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { setupApp } from '@/bootstrap/setup-app'

const ALLOWED = 'https://crm.domen.uz'

@Controller('probe')
class SecProbeController {
  @Get('ok')
  ok(): { ok: true } {
    return { ok: true }
  }
}

@Module({ controllers: [SecProbeController] })
class SecProbeModule {}

describe('Xavfsizlik sarlavhalari va CORS', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [SecProbeModule] }).compile()
    app = setupApp(moduleRef.createNestApplication<NestExpressApplication>(), { origins: [ALLOWED] })
    await app.init()
  })

  afterAll(async () => { await app.close() })

  it('helmet sarlavhalari qo‘yiladi', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/ok').expect(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/)
    // Server texnologiyasi oshkor qilinmaydi
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('ruxsat etilgan manbaga CORS ochiq (credentials bilan)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/ok')
      .set('Origin', ALLOWED)
      .expect(200)
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('begona manbaga CORS berilmaydi', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/ok')
      .set('Origin', 'https://yovuz.example')
      .expect(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('preflight kerakli sarlavhalarga ruxsat beradi', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/v1/probe/ok')
      .set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'idempotency-key')
    expect(res.status).toBeLessThan(300)
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain(
      'idempotency-key',
    )
  })

  it('CORS sozlanmagan bo‘lsa umuman yoqilmaydi', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [SecProbeModule] }).compile()
    const bare = setupApp(moduleRef.createNestApplication<NestExpressApplication>(), {})
    await bare.init()
    const res = await request(bare.getHttpServer())
      .get('/api/v1/probe/ok')
      .set('Origin', ALLOWED)
      .expect(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    await bare.close()
  })
})
