import { Module } from '@nestjs/common'
import { SettingsModule } from '@/modules/settings/settings.module'
import { FilesController } from './files.controller'
import { FileGcJobs } from './files.jobs'
import { FilesService } from './files.service'
import { ImageVariantsWorker } from './image-variants.worker'
import { S3Service } from './s3.service'

@Module({
  // Logotip o'chirilsa sozlamadan uziladi (kesh ham)
  imports: [SettingsModule],
  controllers: [FilesController],
  providers: [S3Service, FilesService, ImageVariantsWorker, FileGcJobs],
  exports: [S3Service, FilesService],
})
export class FilesModule {}
