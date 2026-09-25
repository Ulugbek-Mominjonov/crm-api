import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { BUSINESS_TIME_ZONE } from '@/common/time'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { S3Service, type BucketName } from './s3.service'

const HOUR_MS = 3_600_000
/** Tugallanmagan yuklash shuncha vaqtdan keyin tashlab ketilgan hisoblanadi (09 §9.10) */
export const PENDING_TTL_MS = 24 * HOUR_MS
/** Yangi rasm hali mahsulotga ulanmagan bo'lishi mumkin (forma to'ldirilmoqda) — shuncha kutiladi */
export const ORPHAN_GRACE_MS = 24 * HOUR_MS
/** Eksport — bir martalik fayl: so'rovchi yuklab olishga ulgursin (09 §9.2), keyin o'chiriladi */
export const EXPORT_TTL_MS = 7 * 24 * HOUR_MS
/** Do'kon zaxirasi havolasi shuncha amal qiladi (T-128); undan keyin fayl hech kimga kerak emas */
export const BACKUP_TTL_MS = HOUR_MS
/** Yumshoq o'chirilgan fayl shuncha saqlanadi: mahsulotni tiklash (undo) rasmsiz qolmasin */
export const PURGE_AFTER_MS = 30 * 24 * HOUR_MS
/** Bir tenantdan bir aylanishda — tranzaksiya qisqa qolsin; qolgani keyingi aylanishda */
const GC_BATCH = 500

interface StoredObject {
  id: string
  key: string
  bucket: string
  variants: Record<string, string> | null
}

/**
 * Fayllar hayot sikli (T-092, 09 §9.10). Har tenant o'z tranzaksiyasida
 * (RLS ostida); bittasining xatosi qolganlarini to'xtatmaydi.
 *
 * S3 obyektlari qator qulfi USHLANGAN holda o'chiriladi, qator esa undan
 * keyin: S3 xatosida tranzaksiya bekor bo'ladi va keyingi aylanishda qayta
 * uriniladi (yo'q kalitni o'chirish — xato emas). Teskari tartibda xato
 * bo'lsa S3'da hech kim bilmaydigan obyekt qolib ketardi.
 */
@Injectable()
export class FileGcJobs {
  private readonly logger = new Logger(FileGcJobs.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /** 24 soatdan oshgan `pending` — obyekt (yuklangan bo'lsa) va qator o'chadi; hajmga kirmagan */
  @Cron('17 * * * *', { name: 'files:gc-pending' })
  async gcPending(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - PENDING_TTL_MS)
    return this.eachTenant('files:gc-pending', async (tx, tenantId) => {
      const stale = await tx.$queryRaw<StoredObject[]>`
        SELECT id, key, bucket, variants FROM files
         WHERE tenant_id = ${tenantId}::uuid AND status = 'pending' AND created_at < ${cutoff}
         ORDER BY created_at
         LIMIT ${GC_BATCH}
           FOR UPDATE SKIP LOCKED`
      if (stale.length === 0) return 0
      await this.deleteObjects(stale)
      await tx.$executeRaw`
        DELETE FROM files
         WHERE tenant_id = ${tenantId}::uuid
           AND id IN (SELECT jsonb_array_elements_text(${JSON.stringify(stale.map((f) => f.id))}::jsonb)::uuid)`
      return stale.length
    })
  }

