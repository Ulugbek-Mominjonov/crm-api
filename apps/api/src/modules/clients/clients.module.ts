import { Module } from '@nestjs/common'
import { TelegramModule } from '@/modules/telegram/telegram.module'
import { ClientsController } from './clients.controller'
import { ClientsService } from './clients.service'

@Module({
  // Shaxsiy Telegram havolasi — mijoz kartasidan (Q116)
  imports: [TelegramModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
