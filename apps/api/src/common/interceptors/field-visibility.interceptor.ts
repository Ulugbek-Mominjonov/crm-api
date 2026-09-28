import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import type { Request } from 'express'
import { from, map, switchMap, type Observable } from 'rxjs'
import { hiddenFieldsFor, stripHidden, visibilityPolicy } from '@/common/security/field-visibility'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { SettingsService } from '@/modules/settings/settings.service'

/**
 * Javobdagi maxfiy maydonlarni rolga qarab olib tashlaydi.
 *
 * Global interceptor (`AppModule`, eng tashqi) — har bir endpointda alohida
 * eslab qolish shart emas. Agregat javoblarga ham qo'llanadi.
 */
@Injectable()
export class FieldVisibilityInterceptor implements NestInterceptor {
  constructor(private readonly settings: SettingsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>()
    const auth = req.auth
    if (!auth) return next.handle()

    return from(this.hiddenFor(auth)).pipe(
      switchMap((hidden) => next.handle().pipe(map((body: unknown) => stripHidden(body, hidden)))),
    )
  }

  /**
   * Ulgurji narx yashirin rolda (sotuvchi) u do'kon sozlamasiga qarab
   * ochiladi — faqat shunda sozlama o'qiladi (kesh — sozlamalar servisida).
   */
  private async hiddenFor(auth: AuthContext): Promise<Set<string>> {
    const hidden = hiddenFieldsFor(auth.role)
    if (!hidden.has('wholesalePrice')) return hidden
    return hiddenFieldsFor(auth.role, visibilityPolicy(await this.settings.forTenant(auth.tenantId)))
  }
}
