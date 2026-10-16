import type { SystemRole } from '@prisma/client'
import type { Permission } from '@crm/shared'
import { currentContext } from '@/common/context/request-context'
import { PermissionDeniedError } from '@/common/errors/domain.error'

/** Rol (yoki rolga yoziladigan ruxsatlar) — tekshiruv uchun kerakli qismi */
export interface RoleScope {
  key: SystemRole | null
  permissions: readonly Permission[]
}

/**
 * Huquq oshirishdan himoya (T-134): administrator bo'lmagan boshqaruvchi
 * (`users` yoki `roles` ruxsati berilgan rol) faqat O'ZIDA bor ruxsatlar
 * doirasida ishlaydi — o'zidan kengroq rolni bera, yarata, tahrirlay,
 * o'chira olmaydi va bunday rol egasining hisobiga tegolmaydi. Aks holda
 * o'ziga yoki sherigiga administrator huquqini olib berardi.
 */
export function assertWithinActor(target: RoleScope): void {
  const actor = currentContext()
  if (actor.role === 'admin') return
  const own = actor.permissions ?? new Set<Permission>()
  if (target.key !== 'admin' && target.permissions.every((p) => own.has(p))) return
  throw new PermissionDeniedError('O‘zingizda yo‘q ruxsat bilan ishlab bo‘lmaydi — administratorga murojaat qiling')
}
