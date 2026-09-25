import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { withCtes } from '@/common/db/sql'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'

/** Hujjat raqamlari prefikslari — har tenantda alohida hisoblagich (I12) */
export const DOC_PREFIXES = ['CHEK', 'QAYT', 'TKLF', 'BUY'] as const
export type DocPrefix = (typeof DOC_PREFIXES)[number]

/** Hisoblagich 1000 dan boshlanadi: birinchi hujjat — `CHEK-1001` */
const FIRST_NUMBER = 1001

/**
 * Hujjat raqamlari (I12): ketma-ket, bo'shliqsiz, tenant ichida noyob.
 *
 * `doc_counters` qatori oshirilganda qulflanadi va tranzaksiya oxirigacha
 * ushlanadi — parallel ikkinchi hujjat birinchisi tugashini kutadi. ROLLBACK
 * oshirishni ham bekor qiladi, raqamda bo'shliq qolmaydi (`SEQUENCE` aynan
 * shu sababli ishlatilmaydi, 01 §1.7).
 *
 * Hisoblagich — tenantdagi barcha shu turdagi hujjatlar uchun BITTA qator:
 * u qancha kech olinsa, parallellik shuncha kam cheklanadi. Shuning uchun
 * hujjat yozuvchi so'rovning ichida (`cte`) ishlatiladi.
 */
@Injectable()
export class DocNumberService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `<name> AS (… RETURNING number)` — hujjatni yozuvchi so'rovning bir
   * qismi. Hisoblagich qatori bo'lmasa (eski tenant) — yaratiladi.
   */
  cte(prefix: DocPrefix, name = 'doc'): Prisma.Sql {
    const { tenantId } = requireTenantTx()
    return Prisma.sql`${Prisma.raw(name)} AS (
      INSERT INTO doc_counters (tenant_id, prefix, last_no)
      VALUES (${tenantId}::uuid, ${prefix}, ${FIRST_NUMBER})
      ON CONFLICT (tenant_id, prefix) DO UPDATE SET last_no = doc_counters.last_no + 1
      RETURNING prefix || '-' || last_no AS number)`
  }

  /** Keyingi raqam alohida so'rov bilan — yozuvi murakkab bo'lmagan hujjatlar uchun */
  async next(prefix: DocPrefix): Promise<string> {
    const [row] = await this.prisma.scoped.$queryRaw<{ number: string }[]>(
      withCtes([this.cte(prefix)], Prisma.sql`SELECT number FROM doc`),
    )
    return row!.number
  }
}
