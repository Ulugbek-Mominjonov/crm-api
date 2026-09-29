import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SettingsModule } from '@/modules/settings/settings.module'
import { TELEGRAM_CLIENT, createTelegramClient } from './telegram.client'
import { TelegramController } from './telegram.controller'
import { TelegramReceiver } from './telegram-receiver'
import { TelegramService } from './telegram.service'

/** Telegram bot (Q116). Mijoz — xabarlar navbati ishchisi, servis — mijoz havolasi va chek uchun */
@Module({
  imports: [SettingsModule],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    TelegramReceiver,
    { provide: TELEGRAM_CLIENT, useFactory: createTelegramClient, inject: [ConfigService] },
  ],
  exports: [TELEGRAM_CLIENT, TelegramService],
})
export class TelegramModule {}
