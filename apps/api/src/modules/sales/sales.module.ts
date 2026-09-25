import { Module } from '@nestjs/common'
import { CashModule } from '@/modules/cash/cash.module'
import { CreditModule } from '@/modules/credit/credit.module'
import { DocNumbersModule } from '@/modules/doc-numbers/doc-numbers.module'
import { FiscalModule } from '@/modules/fiscal/fiscal.module'
import { SettingsModule } from '@/modules/settings/settings.module'
import { StockModule } from '@/modules/stock/stock.module'
import { SalesController } from './sales.controller'
import { SalesQueriesService } from './sales-queries.service'
import { SalesService } from './sales.service'

@Module({
  imports: [StockModule, CashModule, CreditModule, DocNumbersModule, SettingsModule, FiscalModule],
  controllers: [SalesController],
  providers: [SalesService, SalesQueriesService],
  // Taklifni aylantirish (T-058) chekni shu servis orqali yaratadi
  exports: [SalesService],
})
export class SalesModule {}
