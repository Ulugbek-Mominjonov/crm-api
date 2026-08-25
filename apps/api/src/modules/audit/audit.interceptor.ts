import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { tap, type Observable } from 'rxjs'
import { AuditService } from './audit.service'
import { AUDIT_ACTION_KEY } from './audit.decorator'

/** Jurnalga tushadigan HTTP metodlari — o'qish yozilmaydi (shovqin bo'lardi) */
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/**
 * Yozuvchi amallarni avtomatik jurnalga tushiradi.
 *
 * Amal nomi `@AuditAction('sale.create')` bilan beriladi; berilmasa
 * `METOD /yo'l` ko'rinishida yoziladi.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>()
    if (!WRITE_METHODS.has(req.method)) return next.handle()

    const action =
      this.reflector.get<string | undefined>(AUDIT_ACTION_KEY, ctx.getHandler()) ??
      `${req.method} ${req.route?.path ?? req.path}`

    return next.handle().pipe(
      // FAQAT muvaffaqiyatli amal yoziladi: yiqilgan so'rov o'zgarish
      // qilmagan, uni jurnalga tushirish chalg'itardi
      tap(() => {
        void this.audit.log({ action, detail: req.originalUrl })
      }),
    )
  }
}
