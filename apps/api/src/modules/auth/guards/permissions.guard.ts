import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { DomainError } from '@/common/errors/domain.error'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { PERMISSION_KEY, type PermissionRule } from '../decorators/require-permission.decorator'
import type { AuthContext } from '../decorators/current-user.decorator'

/**
 * Ruxsat tekshiruvi: foydalanuvchi rolida endpoint talab qilgan
 * `bo'lim.amal` bormi (ro'yxat — `@crm/shared` katalogi).
 *
 * `@RequirePermission` bo'lmagan (va `@Public` ham emas) endpoint —
 * faqat autentifikatsiya talab qiladi. Bunday endpointlar ataylab kam
 * bo'lishi kerak; ro'yxati testda qayd etilgan.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) {
      return true
    }

    const rule = this.reflector.getAllAndOverride<PermissionRule | undefined>(
      PERMISSION_KEY,
      [ctx.getHandler(), ctx.getClass()],
    )
    if (!rule) return true

    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>()
    if (!req.auth) throw new DomainError('AUTH_INVALID_CREDENTIALS')

    if (!req.auth.permissions.has(rule.permission)) {
      throw new DomainError('PERMISSION_DENIED', `Rolingizda «${rule.permission}» ruxsati yo‘q`)
    }
    return true
  }
}
