import { SetMetadata } from '@nestjs/common'
import type { Action, Resource } from '@crm/shared'

export const PERMISSION_KEY = 'permission'

export interface PermissionRule {
  resource: Resource
  action: Action
}

/**
 * Endpoint uchun kerakli huquq.
 *
 * Matritsa `@crm/shared` da — mijoz va server AYNI manbadan o'qiydi,
 * shuning uchun UI da ko'rinadigan tugma va serverdagi ruxsat hech qachon
 * ajralib qolmaydi.
 */
export const RequirePermission = (
  resource: Resource,
  action: Action,
): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSION_KEY, { resource, action } satisfies PermissionRule)
