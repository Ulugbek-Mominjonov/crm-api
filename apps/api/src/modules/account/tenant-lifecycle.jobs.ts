import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { BUSINESS_TIME_ZONE } from '@/common/time'
import { S3Service } from '@/modules/files/s3.service'
import { TenantStatusService } from '@/modules/tenants/tenant-status.service'
import { PrismaService } from '@/prisma/prisma.service'
import { SUSPEND_GRACE_DAYS } from './account.service'

/**
 * Do'kon hayot sikli (T-127). `tenants` — global jadval (RLS'siz);
 * ma'lumotni o'chirish — `purge_tenant()` (egasi huquqi, faqat muhlati
 * o'tgan so'rov uchun), fayllar — `t/{tenantId}/` prefiksi bo'yicha.
 */
@Injectable()
export class TenantLifecycleJobs {
  private readonly logger = new Logger(TenantLifecycleJobs.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly statuses: TenantStatusService,
  ) {}

  /** To'lanmagan pullik tarif (muddat + imtiyoz o'tdi) — faqat o'qish */
  @Cron('0 1 * * *', { name: 'tenants:suspend-expired', timeZone: BUSINESS_TIME_ZONE })
  async suspendExpired(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE tenants SET status = 'suspended'
       WHERE status = 'active' AND plan <> 'free' AND plan_expires_at IS NOT NULL
         AND plan_expires_at < now() - make_interval(days => ${SUSPEND_GRACE_DAYS}::int)
      RETURNING id`
    for (const { id } of rows) this.statuses.invalidate(id)
    if (rows.length > 0) this.logger.log({ tenants: rows.map((r) => r.id) }, 'Tarif muddati o‘tgan do‘konlar to‘xtatildi')
    return rows.map((r) => r.id)
  }

  /**
   * Muhlati tugagan o'chirish so'rovlari: avval fayllar (S3), keyin baza.
   * S3 xatosida baza tegilmaydi — ertaga qayta uriniladi (fayl hech kimga
   * tegishli bo'lmay qolib ketmasin).
   */
  @Cron('30 1 * * *', { name: 'tenants:purge-deleted', timeZone: BUSINESS_TIME_ZONE })
  async purgeDeleted(): Promise<string[]> {
    const due = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM tenants WHERE status = 'deleting' AND deletion_scheduled_at <= now() ORDER BY deletion_scheduled_at`
    const purged: string[] = []
    for (const { id } of due) {
      try {
        // Ketma-ket ATAYLAB: har do'kon — alohida, og'ir amal (tunda, bittadan)
        const files = (await this.s3.deletePrefix('media', `t/${id}/`)) + (await this.s3.deletePrefix('backup', `t/${id}/`))
        await this.prisma.$executeRaw`SELECT purge_tenant(${id}::uuid)`
        this.statuses.invalidate(id)
        purged.push(id)
        this.logger.log({ tenantId: id, files }, 'Do‘kon ma’lumoti va fayllari to‘liq o‘chirildi')
      } catch (err) {
        this.logger.error({ err, tenantId: id }, 'Do‘konni o‘chirish yiqildi — ertaga qayta')
      }
    }
    return purged
  }
}
