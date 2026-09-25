import { Module } from '@nestjs/common'
import { FilesModule } from '@/modules/files/files.module'
import { BackupController } from './backup.controller'
import { BackupService } from './backup.service'

@Module({
  imports: [FilesModule],
  controllers: [BackupController],
  providers: [BackupService],
})
export class BackupModule {}
