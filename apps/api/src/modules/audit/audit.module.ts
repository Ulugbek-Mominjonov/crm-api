import { Global, Module } from '@nestjs/common'
import { AuditController } from './audit.controller'
import { AuditLogService } from './audit-log.service'
import { AuditService } from './audit.service'

/**
 * `AuditInterceptor` bu yerda EMAS, `AppModule` da ro'yxatdan o'tadi:
 * u tenant tranzaksiyasi interceptori ICHIDA ishlashi shart, global
 * interceptorlar tartibi esa ro'yxatdan o'tish tartibiga bog'liq.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditLogService],
  exports: [AuditService],
})
export class AuditModule {}
