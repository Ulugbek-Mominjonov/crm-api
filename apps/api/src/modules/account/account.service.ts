import { Injectable } from '@nestjs/common'
import { planLimits } from '@crm/shared'
import { DomainError, PermissionDeniedError } from '@/common/errors/domain.error'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { PasswordService } from '@/modules/auth/password.service'
import { smsUsedToday } from '@/modules/messages/messages.service'
import { TenantStatusService } from '@/modules/tenants/tenant-status.service'
import { PrismaService } from '@/prisma/prisma.service'
import { onCommit, requireTenantTx } from '@/prisma/tenant-tx'
import type { TenantAccountDto } from './dto/account.dto'

/** O'chirish so'ralgandan keyin ma'lumot shuncha saqlanadi — fikrdan qaytish mumkin (T-127) */
export const DELETION_GRACE_DAYS = 30
/** Pullik tarif muddati o'tgach shuncha kun yozish davom etadi (to'lovga ulgurish) */
export const SUSPEND_GRACE_DAYS = 3

/**
 * Do'kon hisobi (E16): tarif, chegara va ishlatilgan hajm; o'chirish
 * so'rovi (30 kun muhlat) va uni bekor qilish. Faqat administrator.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly statuses: TenantStatusService,
    private readonly audit: AuditService,
  ) {}

  async current(user: AuthContext): Promise<TenantAccountDto> {
    assertAdmin(user)
    const { tenantId } = requireTenantTx()
    const tx = this.prisma.scoped
    const [tenant, users, warehouses, state, smsToday] = await Promise.all([
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { id: true, name: true, plan: true, status: true, planExpiresAt: true, deletionScheduledAt: true },
      }),
      tx.user.count({ where: { deletedAt: null, isActive: true } }),
      tx.warehouse.count({ where: { archived: false } }),
      tx.tenantState.findUniqueOrThrow({ where: { tenantId }, select: { storageUsedBytes: true } }),
      smsUsedToday(tx, tenantId),
    ])
    return {
      ...tenant,
      limits: planLimits(tenant.plan),
      usage: { users, warehouses, storageBytes: Number(state.storageUsedBytes), smsToday },
    }
  }

  /** O'chirish so'rovi: parol bilan tasdiq; 30 kun — faqat o'qish, keyin to'liq o'chadi */
  async requestDeletion(password: string, user: AuthContext): Promise<TenantAccountDto> {
    assertAdmin(user)
    const { tenantId } = requireTenantTx()
    const own = await this.prisma.scoped.user.findUniqueOrThrow({ where: { id: user.userId }, select: { passwordHash: true } })
    if (!(await this.passwords.verify(own.passwordHash, password))) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Parol noto‘g‘ri')
    }
    await this.prisma.scoped.$executeRaw`
      UPDATE tenants SET status = 'deleting', deletion_scheduled_at = now() + make_interval(days => ${DELETION_GRACE_DAYS}::int)
       WHERE id = ${tenantId}::uuid`
    await this.audit.log({ action: 'tenant.deletionRequested', entityType: 'tenant', entityId: tenantId })
    onCommit(() => this.statuses.invalidate(tenantId))
    return this.current(user)
  }

  /** O'chirishdan qaytish: muddati o'tgan pullik tarif bo'lsa — `suspended`, aks holda `active` */
  async cancelDeletion(user: AuthContext): Promise<TenantAccountDto> {
    assertAdmin(user)
    const { tenantId } = requireTenantTx()
    const updated = await this.prisma.scoped.$executeRaw`
      UPDATE tenants
         SET status = CASE WHEN plan <> 'free' AND plan_expires_at < now() - make_interval(days => ${SUSPEND_GRACE_DAYS}::int)
                           THEN 'suspended' ELSE 'active' END,
             deletion_scheduled_at = NULL
       WHERE id = ${tenantId}::uuid AND status = 'deleting'`
    if (updated === 0) throw new DomainError('INVALID_STATUS_TRANSITION', 'Do‘kon o‘chirish muhlatida emas')
    await this.audit.log({ action: 'tenant.deletionCancelled', entityType: 'tenant', entityId: tenantId })
    onCommit(() => this.statuses.invalidate(tenantId))
    return this.current(user)
  }
}

function assertAdmin(user: AuthContext): void {
  if (user.role !== 'admin') throw new PermissionDeniedError('Do‘kon hisobi — faqat administrator')
}
