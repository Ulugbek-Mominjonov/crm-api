import { Injectable } from '@nestjs/common'
import { planLimits, type PlanLimits } from '@crm/shared'
import { DomainError } from '@/common/errors/domain.error'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'

export type CountedResource = 'users' | 'warehouses'
export type CountedUsage = Record<CountedResource, number>

/**
 * Tarif chegaralari (T-125). Joriy do'kon tarifi har so'rovda o'qiladi —
 * to'lov tasdiqlangach (T-126) darhol kuchga kiradi.
 *
 * Sanash tenant bo'yicha advisory qulfdan KEYIN (qulf COMMIT'gacha): parallel
 * ikki qo'shish oxirgi bo'sh joyni birga egallab, chegaradan oshmaydi —
 * qulfdan keyingi so'rov birinchisining yozuvini ko'radi (Q21 naqshi).
 */
@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  async current(): Promise<{ plan: string; limits: PlanLimits }> {
    const { tenantId } = requireTenantTx()
    const tenant = await this.prisma.scoped.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { plan: true } })
    return { plan: tenant.plan, limits: planLimits(tenant.plan) }
  }

  /** Yana bittasi sig'adimi — sig'masa 402 `PLAN_LIMIT_EXCEEDED` (qaysi chegara, nechta band) */
  async assertRoom(resource: CountedResource): Promise<void> {
    await this.lock(resource)
    const [{ plan, limits }, used] = await Promise.all([this.current(), this.count(resource)])
    if (used < limits[resource]) return
    throw limitError(resource, plan, limits[resource], used)
  }

  /** Ommaviy yozuvdan (migratsiya importi) OLDIN: qulflar (doim bir tartibda) va joriy sonlar */
  async lockUsage(): Promise<CountedUsage> {
    await this.lock('users')
    await this.lock('warehouses')
    const [users, warehouses] = await Promise.all([this.count('users'), this.count('warehouses')])
    return { users, warehouses }
  }

  /**
   * Ommaviy yozuvdan KEYIN: chegaradan oshib O'SGAN resurs — 402 (tranzaksiya
   * bekor). Son o'zgarmagan bo'lsa (takroriy import) — o'tadi.
   */
  async assertGrowthWithin(before: CountedUsage): Promise<void> {
    const [{ plan, limits }, users, warehouses] = await Promise.all([this.current(), this.count('users'), this.count('warehouses')])
    const after: CountedUsage = { users, warehouses }
    const exceeded = (['users', 'warehouses'] as const).find((r) => after[r] > before[r] && after[r] > limits[r])
    if (exceeded) throw limitError(exceeded, plan, limits[exceeded], after[exceeded])
  }

  /** Tarifga sanaladiganlar: faol kirish hisoblari, arxivlanmagan omborlar */
  private count(resource: CountedResource): Promise<number> {
    return resource === 'users'
      ? this.prisma.scoped.user.count({ where: { deletedAt: null, isActive: true } })
      : this.prisma.scoped.warehouse.count({ where: { archived: false } })
  }

  private async lock(resource: CountedResource): Promise<void> {
    const { tenantId } = requireTenantTx()
    await this.prisma.scoped.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`plan:${resource}:${tenantId}`}, 0))`
  }
}

function limitError(resource: CountedResource, plan: string, limit: number, used: number): DomainError {
  return new DomainError('PLAN_LIMIT_EXCEEDED', `«${plan}» tarifida ${resource} chegarasi — ${limit} ta`, [
    { field: resource, code: 'PLAN_LIMIT_EXCEEDED', meta: { resource, plan, limit, used } },
  ])
}
