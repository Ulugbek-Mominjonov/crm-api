import { Module } from '@nestjs/common'
import { AuthModule } from '@/modules/auth/auth.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  // Parol siyosati va sessiyalarni yopish — auth modulining servislari orqali
  imports: [AuthModule, TenantsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
