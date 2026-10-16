import type { Prisma, SystemRole } from '@prisma/client'
import { SYSTEM_ROLES } from '@crm/shared'

export const SYSTEM_ROLE_KEYS = Object.keys(SYSTEM_ROLES) as SystemRole[]

/** Yangi do'konning tizim rollari (sukut ruxsatlar bilan) — bitta `createMany` uchun */
export function systemRoleRows(tenantId: string): Prisma.RoleCreateManyInput[] {
  return SYSTEM_ROLE_KEYS.map((key) => ({
    tenantId,
    key,
    name: SYSTEM_ROLES[key].name,
    permissions: [...SYSTEM_ROLES[key].permissions],
  }))
}
