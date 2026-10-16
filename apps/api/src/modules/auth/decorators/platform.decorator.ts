import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

export const PLATFORM_KEY = 'isPlatform'

/**
 * Platforma egasi yo'li (T-135): do'kon tokeni o'tmaydi, egasi tokeni
 * `PlatformAuthGuard` da tekshiriladi. Global guard bu yo'llarni o'sha
 * guard'ga qoldiradi; do'kon yo'llarida esa egasi tokeni rad etiladi.
 */
export const PlatformRoute = (): ClassDecorator => SetMetadata(PLATFORM_KEY, true)

/** So'rovga biriktirilgan egasi konteksti (`req.platform`) */
export interface PlatformContext {
  adminId: string
  email: string
  name: string
  jti: string
}

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformContext => {
    const req = ctx.switchToHttp().getRequest<Request & { platform?: PlatformContext }>()
    if (!req.platform) {
      throw new Error('Egasi konteksti yo‘q: guard ishlamagan')
    }
    return req.platform
  },
)
