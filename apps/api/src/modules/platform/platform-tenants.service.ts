import { Injectable } from '@nestjs/common'
import type { Prisma, SystemRole } from '@prisma/client'
import { PAID_PLANS, planLimits, TRIAL_DAYS, TRIAL_PLAN } from '@crm/shared'
import { withTenant } from '@/common/context/request-context'
import { pageArgs, toPaged, type Paged } from '@/common/crud/paging'
import { orderByOf } from '@/common/crud/sort'
import { uuidArray } from '@/common/db/sql'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { AuditService } from '@/modules/audit/audit.service'
import { PasswordService } from '@/modules/auth/password.service'
import { RefreshTokenService } from '@/modules/auth/refresh-token.service'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { TenantProvisioningService } from '@/modules/tenants/tenant-provisioning.service'
import { TenantStatusService } from '@/modules/tenants/tenant-status.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import type { GrantPlanDto } from './dto/platform-billing.dto'
import {
  TENANT_SORT, type BlockTenantDto, type CreateTenantDto, type PlatformTenantDto, type PlatformTenantsQueryDto,
  type PlatformTenantUserDto, type UpdateTenantDto,
} from './dto/platform-tenant.dto'
import { PlatformAuditService } from './platform-audit.service'
import { PlatformBillingService } from './platform-billing.service'

const TENANT_SELECT = {
  id: true, name: true, plan: true, status: true, planExpiresAt: true, trialEndsAt: true, deletionScheduledAt: true,
  blockedAt: true, blockedReason: true, notes: true, createdAt: true,
} satisfies Prisma.TenantSelect

type TenantRow = Prisma.TenantGetPayload<{ select: typeof TENANT_SELECT }>

/** `platform_tenant_usage()` qatori — RLS ostidagi jadvallardan jamlanma */
interface UsageRow {
  tenantId: string
  users: number
  warehouses: number
  storageBytes: bigint
  adminName: string | null
  adminEmail: string | null
  adminPhone: string | null
  lastSaleAt: Date | null
  sales30d: number
  openRequests: number
}

interface TenantUserRow {
  id: string
  name: string
  email: string
  roleKey: SystemRole | null
  roleName: string
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
}

const DAY_MS = 86_400_000
const DEFAULT_SORT = '-createdAt'

/**
 * Egasi paneli — do'konlar (T-135). Ro'yxat va karta `tenants` global
 * jadvalidan; do'kon ichidagi ko'rsatkichlar (hisoblar, hajm, faollik) —
 * bitta SECURITY DEFINER so'rov sahifadagi barcha do'konlar uchun.
 *
 * Do'kon ichidagi AMAL (blok, tarif, parol) — o'sha do'konning tenant
 * tranzaksiyasida va kontekstida (`withTenant`): holat o'tishi, do'kon
 * jurnali («Platforma»), egasi jurnali va realtime hodisa birga saqlanadi
 * yoki birga bekor bo'ladi.
 */
