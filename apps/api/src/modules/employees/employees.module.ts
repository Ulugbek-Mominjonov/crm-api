import { Module } from '@nestjs/common'
import { AuthModule } from '@/modules/auth/auth.module'
import { RolesModule } from '@/modules/roles/roles.module'
import { EmployeesController } from './employees.controller'
import { EmployeesService } from './employees.service'

@Module({
  // Bo'shatishda sessiyalarni yopish — auth moduli; huquq keshini tozalash — rollar moduli
  imports: [AuthModule, RolesModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
