import { Module } from '@nestjs/common'
import { ConfigModule } from '@/config/config.module'
import { PrismaModule } from '@/prisma/prisma.module'

/** Ildiz modul — qolgan modullar bosqichma-bosqich shu yerga ulanadi. */
@Module({ imports: [ConfigModule, PrismaModule] })
export class AppModule {}