@Injectable()
export class PlatformTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: TenantProvisioningService,
    private readonly passwords: PasswordService,
    private readonly refresh: RefreshTokenService,
    private readonly statuses: TenantStatusService,
    private readonly audit: AuditService,
    private readonly platformAudit: PlatformAuditService,
    private readonly billing: PlatformBillingService,
    private readonly events: DomainEvents,
  ) {}

  async list(query: PlatformTenantsQueryDto): Promise<Paged<PlatformTenantDto>> {
    const where = listWhere(query)
    const [rows, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        select: TENANT_SELECT,
        orderBy: orderByOf<Prisma.TenantOrderByWithRelationInput>(query.sort, TENANT_SORT, DEFAULT_SORT),
        ...pageArgs(query),
      }),
      this.prisma.tenant.count({ where }),
    ])
    const usage = await this.usage(rows.map((r) => r.id))
    return toPaged(rows.map((r) => toDto(r, usage.get(r.id))), total, query)
  }

  async get(id: string): Promise<PlatformTenantDto> {
    const row = await this.require(id)
    const usage = await this.usage([id])
    return toDto(row, usage.get(id))
  }

  /**
   * Ro'yxatdan o'tish bilan bir xil yaratish: tarif berilmasa — sinov muddati (T-148), `free` — bepul,
   * pullik boshlang'ich tarif — bonus hisob-faktura
   */
  async create(dto: CreateTenantDto, adminId: string): Promise<PlatformTenantDto> {
    const passwordHash = await this.passwords.hash(dto.password)
    const { tenantId } = await this.provisioning.provision({
      tenantName: dto.storeName,
      trial: dto.plan === undefined,
      owner: { name: dto.ownerName, phone: dto.phone, email: dto.email, passwordHash },
    })
    if (dto.notes) await this.prisma.tenant.update({ where: { id: tenantId }, data: { notes: dto.notes } })
    const paid = !!dto.plan && PAID_PLANS.includes(dto.plan as (typeof PAID_PLANS)[number])
    await this.inTenant(tenantId, async (tx) => {
      if (paid) {
        const grant: GrantPlanDto = { plan: dto.plan!, months: dto.months!, provider: 'bonus', note: 'Do‘kon ochilganda berildi' }
        await this.billing.grant(tx, tenantId, grant, adminId)
      }
      await this.platformAudit.log({
        action: 'tenant.create', targetTenantId: tenantId, entityType: 'tenant', entityId: tenantId,
        diff: {
          name: dto.storeName, email: dto.email, plan: dto.plan ?? TRIAL_PLAN, months: paid ? dto.months! : null,
          trialDays: dto.plan === undefined ? TRIAL_DAYS : null,
        },
      }, tx)
    })
    return this.get(tenantId)
  }

  async update(id: string, dto: UpdateTenantDto): Promise<PlatformTenantDto> {
    const before = await this.require(id)
    const data: Prisma.TenantUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.notes !== undefined && { notes: dto.notes || null }),
    }
    await this.prisma.tenant.update({ where: { id }, data })
    await this.platformAudit.log({
      action: 'tenant.update', targetTenantId: id, entityType: 'tenant', entityId: id,
      diff: { before: { name: before.name, notes: before.notes }, after: { name: dto.name ?? before.name, notes: dto.notes === undefined ? before.notes : dto.notes || null } },
    })
    return this.get(id)
  }

  async block(id: string, dto: BlockTenantDto): Promise<PlatformTenantDto> {
    await this.require(id)
    await this.inTenant(id, async (tx) => {
      await this.statuses.block(tx, id, dto.reason)
      await this.audit.log({ action: 'tenant.blocked', entityType: 'tenant', entityId: id, detail: `Platforma: ${dto.reason}` }, tx)
      await this.platformAudit.log({ action: 'tenant.block', targetTenantId: id, entityType: 'tenant', entityId: id, diff: { reason: dto.reason } }, tx)
      await this.publishStatus(tx, id)
    })
    return this.get(id)
  }

  async unblock(id: string): Promise<PlatformTenantDto> {
    await this.require(id)
    await this.inTenant(id, async (tx) => {
      if (!(await this.statuses.unblock(tx, id))) throw new DomainError('INVALID_STATUS_TRANSITION', 'Do‘kon bloklanmagan')
      await this.audit.log({ action: 'tenant.unblocked', entityType: 'tenant', entityId: id, detail: 'Platforma' }, tx)
      await this.platformAudit.log({ action: 'tenant.unblock', targetTenantId: id, entityType: 'tenant', entityId: id }, tx)
      await this.publishStatus(tx, id)
    })
    return this.get(id)
  }

  /** Tarif berish / qo'lda to'lov — `PlatformBillingService.grant` (bitta tarif mantig'i) */
  async grantPlan(id: string, dto: GrantPlanDto, adminId: string): Promise<PlatformTenantDto> {
    await this.require(id)
    await this.inTenant(id, (tx) => this.billing.grant(tx, id, dto, adminId))
    return this.get(id)
  }

  /** O'chirish — do'kon administratori so'rovi bilan bir xil: 30 kun muhlat, keyin to'liq tozalanadi */
  async requestDeletion(id: string): Promise<PlatformTenantDto> {
    const tenant = await this.require(id)
    if (tenant.status === 'deleting') throw new DomainError('INVALID_STATUS_TRANSITION', 'Do‘kon allaqachon o‘chirish muhlatida')
    await this.inTenant(id, async (tx) => {
      await this.statuses.scheduleDeletion(tx, id)
      await this.audit.log({ action: 'tenant.deletionRequested', entityType: 'tenant', entityId: id, detail: 'Platforma' }, tx)
      await this.platformAudit.log({ action: 'tenant.delete', targetTenantId: id, entityType: 'tenant', entityId: id }, tx)
      await this.publishStatus(tx, id)
    })
    return this.get(id)
  }

  async cancelDeletion(id: string): Promise<PlatformTenantDto> {
    await this.require(id)
    await this.inTenant(id, async (tx) => {
      if (!(await this.statuses.cancelDeletion(tx, id))) throw new DomainError('INVALID_STATUS_TRANSITION', 'Do‘kon o‘chirish muhlatida emas')
      await this.audit.log({ action: 'tenant.deletionCancelled', entityType: 'tenant', entityId: id, detail: 'Platforma' }, tx)
      await this.platformAudit.log({ action: 'tenant.restore', targetTenantId: id, entityType: 'tenant', entityId: id }, tx)
      await this.publishStatus(tx, id)
    })
    return this.get(id)
  }

  async users(id: string): Promise<PlatformTenantUserDto[]> {
    await this.require(id)
    const rows = await this.prisma.$queryRaw<TenantUserRow[]>`
      SELECT id, name, email, role_key AS "roleKey", role_name AS "roleName", is_active AS "isActive",
             last_login_at AS "lastLoginAt", created_at AS "createdAt"
        FROM platform_tenant_users(${id}::uuid)`
    return rows.map(({ roleKey, ...row }) => ({ ...row, role: roleKey }))
  }

  /** Qo'llab-quvvatlash: do'kon hisobiga yangi parol; uning barcha sessiyalari yopiladi */
  async resetPassword(id: string, userId: string, password: string): Promise<void> {
    await this.require(id)
    const passwordHash = await this.passwords.hash(password)
    await this.inTenant(id, async (tx) => {
      const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } })
      if (!user) throw new NotFoundError('Foydalanuvchi', userId)
      await tx.user.update({ where: { id: userId }, data: { passwordHash } })
      await this.refresh.revokeAllForUser(userId, tx)
      await this.audit.log({ action: 'user.passwordReset', entityType: 'user', entityId: userId, detail: 'Platforma' }, tx)
      await this.platformAudit.log({ action: 'user.resetPassword', targetTenantId: id, entityType: 'user', entityId: userId }, tx)
    })
  }

  private async require(id: string): Promise<TenantRow> {
    const row = await this.prisma.tenant.findUnique({ where: { id }, select: TENANT_SELECT })
    if (!row) throw new NotFoundError('Do‘kon', id)
    return row
  }

  /** Do'kon ichidagi amal: o'sha do'kon konteksti + tranzaksiyasi */
  private inTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
    return withTenant(tenantId, () => this.prisma.inTenantTransaction(tenantId, fn))
  }

  private async publishStatus(tx: TenantTx, tenantId: string): Promise<void> {
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { status: true, plan: true } })
    this.events.publish('tenant.status', { status: tenant.status, plan: tenant.plan })
  }

  private async usage(ids: string[]): Promise<Map<string, UsageRow>> {
    if (ids.length === 0) return new Map()
    const rows = await this.prisma.$queryRaw<UsageRow[]>`
      SELECT tenant_id AS "tenantId", users, warehouses, storage_bytes AS "storageBytes",
             admin_name AS "adminName", admin_email AS "adminEmail", admin_phone AS "adminPhone",
             last_sale_at AS "lastSaleAt", sales_30d AS "sales30d", open_requests AS "openRequests"
        FROM platform_tenant_usage(${uuidArray(ids)})`
    return new Map(rows.map((r) => [r.tenantId, r]))
  }
}

