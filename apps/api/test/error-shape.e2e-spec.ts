import { Body, Controller, Get, Module, Post } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { IsInt, IsString, Min } from 'class-validator'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { setupApp } from '@/bootstrap/setup-app'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { RequestContextMiddleware } from '@/common/middleware/request-context.middleware'
import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'

class SampleDto {
  @IsString() name!: string
  @IsInt() @Min(1) qty!: number
}

@Controller('probe')
class ProbeController {
  @Get('domain')
  domain(): never {
    throw new DomainError('STOCK_INSUFFICIENT', 'Sement M400: kerak 20, mavjud 12', [
      { field: 'items[0].qty', code: 'STOCK_INSUFFICIENT', meta: { available: 12, requested: 20 } },
    ])
  }

  @Get('missing')
  missing(): never {
    throw new NotFoundError('Mahsulot', 'pr_1')
  }

  @Get('boom')
  boom(): never {
    throw new Error('ichki tafsilot — mijozga chiqmasligi kerak')
  }

  @Post('validate')
  validate(@Body() dto: SampleDto): SampleDto {
    return dto
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*splat')
  }
}

describe('Xato javobining shakli', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile()
    app = setupApp(moduleRef.createNestApplication<NestExpressApplication>())
    await app.init()
  })

  afterAll(async () => { await app.close() })

  it('domen xatosi katalogdagi status va kod bilan qaytadi', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/domain')
    expect(res.status).toBe(422)
    expect(res.body).toMatchObject({
      code: 'STOCK_INSUFFICIENT',
      status: 422,
      title: 'Omborda yetarli tovar yo‘q',
      detail: 'Sement M400: kerak 20, mavjud 12',
      instance: '/api/v1/probe/domain',
      type: 'https://api.crm.uz/errors/stock-insufficient',
    })
    expect(res.body.errors[0]).toMatchObject({ field: 'items[0].qty' })
    expect(res.body.traceId).toBeTruthy()
  })

  it('topilmadi → 404', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/missing')
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('kutilmagan xato mijozga tafsilot bermaydi', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/boom')
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL')
    expect(JSON.stringify(res.body)).not.toContain('ichki tafsilot')
    expect(JSON.stringify(res.body)).not.toContain('stack')
    expect(res.body.traceId).toBeTruthy()
  })

  it('validatsiya xatosi 400 va VALIDATION_FAILED beradi', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe/validate')
      .send({ name: 'x', qty: 0 })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_FAILED')
    expect(res.body.detail).toMatch(/qty/)
  })

  it('DTO da yo‘q maydon so‘rovni rad etadi (forbidNonWhitelisted)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe/validate')
      .send({ name: 'x', qty: 5, role: 'admin' })
    expect(res.status).toBe(400)
    expect(res.body.detail).toMatch(/role/)
  })

  it('buzuq JSON — 500 emas, 400 VALIDATION_FAILED', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe/validate')
      .set('Content-Type', 'application/json')
      .send('{"name": ')
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_FAILED')
  })

  it('hajm chegarasidan katta tana — 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe/validate')
      .send({ name: 'x'.repeat(5 * 1024 * 1024), qty: 1 })
    expect(res.status).toBe(413)
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('traceId javob sarlavhasida ham qaytadi va so‘rovdagisini saqlaydi', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/missing')
      .set('x-request-id', 'trace-123')
    expect(res.headers['x-request-id']).toBe('trace-123')
    expect(res.body.traceId).toBe('trace-123')
  })
})
