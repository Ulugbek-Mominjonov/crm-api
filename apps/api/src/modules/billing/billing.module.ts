import { Module } from '@nestjs/common'
import { TelegramModule } from '@/modules/telegram/telegram.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { ClickService } from './click.service'
import { PaymeService } from './payme.service'

@Module({
  // TelegramModule — onlayn to'lov haqida egasiga xabar (T-137)
  imports: [TenantsModule, TelegramModule],
  controllers: [BillingController],
  providers: [BillingService, PaymeService, ClickService],
  // Egasi paneli (T-135) qo'lda to'lovni shu servis orqali tasdiqlaydi — tarif mantig'i bitta joyda
  exports: [BillingService],
})
export class BillingModule {}
