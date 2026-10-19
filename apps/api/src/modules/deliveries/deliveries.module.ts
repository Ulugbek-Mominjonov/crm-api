import { Module } from '@nestjs/common'
import { CashModule } from '@/modules/cash/cash.module'
import { DeliveriesController } from './deliveries.controller'
import { DeliveriesService } from './deliveries.service'

@Module({
  // Alohida yetkazish narxi `delivered` da kassaga kiradi (T-146) — kassa registri
  imports: [CashModule],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
})
export class DeliveriesModule {}
