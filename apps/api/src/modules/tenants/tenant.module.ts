import { Module } from '@nestjs/common'
import { PlanService } from './plan.service'
import { TenantProvisioningService } from './tenant-provisioning.service'
import { TenantStatusService } from './tenant-status.service'

@Module({
  providers: [TenantProvisioningService, PlanService, TenantStatusService],
  exports: [TenantProvisioningService, PlanService, TenantStatusService],
})
export class TenantsModule {}
