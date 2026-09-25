import { Module } from '@nestjs/common'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { BillingController } from './billing.controller'
import { BillingService } from './billing.service'
import { ClickService } from './click.service'
import { PaymeService } from './payme.service'

@Module({
  imports: [TenantsModule],
  controllers: [BillingController],
  providers: [BillingService, PaymeService, ClickService],
})
export class BillingModule {}
