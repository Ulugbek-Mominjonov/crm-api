import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PlatformCoreModule } from '@/modules/platform/platform-core.module'
import { SettingsModule } from '@/modules/settings/settings.module'
import { OwnerActionsService } from './owner-actions.service'
import { OwnerNotifierService } from './owner-notifier.service'
import { TELEGRAM_CLIENT, createTelegramClient } from './telegram.client'
import { TelegramController } from './telegram.controller'
import { TelegramReceiver } from './telegram-receiver'
import { TelegramService } from './telegram.service'

/**
 * Telegram bot (Q116). Mijoz — xabarlar navbati ishchisi, servis — mijoz
 * havolasi va chek uchun; `OwnerNotifierService` — egasiga xabarlar (T-137),
 * ro'yxatdan o'tish, to'lov va hisob modullari chaqiradi; `OwnerActionsService` —
 * egasi xabaridagi tugmalar, amalni platforma moduli ro'yxatga oladi (T-149).
 */
@Module({
  imports: [SettingsModule, PlatformCoreModule],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    TelegramReceiver,
    OwnerNotifierService,
    OwnerActionsService,
    { provide: TELEGRAM_CLIENT, useFactory: createTelegramClient, inject: [ConfigService] },
  ],
  exports: [TELEGRAM_CLIENT, TelegramService, OwnerNotifierService, OwnerActionsService],
})
export class TelegramModule {}
