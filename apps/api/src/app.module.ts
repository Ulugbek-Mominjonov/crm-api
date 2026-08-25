import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { ConfigModule } from '@/config/config.module'
import { PrismaModule } from '@/prisma/prisma.module'
import { LoggingModule } from '@/common/logging/logging.module'
import { RequestContextMiddleware } from '@/common/middleware/request-context.middleware'
import { HealthModule } from '@/modules/health/health.module'
import { AuthModule } from '@/modules/auth/auth.module'
import { AuditModule } from '@/modules/audit/audit.module'
import { TenantsModule } from '@/modules/tenants/tenant.module'

/** Ildiz modul — qolgan modullar bosqichma-bosqich shu yerga ulanadi. */
@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    PrismaModule,
    // Umumiy chegara: bir IP dan daqiqasiga 300 so'rov.
    // Kirish uchun qattiqroq chegara AuthController da (`@Throttle`).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    AuditModule,
    HealthModule,
    AuthModule,
    TenantsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*splat')
  }
}
