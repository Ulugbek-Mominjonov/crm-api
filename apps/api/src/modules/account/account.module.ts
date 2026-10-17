import { Module } from '@nestjs/common'
import { AuthModule } from '@/modules/auth/auth.module'
import { FilesModule } from '@/modules/files/files.module'
import { PlatformCoreModule } from '@/modules/platform/platform-core.module'
import { TelegramModule } from '@/modules/telegram/telegram.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { AccountController } from './account.controller'
import { AccountService } from './account.service'
import { TenantLifecycleJobs } from './tenant-lifecycle.jobs'
import { TenantRequestsController } from './tenant-requests.controller'
import { TenantRequestsService } from './tenant-requests.service'

@Module({
  // TelegramModule — o'chirish so'rovi va murojaat haqida egasiga xabar (T-137, T-140);
  // PlatformCoreModule — egasining aloqa ma'lumoti (`support`)
  imports: [AuthModule, TenantsModule, FilesModule, TelegramModule, PlatformCoreModule],
  controllers: [AccountController, TenantRequestsController],
  providers: [AccountService, TenantLifecycleJobs, TenantRequestsService],
})
export class AccountModule {}
