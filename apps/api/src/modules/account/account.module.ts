import { Module } from '@nestjs/common'
import { AuthModule } from '@/modules/auth/auth.module'
import { FilesModule } from '@/modules/files/files.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { AccountController } from './account.controller'
import { AccountService } from './account.service'
import { TenantLifecycleJobs } from './tenant-lifecycle.jobs'

@Module({
  imports: [AuthModule, TenantsModule, FilesModule],
  controllers: [AccountController],
  providers: [AccountService, TenantLifecycleJobs],
})
export class AccountModule {}
