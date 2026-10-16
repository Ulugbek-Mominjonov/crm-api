import { SetMetadata } from '@nestjs/common'
import type { ActionOf, Permission, Resource } from '@crm/shared'

export const PERMISSION_KEY = 'permission'

export interface PermissionRule {
  permission: Permission
}

/**
 * Endpoint uchun kerakli ruxsat (`products.edit`).
 *
 * Katalog `@crm/shared` da — mijoz va server AYNI kalitlar bilan ishlaydi,
 * shuning uchun UI da ko'rinadigan tugma va serverdagi ruxsat hech qachon
 * ajralib qolmaydi. Amal bo'limga mos bo'lmasa — kompilyatsiya xatosi.
 */
export const RequirePermission = <R extends Resource>(
  resource: R,
  action: ActionOf<R>,
): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, { permission: `${resource}.${action}` as Permission } satisfies PermissionRule)
