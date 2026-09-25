import { Module } from '@nestjs/common'
import { CashModule } from '@/modules/cash/cash.module'
import { ExpenseTemplatesController, ExpensesController } from './expenses.controller'
import { ExpenseTemplateJobs } from './expense-templates.jobs'
import { ExpenseTemplatesService } from './expense-templates.service'
import { ExpensesService } from './expenses.service'

@Module({
  imports: [CashModule],
  controllers: [ExpensesController, ExpenseTemplatesController],
  providers: [ExpensesService, ExpenseTemplatesService, ExpenseTemplateJobs],
})
export class ExpensesModule {}
