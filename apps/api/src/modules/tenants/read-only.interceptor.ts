import { Injectable, SetMetadata, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { from, switchMap, type Observable } from 'rxjs'
import { DomainError } from '@/common/errors/domain.error'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { TenantStatusService } from './tenant-status.service'

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])
const ALLOW_READ_ONLY_KEY = 'allowReadOnlyTenant'

/**
 * Faqat-o'qish holatida ham ruxsat: to'lov (qayta faollashtirish), o'chirishni
 * bekor qilish, zaxira olish, parolni almashtirish.
 */
export const AllowReadOnlyTenant = (): MethodDecorator => SetMetadata(ALLOW_READ_ONLY_KEY, true)

/**
 * To'xtatilgan (`suspended`) va o'chirilayotgan (`deleting`) do'kon —
 * O'QISH mumkin, yozish yo'q (T-127): 423 `TENANT_READ_ONLY`. Tranzaksiya
 * ochilishidan OLDIN (eng tashqi interceptor) — bekorga ulanish olinmaydi.
 */
@Injectable()
export class ReadOnlyTenantInterceptor implements NestInterceptor {
  constructor(
    private readonly statuses: TenantStatusService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>()
    const tenantId = req.auth?.tenantId
    if (!tenantId || !WRITE_METHODS.has(req.method) || this.reflector.get<boolean>(ALLOW_READ_ONLY_KEY, ctx.getHandler())) {
      return next.handle()
    }
    return from(this.statuses.status(tenantId)).pipe(
      switchMap((status) => {
        if (status !== 'active') {
          throw new DomainError('TENANT_READ_ONLY', status === 'suspended'
            ? 'Tarif muddati tugagan — to‘lovdan keyin yozish ochiladi'
            : 'Do‘kon o‘chirish muhlatida — faqat o‘qish', [{ code: 'TENANT_READ_ONLY', meta: { status } }])
        }
        return next.handle()
      }),
    )
  }
}
