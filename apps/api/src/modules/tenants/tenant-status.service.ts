import { Injectable } from '@nestjs/common'
import { TtlCache } from '@/common/cache/ttl-cache'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { onCommit } from '@/prisma/tenant-tx'

export type TenantStatus = 'active' | 'suspended' | 'blocked' | 'deleting'

/** O'chirish so'ralgandan keyin ma'lumot shuncha saqlanadi — fikrdan qaytish mumkin (T-127) */
export const DELETION_GRACE_DAYS = 30
/** Pullik tarif muddati o'tgach shuncha kun yozish davom etadi (to'lovga ulgurish) */
export const SUSPEND_GRACE_DAYS = 3

/** Holat har yozuvchi so'rovda kerak — qisqa kesh (boshqa instansiya TTL ichida eski qiymat ko'rishi mumkin) */
const STATUS_TTL_MS = 30_000
const MAX_TENANTS = 10_000

/**
 * Do'kon holati (T-127, T-135): `active` — hamma amal; `suspended`
 * (to'lanmagan), `blocked` (egasi to'xtatgan) va `deleting` (o'chirish
 * muhlatida) — faqat o'qish. `tenants` — global jadval (RLS'siz),
 * tranzaksiyasiz o'qiladi.
 *
 * O'tishlar — shu yerda, bitta joyda: do'kon administratori ham, platforma
 * egasi ham aynan shu qoidalar bilan ishlaydi. Chaqiruvchi tenant
 * tranzaksiyasida (jurnal yozuvi bilan birga saqlanadi), kesh COMMIT'dan
 * keyin bekor qilinadi.
 */
@Injectable()
export class TenantStatusService {
  private readonly cache = new TtlCache<string, TenantStatus>(STATUS_TTL_MS, MAX_TENANTS)

  constructor(private readonly prisma: PrismaService) {}

  async status(tenantId: string): Promise<TenantStatus> {
    const cached = this.cache.get(tenantId)
    if (cached) return cached
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } })
    // O'chirilgan (tozalangan) do'kon tokeni — yozish yo'q
    const status = (tenant?.status ?? 'deleting') as TenantStatus
    this.cache.set(tenantId, status)
    return status
  }

  /** Holat o'zgargach (to'lov, o'chirish so'rovi) — shu instansiyada darhol */
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId)
  }

  /** O'chirish so'rovi: 30 kun faqat o'qish, keyin to'liq tozalanadi. Blok belgisi saqlanib qoladi */
  async scheduleDeletion(tx: TenantTx, tenantId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE tenants SET status = 'deleting', deletion_scheduled_at = now() + make_interval(days => ${DELETION_GRACE_DAYS}::int)
       WHERE id = ${tenantId}::uuid`
    onCommit(() => this.invalidate(tenantId))
  }

  /**
   * O'chirishdan qaytish — qaytadigan holat: blok qo'yilgan bo'lsa `blocked`,
   * muddati o'tgan pullik tarif bo'lsa `suspended`, aks holda `active`.
   * `false` — do'kon o'chirish muhlatida emas edi.
   */
  async cancelDeletion(tx: TenantTx, tenantId: string): Promise<boolean> {
    const updated = await tx.$executeRaw`
      UPDATE tenants
         SET status = CASE WHEN blocked_at IS NOT NULL THEN 'blocked'
                           WHEN plan <> 'free' AND plan_expires_at < now() - make_interval(days => ${SUSPEND_GRACE_DAYS}::int)
                           THEN 'suspended' ELSE 'active' END,
             deletion_scheduled_at = NULL
       WHERE id = ${tenantId}::uuid AND status = 'deleting'`
    if (updated === 0) return false
    onCommit(() => this.invalidate(tenantId))
    return true
  }

  /**
   * Egasi bloki (T-135): faqat o'qish, to'lov ochmaydi, do'kon o'zi olib
   * tashlay olmaydi. O'chirish muhlatidagi do'konda holat `deleting` qoladi
   * (o'chirish davom etadi), blok belgisi — qaytganda kuchga kiradi.
   */
  async block(tx: TenantTx, tenantId: string, reason: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE tenants
         SET blocked_at = now(), blocked_reason = ${reason},
             status = CASE WHEN status = 'deleting' THEN status ELSE 'blocked' END
       WHERE id = ${tenantId}::uuid`
    onCommit(() => this.invalidate(tenantId))
  }

  /** Blokdan chiqarish: `suspended` yoki `active` (tarif muddatiga qarab); `false` — blok yo'q edi */
  async unblock(tx: TenantTx, tenantId: string): Promise<boolean> {
    const updated = await tx.$executeRaw`
      UPDATE tenants
         SET blocked_at = NULL, blocked_reason = NULL,
             status = CASE WHEN status <> 'blocked' THEN status
                           WHEN plan <> 'free' AND plan_expires_at < now() - make_interval(days => ${SUSPEND_GRACE_DAYS}::int)
                           THEN 'suspended' ELSE 'active' END
       WHERE id = ${tenantId}::uuid AND blocked_at IS NOT NULL`
    if (updated === 0) return false
    onCommit(() => this.invalidate(tenantId))
    return true
  }
}
