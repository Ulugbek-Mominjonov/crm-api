import { Module } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { ConfigModule } from '@/config/config.module'
import { LoggingModule } from '@/common/logging/logging.module'
import { AppLogger } from '@/common/logging/logger.service'
import { PrismaModule } from '@/prisma/prisma.module'
import { InvariantsModule } from '@/modules/invariants/invariants.module'
import { InvariantsService } from '@/modules/invariants/invariants.service'

/** Faqat tekshiruv uchun kerakli modullar — HTTP, navbat, cron ishga tushmaydi */
@Module({ imports: [ConfigModule, LoggingModule, PrismaModule, InvariantsModule] })
class InvariantsJobModule {}

export interface InvariantsJobResult {
  exitCode: 0 | 1
  tenants: number
  violations: number
  failed: number
}

/**
 * Bir martalik tekshiruv (tashqi cron yoki qo'lda). Chiqish kodi: 0 —
 * hammasi joyida; 1 — buzilish topildi yoki tekshirib bo'lmadi
 * (monitoring shu bo'yicha ogohlantiradi).
 */
export async function runInvariantsJob(): Promise<InvariantsJobResult> {
  const app = await NestFactory.createApplicationContext(InvariantsJobModule, { bufferLogs: true })
  app.useLogger(await app.resolve(AppLogger))
  try {
    const report = await app.get(InvariantsService).checkAll()
    const result = { tenants: report.tenants, violations: report.violations.length, failed: report.failed.length }
    return { exitCode: result.violations > 0 || result.failed > 0 ? 1 : 0, ...result }
  } finally {
    await app.close()
  }
}
