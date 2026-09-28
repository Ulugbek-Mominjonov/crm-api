import { Module } from '@nestjs/common'
import { FilesModule } from '@/modules/files/files.module'
import { SettingsModule } from '@/modules/settings/settings.module'
import { ExportsController } from './exports.controller'
import { ExportsService } from './exports.service'

@Module({
  imports: [FilesModule, SettingsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
