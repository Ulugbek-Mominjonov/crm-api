import { Module } from '@nestjs/common'
import { DocNumberService } from './doc-number.service'

@Module({
  providers: [DocNumberService],
  exports: [DocNumberService],
})
export class DocNumbersModule {}
