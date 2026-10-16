import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { Access } from '@/modules/roles/access.service'

/**
 * So'rovga biriktirilgan autentifikatsiya konteksti. Kim — tokendan,
 * huquq (rol, ruxsatlar) — bazadan (`AccessService`, kesh bilan)
 */
export interface AuthContext extends Access {
  userId: string
  tenantId: string
  employeeId: string
  jti: string
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>()
    if (!req.auth) {
      throw new Error('Auth konteksti yo‘q: guard ishlamagan')
    }
    return req.auth
  },
)
