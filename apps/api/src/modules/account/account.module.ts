import { Module } from '@nestjs/common'
import { AuthModule } from '@/modules/auth/auth.module'
import { FilesModule } from '@/modules/files/files.module'
import { TelegramModule } from '@/modules/telegram/telegram.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { AccountController } from './account.controller'
import { AccountService } from './account.service'
import { TenantLifecycleJobs } from './tenant-lifecycle.jobs'

@Module({
  // TelegramModule — o'chirish so'rovi haqida egasiga xabar (T-137)
  imports: [AuthModule, TenantsModule, FilesModule, TelegramModule],
  controllers: [AccountController],
  providers: [AccountService, TenantLifecycleJobs],
})
export class AccountModule {}
