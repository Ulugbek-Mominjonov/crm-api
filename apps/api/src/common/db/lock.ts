import type { Prisma, ProductUnit } from '@prisma/client'
import type { TenantTx } from '@/prisma/prisma.service'
import { currentTenantTx } from '@/prisma/tenant-tx'

/** Qulflangan mahsulot: ombor/sotuv amali uchun kerakli maydonlar */
export interface LockedProduct {
  id: string
  name: string
  unit: ProductUnit
  price: bigint
  wholesalePrice: bigint
  cost: bigint
  /** JAMI qoldiq (I1) — qulf ostida o'zgarmaydi */
  stock: Prisma.Decimal
  archived: boolean
  altUnit: ProductUnit | null
  altFactor: Prisma.Decimal | null
}

/**
 * Mahsulot qatorlarini `SELECT … FOR UPDATE` bilan qulflaydi (01 §1.7).
 *
 * Barcha qoldiq o'zgartiruvchilar (kirim, chiqim, sotuv, ko'chirish) AVVAL
 * shu qulfni oladi: ikki kassir oxirgi 5 qopni bir vaqtda sota olmaydi —
 * ikkinchisi birinchisi tugashini kutadi va yangi qoldiqni ko'radi.
 *
 * - DOIM `id` o'sish tartibida — ikki tranzaksiya bir-birini kutib qolmaydi
 *   (deadlock yo'q), kiruvchi ro'yxat tartibidan qat'i nazar
 * - FAQAT tenant tranzaksiyasi ichida: qulf COMMIT/ROLLBACK da bo'shaydi,
 *   tranzaksiyasiz esa u darhol bo'shab, hech narsani himoya qilmasdi
 * - o'chirilgan tovar qaytmaydi (chaqiruvchi "topilmadi" deb hisoblaydi)
 *
 * Kengaytma xom SQL ga tenant qo'shmaydi — shart shu yerda aniq (03 §3.7).
 */
export async function lockProducts(
  tx: TenantTx,
  ids: readonly string[],
): Promise<Map<string, LockedProduct>> {
  const state = currentTenantTx()
  if (!state || state.tx !== tx) {
    throw new Error('Qulf faqat joriy tenant tranzaksiyasi ichida olinadi')
  }
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()

  const rows = await tx.$queryRaw<LockedProduct[]>`
    SELECT id, name, unit, price, wholesale_price AS "wholesalePrice", cost, stock, archived,
           alt_unit AS "altUnit", alt_factor AS "altFactor"
      FROM products
     WHERE tenant_id = ${state.tenantId}::uuid
       AND id = ANY(${unique}::uuid[])
       AND deleted_at IS NULL
     ORDER BY id
       FOR UPDATE`
  return new Map(rows.map((row) => [row.id, row]))
}
