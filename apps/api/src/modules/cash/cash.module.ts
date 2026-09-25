import { Module } from '@nestjs/common'
import { CashController } from './cash.controller'
import { CashMovementsService } from './cash-movements.service'
import { CashRegisterService } from './cash-register.service'
import { ShiftsService } from './shifts.service'

@Module({
  controllers: [CashController],
  providers: [CashRegisterService, ShiftsService, CashMovementsService],
  // Pul amallari (sotuv, xarajat, to'lovlar) registr qulfi va naqd CTE'lari uchun
  exports: [CashRegisterService],
})
export class CashModule {}
