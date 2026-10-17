import { Module } from '@nestjs/common'
import { CashModule } from '@/modules/cash/cash.module'
import { PayrollAccrualService } from './payroll-accrual.service'
import { PayrollController } from './payroll.controller'
import { PayrollJobs } from './payroll.jobs'
import { PayrollService } from './payroll.service'

@Module({
  imports: [CashModule],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollAccrualService, PayrollJobs],
})
export class PayrollModule {}
