import { Module } from '@nestjs/common'
import { CashModule } from '@/modules/cash/cash.module'
import { CreditModule } from '@/modules/credit/credit.module'
import { DocNumbersModule } from '@/modules/doc-numbers/doc-numbers.module'
import { FiscalModule } from '@/modules/fiscal/fiscal.module'
import { SettingsModule } from '@/modules/settings/settings.module'
import { StockModule } from '@/modules/stock/stock.module'
import { TelegramModule } from '@/modules/telegram/telegram.module'
import { ReceiptDeliveryService } from './receipt-delivery.service'
import { SalesController } from './sales.controller'
import { SalesQueriesService } from './sales-queries.service'
import { SalesService } from './sales.service'

@Module({
  imports: [StockModule, CashModule, CreditModule, DocNumbersModule, SettingsModule, FiscalModule, TelegramModule],
  controllers: [SalesController],
  providers: [SalesService, SalesQueriesService, ReceiptDeliveryService],
  // Taklifni aylantirish (T-058) chekni shu servis orqali yaratadi
  exports: [SalesService],
})
export class SalesModule {}
