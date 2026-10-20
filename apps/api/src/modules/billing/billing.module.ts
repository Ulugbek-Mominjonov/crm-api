import { Module } from '@nestjs/common'
import { FilesModule } from '@/modules/files/files.module'
import { PlatformCoreModule } from '@/modules/platform/platform-core.module'
import { TelegramModule } from '@/modules/telegram/telegram.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { ClickService } from './click.service'
import { PaymeService } from './payme.service'

@Module({
  // TelegramModule — to'lov haqida egasiga xabar (T-137, T-149); PlatformCoreModule — egasining kartasi;
  // FilesModule — karta to'lovi cheki egasiga fayl sifatida
  imports: [TenantsModule, TelegramModule, PlatformCoreModule, FilesModule],
  controllers: [BillingController],
  providers: [BillingService, PaymeService, ClickService],
  // Egasi paneli (T-135) qo'lda to'lovni shu servis orqali tasdiqlaydi — tarif mantig'i bitta joyda
  exports: [BillingService],
})
export class BillingModule {}
