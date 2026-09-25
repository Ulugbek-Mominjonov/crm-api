import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { config as loadDotenv } from 'dotenv'
import { parseEnv, type Env } from '@/config/env.schema'
import { setupApp } from '@/bootstrap/setup-app'
import { AppLogger } from '@/common/logging/logger.service'
import { initMonitoring } from '@/common/monitoring/monitoring'
import { setupSwagger } from '@/common/swagger/setup-swagger'

/**
 * Muhit AppModule import qilinishidan OLDIN tekshiriladi.
 *
 * Sabab: `@nestjs/config` tekshiruvni modul dekoratori bajarilayotganda
 * o'tkazadi — u paytdagi istisno import zanjirida ko'tarilib, foydalanuvchiga
 * uzun stack trace bo'lib chiqadi. Bu yerda esa aniq bitta xabar ko'rinadi.
 */
function assertEnv(): void {
  // ConfigModule bilan bir xil manba: .env.local ustunroq
  loadDotenv({ path: ['.env.local', '.env'], quiet: true })
  try {
    parseEnv(process.env)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`\nServer ishga tushmadi.\n${message}\n`)
    process.exit(1)
  }
}

/** API versiyasi — OpenAPI spec va `/api/v1` prefiksi uchun */
const API_VERSION = '1.0.0'

async function bootstrap(): Promise<void> {
  assertEnv()
  // Kuzatuv modul yuklanishidan OLDIN — ishga tushishdagi xatolar ham yetib borsin
  if (process.env.SENTRY_DSN) {
    initMonitoring({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'production',
      release: process.env.RELEASE,
    })
  }
  // Muhit to'g'riligi tasdiqlangandan keyingina modul yuklanadi.
  // Yo'l ATAYLAB nisbiy: `nest build` faqat statik importlardagi `@/`
  // aliasini almashtiradi, dinamik import() da esa u o'z holicha qoladi.
  const { AppModule } = await import('./app.module')

  const created = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true })
  const config = created.get<ConfigService<Env, true>>(ConfigService)
  const app = setupApp(created, {
    origins: config.get('WEB_ORIGINS', { infer: true }),
    trustProxy: config.get('TRUST_PROXY', { infer: true }),
  })
  app.useLogger(await app.resolve(AppLogger))

  const nodeEnv = config.get('NODE_ENV', { infer: true })
  const emitOnly = process.argv.includes('--emit-only')

  setupSwagger(app, {
    serveUi: nodeEnv !== 'production',
    emitPath: process.env.OPENAPI_EMIT === 'true' ? 'openapi.json' : undefined,
    version: API_VERSION,
  })

  // `--emit-only`: spec yozildi, portni band qilmasdan chiqamiz (CI uchun)
  if (emitOnly) {
    await app.close()
    return
  }

  const port = config.get('PORT', { infer: true })
  const server = await app.listen(port)
  // Yuk balanslagichning idle timeout'idan KATTA bo'lsin, aks holda
  // balanslagich yopilayotgan ulanishga so'rov yuborib 502 oladi.
  server.keepAliveTimeout = 65_000
  server.headersTimeout = 66_000
  const log = new Logger('Bootstrap')
  log.log(`API tayyor: http://localhost:${port}`)
  if (nodeEnv !== 'production') log.log(`Swagger: http://localhost:${port}/api/docs`)
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\nServer ishga tushmadi.\n${message}\n`)
  process.exit(1)
})
