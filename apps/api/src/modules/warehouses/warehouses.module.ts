import { Module } from '@nestjs/common'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { WarehousesController } from './warehouses.controller'
import { WarehousesService } from './warehouses.service'

@Module({
  imports: [TenantsModule],
  controllers: [WarehousesController],
  providers: [WarehousesService],
  exports: [WarehousesService],
})
export class WarehousesModule {}
