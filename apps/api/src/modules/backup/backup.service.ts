import { Readable } from 'node:stream'
import { buffer } from 'node:stream/consumers'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { Injectable } from '@nestjs/common'
import { PermissionDeniedError } from '@/common/errors/domain.error'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { BACKUP_TTL_MS } from '@/modules/files/files.jobs'
import { FilesService } from '@/modules/files/files.service'
import { PrismaService } from '@/prisma/prisma.service'
import { snapshotJson } from './backup-snapshot'
import type { BackupDto } from './dto/backup.dto'

/** Katta do'kon nusxasi uzoq yig'iladi; surat faqat o'qiydi — qulf ushlamaydi */
const SNAPSHOT_TIMEOUT_MS = 120_000

/**
 * Do'kon zaxirasi (T-128, 08 §8.5): butun ma'lumot — JSON (gzip), S3'ning
 * `backup` bucket'ida; administrator 1 soat amal qiladigan havola oladi,
 * fayl undan keyin tozalanadi (`files:gc-orphans`). To'xtatilgan va
 * o'chirilayotgan do'konda ham ishlaydi (GET — faqat-o'qish cheklovi yo'q).
 */
@Injectable()
export class BackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  async export(user: AuthContext): Promise<BackupDto> {
    if (user.role !== 'admin') throw new PermissionDeniedError('Do‘kon zaxirasi — faqat administrator')
    const { tenantId } = user
    // Bitta surat: chek bor, qatori yo'q (yoki qoldiq harakatlarga mos emas) bo'lib qolmasin
    const body = await this.prisma.inTenantTransaction(tenantId, (tx) => gzip(snapshotJson(tx, tenantId)), {
      isolationLevel: 'RepeatableRead',
      timeout: SNAPSHOT_TIMEOUT_MS,
    })
    const filename = `crm-zaxira-${businessDate()}.json.gz`
    return this.prisma.inTenantTransaction(tenantId, async () => {
      const file = await this.files.putDirect('tenant_backup', 'application/gzip', body, filename)
      await this.audit.log({ action: 'backup.export', entityType: 'file', entityId: file.id, diff: { sizeBytes: body.length } })
      return {
        fileId: file.id,
        filename,
        sizeBytes: body.length,
        url: await this.files.downloadUrl(file.id, BACKUP_TTL_MS / 1000),
        expiresAt: new Date(file.createdAt.getTime() + BACKUP_TTL_MS),
      }
    })
  }
}

/** Bo'laklar siqilib yig'iladi — xotirada faqat siqilgan nusxa */
async function gzip(chunks: AsyncIterable<string>): Promise<Buffer> {
  const zip = createGzip()
  const [body] = await Promise.all([buffer(zip), pipeline(Readable.from(chunks), zip)])
  return body
}
