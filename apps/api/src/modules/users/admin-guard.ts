import { DomainError } from '@/common/errors/domain.error'
import type { TenantTx } from '@/prisma/prisma.service'

/**
 * Do'konda tizimga kira oladigan administrator qolishini kafolatlaydi
 * (LAST_ADMIN). Oxirgi admin yo'qolsa foydalanuvchilarni boshqarib
 * bo'lmaydi — do'kon o'z tizimidan "qulflanib" qoladi.
 *
 * Adminlar sonini kamaytiradigan har bir amal (o'chirish, rolni
 * pasaytirish, faolsizlantirish, xodimni bo'shatish) shu funksiyani
 * tranzaksiya ichida chaqiradi.
 *
 * NEGA advisory qulf: parallel ikki so'rov turli jadvallarni (`users` va
 * `employees`) o'zgartirishi mumkin. Qatorlarni `FOR UPDATE` bilan
 * qulflash READ COMMITTED'da buni ushlamaydi — ikkinchi so'rov birinchisi
 * o'zgartirgan xodim holatini eski suratda ko'radi. Tenant bo'yicha qulf
 * amallarni ketma-ket qiladi; qulfdan KEYIN bajarilgan so'rov esa eng
 * so'nggi holatni ko'radi.
 */
export async function assertAdminRemains(
  tx: TenantTx,
  tenantId: string,
  leavingUserId: string,
): Promise<void> {
  const lockKey = `admins:${tenantId}`
  // `$executeRaw`: funksiya `void` qaytaradi, uni o'qish shart emas
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`

  const admins = await tx.$queryRaw<{ id: string }[]>`
    SELECT u.id
      FROM users u
      JOIN employees e ON e.id = u.employee_id
     WHERE u.tenant_id = ${tenantId}::uuid
       AND u.role = 'admin' AND u.is_active AND u.deleted_at IS NULL
       AND e.status <> 'fired' AND e.deleted_at IS NULL`

  const isActiveAdmin = admins.some((a) => a.id === leavingUserId)
  if (isActiveAdmin && admins.length <= 1) {
    throw new DomainError('LAST_ADMIN', 'Do‘konda boshqa faol administrator yo‘q')
  }
}
