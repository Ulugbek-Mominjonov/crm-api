import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { DomainError } from '@/common/errors/domain.error'
import { enrichContext } from '@/common/context/request-context'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import type { AuthContext } from '../decorators/current-user.decorator'
import { TokenService } from '../token.service'

/**
 * Global guard: sukut bo'yicha HAMMA yo'l yopiq.
 *
 * Bu ataylab: yangi endpoint qo'shilganda uni himoyalashni unutish
 * mumkin emas — himoyalanmagan holat aniq `@Public()` bilan e'lon qilinadi.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (isPublic) return true

    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>()
    const token = extractBearer(req.get('authorization'))
    if (!token) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Token yuborilmagan')

    let payload
    try {
      payload = await this.tokens.verifyAccess(token)
    } catch {
      // Sabab (muddati tugagan / imzo xato) mijozga aytilmaydi
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Token yaroqsiz yoki muddati tugagan')
    }

    req.auth = {
      userId: payload.sub,
      // tenantId FAQAT tokendan — so'rovdan hech qachon olinmaydi
      tenantId: payload.tid,
      role: payload.role,
      employeeId: payload.eid,
      jti: payload.jti,
    }
    enrichContext({ tenantId: payload.tid, userId: payload.sub, role: payload.role })
    return true
  }
}

/** `Authorization: Bearer <token>` dan tokenni ajratadi */
export function extractBearer(header?: string): string | null {
  if (!header) return null
  const [scheme, value] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null
  return value.trim() || null
}
