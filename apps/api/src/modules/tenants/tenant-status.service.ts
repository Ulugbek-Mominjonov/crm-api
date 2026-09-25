import { Injectable } from '@nestjs/common'
import { TtlCache } from '@/common/cache/ttl-cache'
import { PrismaService } from '@/prisma/prisma.service'

export type TenantStatus = 'active' | 'suspended' | 'deleting'

/** Holat har yozuvchi so'rovda kerak — qisqa kesh (boshqa instansiya TTL ichida eski qiymat ko'rishi mumkin) */
const STATUS_TTL_MS = 30_000
const MAX_TENANTS = 10_000

/**
 * Do'kon holati (T-127): `active` — hamma amal; `suspended` (to'lanmagan)
 * va `deleting` (o'chirish muhlatida) — faqat o'qish. `tenants` — global
 * jadval (RLS'siz), tranzaksiyasiz o'qiladi.
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
}
