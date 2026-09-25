import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { DomainError } from '@/common/errors/domain.error'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'

/** Qulf ostidagi kassa holati (`tenant_state`) */
export interface RegisterState {
  activeShiftId: string | null
  activeWarehouseId: string | null
  cashBalance: bigint
}

/**
 * Kassa registri — naqd pul, smena va mijoz balanslari (bonus, nasiya)
 * o'zgaradigan amallarning TENANT bo'yicha navbati.
 *
 * Sotuv, qaytarish, bekor qilish, naqd to'lovlar, smena ochish/yopish AVVAL
 * `tenant_state` qatorini `FOR UPDATE` bilan qulflaydi. Natija:
 *  - smena sotuv bilan bir vaqtda yopilmaydi — yopilgan smenaga pul
 *    tushmaydi (I8, I9), kutilgan balans aniq chiqadi (I10);
 *  - bir mijozning parallel ikki nasiyasi limitni birgalikda oshirmaydi
 *    (I16), bonusi ikki marta sarflanmaydi (I17): qarz va ball qulfdan
 *    KEYINGI so'rovda o'qiladi (READ COMMITTED — yangi surat).
 *
 * Qulf tartibi (deadlock yo'q): registr → hujjat qatori (chek, taklif) →
 * mahsulotlar (id tartibida) → hisoblagich. Registrni oladigan amal uni
 * doim BIRINCHI oladi; qolgan qulflarni uni olmaydiganlar ham shu
 * tartibda oladi.
 *
 * Narxi: bir do'konning kassa amallari ketma-ket bajariladi (har biri
 * o'nlab millisekund) — bir necha kassali do'kon uchun yetarli.
 */
@Injectable()
export class CashRegisterService {
  constructor(private readonly prisma: PrismaService) {}

  async lock(): Promise<RegisterState> {
    const { tenantId } = requireTenantTx()
    const [row] = await this.prisma.scoped.$queryRaw<RegisterState[]>`
      SELECT active_shift_id AS "activeShiftId", active_warehouse_id AS "activeWarehouseId",
             cash_balance AS "cashBalance"
        FROM tenant_state
       WHERE tenant_id = ${tenantId}::uuid
         FOR UPDATE`
    // Provisioning holatni tenant bilan birga yaratadi — yo'qligi buzilish
    if (!row) throw new Error(`tenant_state yo‘q (tenant ${tenantId})`)
    return row
  }

  /** I8: naqd amal ochiq smenani talab qiladi */
  requireOpenShift(state: RegisterState): string {
    if (!state.activeShiftId) {
      throw new DomainError('SHIFT_REQUIRED', 'Kassa smenasi ochilmagan — avval smenani oching')
    }
    return state.activeShiftId
  }

  /**
   * Naqd harakati — hujjat yozuvchi so'rov ichidagi CTE'lar: smenaning
   * kirim/chiqimi va kassa balansi. `delta` > 0 — kirim, < 0 — chiqim.
   * Smena registr qulfi ostida ochiq ekani tekshirilgan (`requireOpenShift`).
   */
  cashCtes(shiftId: string, delta: bigint): Prisma.Sql[] {
    if (delta === 0n) return []
    const { tenantId } = requireTenantTx()
    const cashIn = delta > 0n ? delta : 0n
    const cashOut = delta < 0n ? -delta : 0n
    return [
      Prisma.sql`cash_shift AS (
        UPDATE cash_shifts SET cash_in = cash_in + ${cashIn}, cash_out = cash_out + ${cashOut}
         WHERE tenant_id = ${tenantId}::uuid AND id = ${shiftId}::uuid
        RETURNING 1)`,
      Prisma.sql`cash_state AS (
        UPDATE tenant_state SET cash_balance = cash_balance + ${delta}
         WHERE tenant_id = ${tenantId}::uuid
        RETURNING 1)`,
    ]
  }
}
