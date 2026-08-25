import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common'
import { ConfigModule } from '@/config/config.module'
import { PrismaModule } from '@/prisma/prisma.module'
import { LoggingModule } from '@/common/logging/logging.module'
import { HealthModule } from '@/modules/health/health.module'
import { AuthModule } from '@/modules/auth/auth.module'
import { TenantsModule } from '@/modules/tenants/tenants.module'
import { RequestContextMiddleware } from '@/common/middleware/request-context.middleware'

/** Ildiz modul — qolgan modullar bosqichma-bosqich shu yerga ulanadi. */
@Module({ imports: [ConfigModule, LoggingModule, PrismaModule, HealthModule, AuthModule, TenantsModule] })
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*splat')
  }
}
