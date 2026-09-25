import { Module } from '@nestjs/common'
import { StockController } from './stock.controller'
import { StockService } from './stock.service'
import { StockOperationsService } from './stock-operations.service'
import { StockQueriesService } from './stock-queries.service'

@Module({
  controllers: [StockController],
  providers: [StockService, StockOperationsService, StockQueriesService],
  // Qoldiqni o'zgartiradigan boshqa modullar (sotuv, xarid, import) FAQAT shu servis orqali
  exports: [StockService],
})
export class StockModule {}
