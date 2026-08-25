import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import { config as loadDotenv } from 'dotenv'
import { parseEnv, type Env } from '@/config/env.schema'

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

async function bootstrap(): Promise<void> {
  assertEnv()
  // Muhit to'g'riligi tasdiqlangandan keyingina modul yuklanadi.
  // Yo'l ATAYLAB nisbiy: `nest build` faqat statik importlardagi `@/`
  // aliasini almashtiradi, dinamik import() da esa u o'z holicha qoladi.
  const { AppModule } = await import('./app.module')

  const app = await NestFactory.create(AppModule)
  const config = app.get<ConfigService<Env, true>>(ConfigService)

  const port = config.get('PORT', { infer: true })
  await app.listen(port)
  new Logger('Bootstrap').log(`API tayyor: http://localhost:${port}`)
}

bootstrap().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\nServer ishga tushmadi.\n${message}\n`)
  process.exit(1)
})
