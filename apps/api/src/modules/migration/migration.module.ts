import { Module } from '@nestjs/common'
import { AuthModule } from '@/modules/auth/auth.module'
import { FilesModule } from '@/modules/files/files.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'
import { MigrationController } from './migration.controller'
import { MigrationService } from './migration.service'

@Module({
  imports: [AuthModule, FilesModule, TenantsModule],
  controllers: [MigrationController],
  providers: [MigrationService],
})
export class MigrationModule {}
