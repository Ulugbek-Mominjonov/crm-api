import { Module } from '@nestjs/common'
import { CashModule } from '@/modules/cash/cash.module'
import { DocNumbersModule } from '@/modules/doc-numbers/doc-numbers.module'
import { StockModule } from '@/modules/stock/stock.module'
import { PurchaseOrdersController } from './purchase-orders.controller'
import { PurchaseOrdersService } from './purchase-orders.service'

@Module({
  imports: [StockModule, CashModule, DocNumbersModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