function listWhere(query: PlatformTenantsQueryDto): Prisma.TenantWhereInput {
  const and: Prisma.TenantWhereInput[] = []
  if (query.q) and.push({ name: { contains: query.q, mode: 'insensitive' } })
  if (query.status) and.push({ status: query.status })
  if (query.plan) and.push({ plan: query.plan })
  if (query.expiresWithinDays !== undefined) {
    and.push({ plan: { not: 'free' }, planExpiresAt: { lte: new Date(Date.now() + query.expiresWithinDays * DAY_MS) } })
  }
  if (query.trial !== undefined) and.push({ trialEndsAt: query.trial ? { not: null } : null })
  return { AND: and }
}

function toDto(row: TenantRow, usage: UsageRow | undefined): PlatformTenantDto {
  return {
    ...row,
    limits: planLimits(row.plan),
    usage: { users: usage?.users ?? 0, warehouses: usage?.warehouses ?? 0, storageBytes: Number(usage?.storageBytes ?? 0) },
    admin: usage?.adminEmail ? { name: usage.adminName ?? '', email: usage.adminEmail, phone: usage.adminPhone ?? '' } : null,
    activity: { lastSaleAt: usage?.lastSaleAt ?? null, sales30d: usage?.sales30d ?? 0 },
    openRequests: usage?.openRequests ?? 0,
  }
}
