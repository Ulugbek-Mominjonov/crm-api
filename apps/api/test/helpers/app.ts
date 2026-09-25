import type { INestApplication } from '@nestjs/common'
import { Test, type TestingModuleBuilder } from '@nestjs/testing'
import { AppModule } from '@/app.module'
import { PrismaService } from '@/prisma/prisma.service'
import { setupApp, type SetupOptions } from '@/bootstrap/setup-app'
import { ThrottlerStorage } from '@nestjs/throttler'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { appDb } from './db'

/**
 * To'liq ilova — e2e testlar uchun. Baza ulanishi `crm_app` roli bilan
 * (`appDb`): production bilan bir xil RLS qoidalari ostida.
 */
export async function createTestApp(
  /** Tashqi xizmatlarni (SMS provayderi …) soxtasi bilan almashtirish */
  override: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
  /** `setupApp` ning qo'shimcha sozlamalari (masalan `trustProxy`) */
  setup: Omit<SetupOptions, 'origins'> = {},
): Promise<INestApplication> {
  const moduleRef = await override(
    Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(appDb),
  ).compile()

  const app = setupApp(moduleRef.createNestApplication<NestExpressApplication>(), {
    origins: ['http://localhost:5173'],
    ...setup,
  })
  await app.init()
  return app
}

/**
 * Rate limit hisoblagichini tozalaydi.
 *
 * Testlar bitta "IP" dan ko'p so'rov yuboradi — chegara ular uchun emas,
 * haqiqiy hujum uchun. Rate limitning O'ZINI tekshiradigan testda bu
 * ATAYLAB chaqirilmaydi.
 */
export function resetThrottle(app: INestApplication): void {
  const storage = app.get<ThrottlerStorage & { storage?: Map<string, unknown> }>(
    ThrottlerStorage,
    { strict: false },
  )
  storage.storage?.clear()
}
