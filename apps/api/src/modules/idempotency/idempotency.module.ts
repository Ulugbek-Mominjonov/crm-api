import { Global, Module } from '@nestjs/common'
import { IdempotencyService } from './idempotency.service'
import { IdempotencyJobs } from './idempotency.jobs'

/**
 * `IdempotencyInterceptor` bu yerda EMAS, `AppModule` da ro'yxatdan o'tadi:
 * u tenant tranzaksiyasi ICHIDA va audit interceptoridan TASHQARIDA
 * ishlashi shart (global interceptorlar tartibi).
 */
@Global()
@Module({
  providers: [IdempotencyService, IdempotencyJobs],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
