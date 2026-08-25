import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import type { Request } from 'express'
import { map, type Observable } from 'rxjs'
import { hiddenFieldsFor, stripHidden } from '@/common/security/field-visibility'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'

/**
 * Javobdagi maxfiy maydonlarni rolga qarab olib tashlaydi.
 *
 * Global interceptor sifatida ishlaydi — har bir endpointda alohida
 * eslab qolish shart emas. Agregat javoblarga ham qo'llanadi.
 */
@Injectable()
export class FieldVisibilityInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>()
    const role = req.auth?.role
    if (!role) return next.handle()

    const hidden = hiddenFieldsFor(role)
    return next.handle().pipe(map((body: unknown) => stripHidden(body, hidden)))
  }
}
