import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

/** Global — har bir modulda alohida import qilinmasin. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
