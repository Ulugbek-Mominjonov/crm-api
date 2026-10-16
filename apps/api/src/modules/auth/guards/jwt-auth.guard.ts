import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { DomainError } from '@/common/errors/domain.error'
import { enrichContext } from '@/common/context/request-context'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { PLATFORM_KEY } from '../decorators/platform.decorator'
import type { AuthContext } from '../decorators/current-user.decorator'
import { AccessService } from '@/modules/roles/access.service'
import { isPlatformToken, TokenService, type TokenPayload } from '../token.service'

/**
 * Global guard: sukut bo'yicha HAMMA yo'l yopiq.
 *
 * Bu ataylab: yangi endpoint qo'shilganda uni himoyalashni unutish
 * mumkin emas — himoyalanmagan holat aniq `@Public()` bilan e'lon qilinadi.
 * Egasi yo'llari (`@PlatformRoute()`) — `PlatformAuthGuard` da.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly access: AccessService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true
    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_KEY, targets)) return true

    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>()
    const payload = await verifyBearer(this.tokens, req)
    // Egasi tokeni do'kon yo'lida o'tmaydi — unda tenant yo'q va bo'lmasligi kerak
    if (isPlatformToken(payload)) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Token bu yo‘l uchun emas')

    // Rol — tokendan emas: faolsizlantirilgan yoki o'chirilgan hisob darhol yopiladi
    const access = await this.access.forUser(payload.tid, payload.sub)
    if (!access) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Hisob faol emas yoki o‘chirilgan')

    req.auth = {
      userId: payload.sub,
      // tenantId FAQAT tokendan — so'rovdan hech qachon olinmaydi
      tenantId: payload.tid,
      employeeId: payload.eid,
      jti: payload.jti,
      ...access,
    }
    enrichContext({ tenantId: payload.tid, userId: payload.sub, role: access.role, permissions: access.permissions })
    return true
  }
}

/** Sarlavhadagi tokenni tekshiradi; yo'q yoki yaroqsiz — 401 (sabab mijozga aytilmaydi) */
export async function verifyBearer(tokens: TokenService, req: Request): Promise<TokenPayload> {
  const token = extractBearer(req.get('authorization'))
  if (!token) throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Token yuborilmagan')
  try {
    return await tokens.verifyAccess(token)
  } catch {
    // Sabab (muddati tugagan / imzo xato) mijozga aytilmaydi
    throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Token yaroqsiz yoki muddati tugagan')
  }
}

/** `Authorization: Bearer <token>` dan tokenni ajratadi */
export function extractBearer(header?: string): string | null {
  if (!header) return null
  const [scheme, value] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !value) return null
  return value.trim() || null
}
