import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

export const PLATFORM_KEY = 'isPlatform'
export const PLATFORM_ROLES_KEY = 'platformRoles'

/** Egasi hisobining roli (T-139): `owner` — hammasi; `operator` — do'konlar bilan ishlaydi */
export const PLATFORM_ROLES = ['owner', 'operator'] as const
export type PlatformRole = (typeof PLATFORM_ROLES)[number]

/**
 * Platforma egasi yo'li (T-135): do'kon tokeni o'tmaydi, egasi tokeni
 * `PlatformAuthGuard` da tekshiriladi. Global guard bu yo'llarni o'sha
 * guard'ga qoldiradi; do'kon yo'llarida esa egasi tokeni rad etiladi.
 */
export const PlatformRoute = (): ClassDecorator => SetMetadata(PLATFORM_KEY, true)

/**
 * Yo'l faqat shu rollarga (T-139): boshqa rol — 403 `PERMISSION_DENIED`.
 * Belgilanmagan yo'l — har qanday faol egasi hisobi.
 */
export const PlatformRoles = (...roles: PlatformRole[]): MethodDecorator & ClassDecorator => SetMetadata(PLATFORM_ROLES_KEY, roles)

/** So'rovga biriktirilgan egasi konteksti (`req.platform`) */
export interface PlatformContext {
  adminId: string
  email: string
  name: string
  role: PlatformRole
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
