import { Injectable } from '@nestjs/common'
import { planLimits } from '@crm/shared'
import { DomainError, PermissionDeniedError } from '@/common/errors/domain.error'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { PasswordService } from '@/modules/auth/password.service'
import { smsUsage } from '@/modules/messages/messages.service'
import { PlatformSettingsService } from '@/modules/platform/platform-settings.service'
import { OwnerNotifierService } from '@/modules/telegram/owner-notifier.service'
import { DELETION_GRACE_DAYS, TenantStatusService } from '@/modules/tenants/tenant-status.service'
import { PrismaService } from '@/prisma/prisma.service'
import { onCommit, requireTenantTx } from '@/prisma/tenant-tx'
import type { TenantAccountDto } from './dto/account.dto'

/**
 * Do'kon hisobi (E16): tarif, chegara va ishlatilgan hajm; o'chirish
 * so'rovi (30 kun muhlat) va uni bekor qilish. Faqat administrator.
 * Holat o'tishlari — `TenantStatusService` (egasi paneli bilan bir xil qoida).
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly statuses: TenantStatusService,
    private readonly audit: AuditService,
    private readonly ownerNotifier: OwnerNotifierService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async current(user: AuthContext): Promise<TenantAccountDto> {
    assertAdmin(user)
    const { tenantId } = requireTenantTx()
    const tx = this.prisma.scoped
    const [tenant, users, warehouses, state, sms, platform] = await Promise.all([
      tx.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: {
          id: true, name: true, plan: true, status: true, planExpiresAt: true, trialEndsAt: true, deletionScheduledAt: true, blockedReason: true,
        },
      }),
      tx.user.count({ where: { deletedAt: null, isActive: true } }),
      tx.warehouse.count({ where: { archived: false } }),
      tx.tenantState.findUniqueOrThrow({ where: { tenantId }, select: { storageUsedBytes: true } }),
      smsUsage(tx, tenantId),
      // Egasining aloqa ma'lumoti (T-140) — bannerda va murojaat oynasida; to'lov kartasi (T-149) — tarif sahifasida
      this.platformSettings.forStore(),
    ])
    return {
      ...tenant,
      limits: planLimits(tenant.plan),
      usage: { users, warehouses, storageBytes: Number(state.storageUsedBytes), smsThisMonth: sms.month },
      ...platform,
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
    await this.statuses.scheduleDeletion(this.prisma.scoped, tenantId)
    await this.audit.log({ action: 'tenant.deletionRequested', entityType: 'tenant', entityId: tenantId })
    // Platforma egasiga xabar (T-137): muhlat ichida panelidan qaytarishi mumkin
    onCommit(() => this.ownerNotifier.deletionRequested({ tenantId, days: DELETION_GRACE_DAYS }))
    return this.current(user)
  }

  /** O'chirishdan qaytish: blok bo'lsa `blocked`, muddati o'tgan pullik tarif bo'lsa `suspended`, aks holda `active` */
  async cancelDeletion(user: AuthContext): Promise<TenantAccountDto> {
    assertAdmin(user)
    const { tenantId } = requireTenantTx()
    if (!(await this.statuses.cancelDeletion(this.prisma.scoped, tenantId))) {
      throw new DomainError('INVALID_STATUS_TRANSITION', 'Do‘kon o‘chirish muhlatida emas')
    }
    await this.audit.log({ action: 'tenant.deletionCancelled', entityType: 'tenant', entityId: tenantId })
    return this.current(user)
  }
}

export function assertAdmin(user: AuthContext): void {
  if (user.role !== 'admin') throw new PermissionDeniedError('Do‘kon hisobi — faqat administrator')
}
