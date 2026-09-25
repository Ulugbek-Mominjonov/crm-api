import { Module } from '@nestjs/common'
import { CashModule } from '@/modules/cash/cash.module'
import { DebtsController } from './debts.controller'
import { DebtsService } from './debts.service'

@Module({
  imports: [CashModule],
  controllers: [DebtsController],
  providers: [DebtsService],
})
export class DebtsModule {}
