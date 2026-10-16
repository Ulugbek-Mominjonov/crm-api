import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { enrichContext } from '@/common/context/request-context'
import { DomainError, PermissionDeniedError } from '@/common/errors/domain.error'
import { PLATFORM_ROLES_KEY, type PlatformContext, type PlatformRole } from '@/modules/auth/decorators/platform.decorator'
import { IS_PUBLIC_KEY } from '@/modules/auth/decorators/public.decorator'
import { verifyBearer } from '@/modules/auth/guards/jwt-auth.guard'
import { isPlatformToken, TokenService } from '@/modules/auth/token.service'
import { PlatformAuthService } from './platform-auth.service'

/**
 * Egasi yo'llari guard'i (T-135): faqat `kind: platform` tokeni; do'kon
 * tokeni — 401. Hisob har so'rovda bazadan tekshiriladi — faolsizlantirilgan
 * egasi token muddatini kutmaydi. Rol (T-139): `@PlatformRoles(...)` belgilangan
 * yo'lda boshqa rol — 403. Tenant konteksti YO'Q: so'rov tranzaksiyasi
 * ochilmaydi, do'kon ichidagi amal servisda aniq `withTenant` bilan.
 */
@Injectable()
export class PlatformAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly auth: PlatformAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.get<boolean>(IS_PUBLIC_KEY, ctx.getHandler())) return true

    const req = ctx.switchToHttp().getRequest<Request & { platform?: PlatformContext }>()
    const payload = await verifyBearer(this.tokens, req)
    if (!isPlatformToken(payload)) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Token bu yo‘l uchun emas')

    const admin = await this.auth.forAdmin(payload.sub)
    if (!admin) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Hisob faol emas')

    const allowed = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(PLATFORM_ROLES_KEY, [ctx.getHandler(), ctx.getClass()])
    if (allowed && !allowed.includes(admin.role)) throw new PermissionDeniedError('Bu amal faqat egasi uchun')

    req.platform = { adminId: admin.id, email: admin.email, name: admin.name, role: admin.role, jti: payload.jti }
    enrichContext({ platformAdminId: admin.id })
    return true
  }
}