  /**
   * Hech bir tirik mahsulot ishlatmaydigan `ready` rasm, muddati o'tgan
   * eksport va zaxira — `deletedAt` (obyekt hali o'chmaydi: 30 kun ichida
   * mahsulot tiklansa rasm qaytadi).
   */
  @Cron('0 4 * * *', { name: 'files:gc-orphans', timeZone: BUSINESS_TIME_ZONE })
  async gcOrphans(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ORPHAN_GRACE_MS)
    const exportCutoff = new Date(now.getTime() - EXPORT_TTL_MS)
    const backupCutoff = new Date(now.getTime() - BACKUP_TTL_MS)
    return this.eachTenant('files:gc-orphans', async (tx, tenantId) => {
      const orphans = await tx.$executeRaw`
        UPDATE files f SET deleted_at = ${now}
         WHERE f.tenant_id = ${tenantId}::uuid AND f.status = 'ready' AND f.kind = 'product_image'
           AND f.deleted_at IS NULL AND f.created_at < ${cutoff}
           AND NOT EXISTS (SELECT 1 FROM products p
                            WHERE p.tenant_id = f.tenant_id AND p.image_file_id = f.id AND p.deleted_at IS NULL)`
      const expired = await tx.$executeRaw`
        UPDATE files SET deleted_at = ${now}
         WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
           AND ((kind = 'export' AND created_at < ${exportCutoff}) OR (kind = 'tenant_backup' AND created_at < ${backupCutoff}))`
      return orphans + expired
    })
  }

  /**
   * 30 kundan oshgan o'chirilgan fayllar — S3'dan va bazadan; band hajm
   * (faqat `ready` edi) kamayadi. Zaxira kutmaydi: uni tiklash yo'q, kvotani
   * esa band qiladi. Tirik mahsulot havolasi bo'lsa — HECH QACHON o'chmaydi
   * (qayta tekshiruv). So'ng hisoblagich solishtiriladi (10 §10.2).
   */
  @Cron('30 4 * * *', { name: 'files:purge', timeZone: BUSINESS_TIME_ZONE })
  async purge(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - PURGE_AFTER_MS)
    return this.eachTenant('files:purge', async (tx, tenantId) => {
      const expired = await tx.$queryRaw<StoredObject[]>`
        SELECT f.id, f.key, f.bucket, f.variants FROM files f
         WHERE f.tenant_id = ${tenantId}::uuid
           AND (f.deleted_at < ${cutoff} OR (f.kind = 'tenant_backup' AND f.deleted_at IS NOT NULL))
           AND NOT EXISTS (SELECT 1 FROM products p
                            WHERE p.tenant_id = f.tenant_id AND p.image_file_id = f.id AND p.deleted_at IS NULL)
         ORDER BY f.deleted_at
         LIMIT ${GC_BATCH}
           FOR UPDATE OF f SKIP LOCKED`
      if (expired.length > 0) {
        await this.deleteObjects(expired)
        // Kamayish — haqiqatan o'chgan qatorlardan (bitta so'rov)
        await tx.$executeRaw`
          WITH gone AS (
            DELETE FROM files
             WHERE tenant_id = ${tenantId}::uuid
               AND id IN (SELECT jsonb_array_elements_text(${JSON.stringify(expired.map((f) => f.id))}::jsonb)::uuid)
            RETURNING status, size_bytes)
          UPDATE tenant_state
             SET storage_used_bytes = storage_used_bytes
                   - (SELECT COALESCE(SUM(size_bytes) FILTER (WHERE status = 'ready'), 0) FROM gone)
           WHERE tenant_id = ${tenantId}::uuid`
      }
      await this.reconcileStorage(tx, tenantId)
      return expired.length
    })
  }

  /** Denormalizatsiya shartnomasi: hisoblagich ≠ `SUM` bo'lsa ogohlantirish (tuzatilmaydi — sabab topilsin) */
  private async reconcileStorage(tx: TenantTx, tenantId: string): Promise<void> {
    const [row] = await tx.$queryRaw<{ cached: bigint; actual: bigint }[]>`
      SELECT s.storage_used_bytes AS cached,
             (SELECT COALESCE(SUM(size_bytes), 0) FROM files
               WHERE tenant_id = s.tenant_id AND status = 'ready')::bigint AS actual
        FROM tenant_state s
       WHERE s.tenant_id = ${tenantId}::uuid`
    if (row && row.cached !== row.actual) {
      this.logger.warn(
        { tenantId, cached: Number(row.cached), actual: Number(row.actual) },
        'tenant_state.storage_used_bytes fayllar yig‘indisidan farq qiladi',
      )
    }
  }

  /** Asl obyekt va uning variantlari — bucket bo'yicha guruhlab, ommaviy */
  private async deleteObjects(files: readonly StoredObject[]): Promise<void> {
    const byBucket = new Map<BucketName, string[]>()
    for (const f of files) {
      const keys = byBucket.get(f.bucket as BucketName) ?? []
      keys.push(f.key, ...Object.values(f.variants ?? {}))
      byBucket.set(f.bucket as BucketName, keys)
    }
    await Promise.all([...byBucket].map(([bucket, keys]) => this.s3.delete(bucket, keys)))
  }

  private async eachTenant(job: string, fn: (tx: TenantTx, tenantId: string) => Promise<number>): Promise<number> {
    let total = 0
    const failures = await this.prisma.forEachTenant(async (tx, tenantId) => {
      total += await fn(tx, tenantId)
    })
    for (const { tenantId, error } of failures) {
      this.logger.error({ err: error, tenantId }, `${job}: tenant fayllari tozalanmadi`)
    }
    return total
  }
}
