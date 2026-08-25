import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { Role } from '@prisma/client'

/** So'rovga biriktirilgan autentifikatsiya konteksti */
export interface AuthContext {
  userId: string
  tenantId: string
  role: Role
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
