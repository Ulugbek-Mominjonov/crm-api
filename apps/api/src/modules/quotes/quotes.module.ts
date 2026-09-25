import { Module } from '@nestjs/common'
import { CashModule } from '@/modules/cash/cash.module'
import { DocNumbersModule } from '@/modules/doc-numbers/doc-numbers.module'
import { SalesModule } from '@/modules/sales/sales.module'
import { SettingsModule } from '@/modules/settings/settings.module'
import { QuotesController } from './quotes.controller'
import { QuotesService } from './quotes.service'

@Module({
  imports: [SalesModule, CashModule, DocNumbersModule, SettingsModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
