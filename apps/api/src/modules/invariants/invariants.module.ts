import { Module } from '@nestjs/common'
import { InvariantsService } from './invariants.service'

@Module({
  providers: [InvariantsService],
  exports: [InvariantsService],
})
export class InvariantsModule {}
