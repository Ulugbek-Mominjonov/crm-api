import { Module } from '@nestjs/common'
import { PlatformAuditService } from './platform-audit.service'
import { PlatformSettingsService } from './platform-settings.service'

/**
 * Egasi panelining boshqa modullar ham ishlatadigan qismi: egasi jurnali
 * (Telegram'dan ulanish ham yoziladi) va platforma sozlamasi (ro'yxatdan
 * o'tish ochiq/yopiq — `RegistrationController`). Controller'siz, faqat
 * `PrismaService` ga bog'liq — aylanma import bo'lmaydi.
 */
@Module({
  providers: [PlatformAuditService, PlatformSettingsService],
  exports: [PlatformAuditService, PlatformSettingsService],
})
export class PlatformCoreModule {}
