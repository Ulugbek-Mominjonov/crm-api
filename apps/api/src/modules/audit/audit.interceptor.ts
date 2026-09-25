import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { mergeMap, type Observable } from 'rxjs'
import { AuditService } from './audit.service'
import { AUDIT_ACTION_KEY, AUDIT_IN_SERVICE_KEY } from './audit.decorator'

/** Jurnalga tushadigan HTTP metodlari — o'qish yozilmaydi (shovqin bo'lardi) */
const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    if (this.reflector.get<boolean>(AUDIT_IN_SERVICE_KEY, ctx.getHandler())) {
      return next.handle()
    }

    const action =
      this.reflector.get<string | undefined>(AUDIT_ACTION_KEY, ctx.getHandler()) ??
      `${req.method} ${req.route?.path ?? req.path}`

    return next.handle().pipe(
      // FAQAT muvaffaqiyatli amal yoziladi: yiqilgan so'rov o'zgarish
      // qilmagan, uni jurnalga tushirish chalg'itardi.
      // KUTILADI: interceptor so'rov tranzaksiyasi ICHIDA — jurnal amal bilan
      // birga saqlanadi yoki ikkalasi ham bekor bo'ladi (03 §3.9)
      mergeMap(async (body: unknown) => {
        await this.audit.log({
          action,
          detail: req.originalUrl,
          // `client.create` → `client`; umumiy nomda (METOD /yo'l) tur yo'q
          entityType: action.includes('.') ? action.split('.')[0] : undefined,
          entityId: entityIdOf(body, req),
        })
        return body
      }),
    )
  }
}

/** Qaysi yozuv o'zgargani: javobdagi `id` yoki yo'ldagi `:id` (DELETE 204 da tana yo'q) */
function entityIdOf(body: unknown, req: Request): string | undefined {
  const fromBody =
    body !== null && typeof body === 'object' ? (body as { id?: unknown }).id : undefined
  const candidate = fromBody ?? req.params?.id
  return typeof candidate === 'string' && UUID_RE.test(candidate) ? candidate : undefined
}
