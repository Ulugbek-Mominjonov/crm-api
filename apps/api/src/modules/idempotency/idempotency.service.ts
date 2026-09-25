import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { currentTenantId } from '@/common/context/request-context'
import { DomainError } from '@/common/errors/domain.error'
import { PrismaService } from '@/prisma/prisma.service'

/** Kalit shuncha vaqt saqlanadi (04 §4.3) */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

/** Bajarilmoqda: javob hali yozilmagan (faqat shu tranzaksiya ichida ko'rinadi) */
const IN_PROGRESS = 0

export type Claim =
  | { replay: false }
  | { replay: true; status: number; response: unknown }

/**
 * Idempotentlik kalitlari.
 *
 * Kalit amal bilan BITTA tranzaksiyada saqlanadi: amal yiqilsa kalit ham
 * bekor — mijoz xuddi shu kalit bilan qayta urina oladi.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Kalitni band qiladi yoki saqlangan javobni qaytaradi.
   *
   * INSERT BIRINCHI: parallel ikkinchi so'rov noyob indeksda KUTADI va
   * birinchisi tugagach uning javobini oladi — amal ikki marta bajarilmaydi.
   * (Avval o'qib, keyin yozish poyga holatida ikkalasini ham o'tkazardi.)
   */
  async claim(key: string, endpoint: string, body: unknown): Promise<Claim> {
    const tenantId = currentTenantId()
    const db = this.prisma.scoped
    const bodyHash = hashBody(body)

    const inserted = await db.$queryRaw<{ key: string }[]>`
      INSERT INTO idempotency_keys (tenant_id, key, endpoint, body_hash, status, response)
      VALUES (${tenantId}::uuid, ${key}, ${endpoint}, ${bodyHash}, ${IN_PROGRESS}, 'null'::jsonb)
      ON CONFLICT (tenant_id, key) DO NOTHING
      RETURNING key`
    if (inserted.length > 0) return { replay: false }

    const existing = await db.idempotencyKey.findUniqueOrThrow({
      where: { tenantId_key: { tenantId, key } },
    })
    // Muddati o'tgan kalit (tozalash ishi hali yetib kelmagan) — yangi amal
    if (Date.now() - existing.createdAt.getTime() > IDEMPOTENCY_TTL_MS) {
      await db.idempotencyKey.update({
        where: { tenantId_key: { tenantId, key } },
        data: { endpoint, bodyHash, status: IN_PROGRESS, response: Prisma.JsonNull, createdAt: new Date() },
      })
      return { replay: false }
    }
    if (existing.endpoint !== endpoint || existing.bodyHash !== bodyHash) {
      throw new DomainError(
        'IDEMPOTENCY_MISMATCH',
        'Bu kalit boshqa so‘rov uchun ishlatilgan — yangi amal uchun yangi kalit yarating',
      )
    }
    return { replay: true, status: existing.status, response: existing.response }
  }

  /** Amal muvaffaqiyatli — javob saqlanadi (o'sha tranzaksiyada) */
  async complete(key: string, status: number, response: unknown): Promise<void> {
    const tenantId = currentTenantId()
    await this.prisma.scoped.idempotencyKey.update({
      where: { tenantId_key: { tenantId, key } },
      data: {
        status,
        response: response === undefined ? Prisma.JsonNull : (response as Prisma.InputJsonValue),
      },
    })
  }
}

/**
 * Tana xeshi — kalitlar tartibidan qat'i nazar: `{a,b}` va `{b,a}` bir xil
 * so'rov. Aks holda mijoz kutubxonasi maydonlarni boshqa tartibda
 * yuborsa, qayta urinish 409 olardi.
 */
function hashBody(body: unknown): string {
  return createHash('sha256').update(stableStringify(body ?? null)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
