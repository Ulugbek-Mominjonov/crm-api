import { Body, Controller, Module, Post } from '@nestjs/common'
import type { INestApplication, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { IsString } from 'class-validator'
import pino from 'pino'
import { Writable } from 'node:stream'
import request from 'supertest'
import { setupApp } from '@/bootstrap/setup-app'
import { AppLogger } from '@/common/logging/logger.service'
import { REDACT_PATHS } from '@/common/logging/redaction'
import { RequestContextMiddleware } from '@/common/middleware/request-context.middleware'
import { enrichContext } from '@/common/context/request-context'

const SECRET = 'juda-sirli-parol-123'
const TOKEN = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.SIRLI'

class LoginProbeDto {
  @IsString() email!: string
  @IsString() password!: string
}

/** Log yozuvlarini xotirada yig'adi */
function memorySink(): { lines: string[]; stream: Writable } {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk))
      cb()
    },
  })
  return { lines, stream }
}

const sink = memorySink()

@Controller('probe')
class LogProbeController {
  constructor(private readonly logger: AppLogger) {}

  @Post('login')
  login(@Body() dto: LoginProbeDto): { ok: boolean } {
    // Amalda ham shunday bo'ladi: kontekst autentifikatsiyadan keyin to'ladi
    enrichContext({ tenantId: 't_1', userId: 'u_1' })
    this.logger.log('Kirish urinishi', {
      email: dto.email,
      password: dto.password,
      nested: { refreshToken: TOKEN },
    })
    return { ok: true }
  }
}

@Module({
  controllers: [LogProbeController],
  providers: [
    {
      provide: AppLogger,
      useFactory: () =>
        new AppLogger(
          pino({ level: 'info', redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, sink.stream),
        ),
    },
  ],
})
class LogProbeModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*splat')
  }
}

describe('Log tozalash (redaction)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [LogProbeModule] }).compile()
    app = setupApp(moduleRef.createNestApplication<NestExpressApplication>())
    await app.init()
  })

  afterAll(async () => { await app.close() })

  beforeEach(() => { sink.lines.length = 0 })

  it('parol va token loglarga tushmaydi', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/probe/login')
      .set('authorization', `Bearer ${TOKEN}`)
      .send({ email: 'kassir@crm.uz', password: SECRET })
      .expect(201)

    const all = sink.lines.join('\n')
    expect(all).not.toContain(SECRET)
    expect(all).not.toContain(TOKEN)
    expect(all).toContain('[redacted]')
  })

  it('har bir yozuvda requestId, tenantId va userId bor', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/probe/login')
      .set('x-request-id', 'trace-abc')
      .send({ email: 'a@b.uz', password: SECRET })
      .expect(201)

    const entry = JSON.parse(sink.lines[0] ?? '{}')
    expect(entry.requestId).toBe('trace-abc')
    expect(entry.tenantId).toBe('t_1')
    expect(entry.userId).toBe('u_1')
    expect(entry.msg).toBe('Kirish urinishi')
    // Maxfiy bo'lmagan maydon saqlanadi — log foydali bo'lib qolsin
    expect(entry.email).toBe('a@b.uz')
  })
})
