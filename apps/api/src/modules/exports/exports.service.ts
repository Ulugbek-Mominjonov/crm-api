import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import type { Role } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { CSV_BOM, csvLine, hasPermission } from '@crm/shared'
import { runWithContext } from '@/common/context/request-context'
import { DomainError, NotFoundError, PermissionDeniedError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { canSeeField, visibilityPolicy } from '@/common/security/field-visibility'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { FILE_RULES } from '@/modules/files/file-rules'
import { FilesService } from '@/modules/files/files.service'
import { PRESIGN_TTL_SEC } from '@/modules/files/s3.service'
import { JobQueue } from '@/modules/queue/job-queue'
import { SettingsService } from '@/modules/settings/settings.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { onCommit, requireTenantTx } from '@/prisma/tenant-tx'
import type { ExportFormat, ExportJobDto, ExportQueryDto } from './dto/export.dto'
import {
  EXPORT_RESOURCES, FIRST_CURSOR, type ExportColumn, type ExportFilter, type ExportResource, type ExportResourceName,
} from './export-resources'

/** Shundan ko'p qator — fonda (S3 + havola); ko'p bo'lmasa — darhol javobda (09 §9.2) */
export const INLINE_MAX_ROWS = 5_000
/** Bir so'rovda o'qiladigan qatorlar (kalitli sahifa) */
const PAGE_SIZE = 1_000
const MIME: Readonly<Record<ExportFormat, string>> = { csv: 'text/csv', json: 'application/json' }
const RESOURCE = 'Eksport'

export interface ExportFile {
  filename: string
  mime: string
  body: Buffer
}

type Row = Record<string, unknown> & { id: string }

const JOB_SELECT = {
  id: true, resource: true, format: true, status: true, rowCount: true, fileId: true, error: true, createdAt: true,
  finishedAt: true,
} satisfies Prisma.ExportSelect

type JobRow = Prisma.ExportGetPayload<{ select: typeof JOB_SELECT }>

/**
 * Eksport (T-084). Kichik ro'yxat — so'rovning o'zida fayl bo'lib
 * qaytadi; katta — navbatga (T-096), fonda sahifalab yig'iladi, S3'ga
 * (`files`, kind = export) yoziladi, so'rovchi havola oladi. Ustunlar
 * rolga qarab (tannarx sotuvchiga chiqmaydi, 03 §3.6); jurnalga yoziladi.
 */
@Injectable()
export class ExportsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExportsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly queue: JobQueue,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  onApplicationBootstrap(): void {
    this.queue.register('export', (data) => this.build(String(data.tenantId), String(data.exportId)))
  }

  async start(name: ExportResourceName, query: ExportQueryDto, user: AuthContext): Promise<{ file: ExportFile } | { job: ExportJobDto }> {
    const resource: ExportResource = EXPORT_RESOURCES[name]
    if (!hasPermission(user.role, resource.permission, 'view')) throw new PermissionDeniedError()
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo) {
      throw new DomainError('VALIDATION_FAILED', '`dateFrom` `dateTo` dan keyin', [{ field: 'dateFrom', code: 'VALIDATION_FAILED' }])
    }
    const { tenantId } = requireTenantTx()
    const filter = filterOf(resource, query, tenantId)
    const [counted] = await this.prisma.scoped.$queryRaw<{ n: number }[]>(resource.count(filter))
    const params = { dateFrom: filter.dateFrom, dateTo: filter.dateTo }

    if (counted!.n <= INLINE_MAX_ROWS) {
      const lines = await this.collect(resource, filter, query.format, user.role, (sql) => this.prisma.scoped.$queryRaw<Row[]>(sql))
      await this.audit.log({ action: 'export.download', entityType: 'export', diff: { resource: name, format: query.format, rows: counted!.n, ...params } })
      return { file: toFile(name, query.format, lines) }
    }

    const job = await this.prisma.scoped.export.create({
      data: { id: uuidv7(), tenantId, userId: user.userId, resource: name, format: query.format, params },
      select: JOB_SELECT,
    })
    await this.audit.log({ action: 'export.create', entityType: 'export', entityId: job.id, diff: { resource: name, format: query.format, rows: counted!.n, ...params } })
    // Ishchi COMMIT'dan keyin — ish qatorini ko'radi
    onCommit(() => this.queue.add('export', { tenantId, exportId: job.id }))
    return { job: await this.toJobDto(job) }
  }

  /** Faqat so'rovchi ko'radi (09 §9.2) — boshqasi uchun "topilmadi" */
  async job(id: string, user: AuthContext): Promise<ExportJobDto> {
    return this.toJobDto(await this.findJob(id, user))
  }

  async downloadUrl(id: string, user: AuthContext): Promise<string> {
    const job = await this.findJob(id, user)
    if (job.status !== 'ready' || !job.fileId) throw new NotFoundError(RESOURCE, id)
    return this.files.downloadUrl(job.fileId)
  }

  private async findJob(id: string, user: AuthContext): Promise<JobRow> {
    const job = await this.prisma.scoped.export.findFirst({ where: { id, userId: user.userId }, select: JOB_SELECT })
    if (!job) throw new NotFoundError(RESOURCE, id)
    return job
  }

  /**
   * Tayyor ish — imzolangan havola bilan: brauzer uni `window.location` bilan
   * ochadi. `…/download` (302) ga `fetch` bilan ergashish API boshqa domenda
   * bo'lsa CORS'da yiqiladi (yo'naltirilgan so'rovda `Origin: null`).
   */
  private async toJobDto(job: JobRow): Promise<ExportJobDto> {
    if (job.status !== 'ready' || !job.fileId) return { ...job, url: null, expiresAt: null }
    return {
      ...job,
      url: await this.files.downloadUrl(job.fileId),
      expiresAt: new Date(Date.now() + PRESIGN_TTL_SEC * 1000),
    }
  }

  /**
   * Fon ishi: sahifalab o'qiydi (har sahifa — qisqa tranzaksiya, qulf
   * ushlanmaydi), faylni S3'ga yozadi. Xato — `failed` va sababi.
   */
  async build(tenantId: string, exportId: string): Promise<void> {
    const claimed = await this.prisma.inTenantTransaction(tenantId, (tx) => claim(tx, tenantId, exportId))
    if (!claimed) return
    const resource: ExportResource = EXPORT_RESOURCES[claimed.resource as ExportResourceName]
    const format = claimed.format as ExportFormat
    const params = claimed.params as Pick<ExportFilter, 'dateFrom' | 'dateTo'>
    try {
      const lines = await this.collect(resource, { tenantId, ...params }, format, claimed.role, (sql) =>
        this.prisma.inTenantTransaction(tenantId, (tx) => tx.$queryRaw<Row[]>(sql)),
      )
      const file = toFile(claimed.resource as ExportResourceName, format, lines)
      if (file.body.length > FILE_RULES.export.maxBytes) {
        throw new DomainError('PAYLOAD_TOO_LARGE', `Eksport ${FILE_RULES.export.maxBytes} baytdan katta — sana oralig‘ini qisqartiring`)
      }
      await runWithContext({ requestId: `job:export:${exportId}`, tenantId, userId: claimed.userId }, () =>
        this.prisma.inTenantTransaction(tenantId, async (tx) => {
          const stored = await this.files.putDirect('export', file.mime, file.body, file.filename)
          await tx.export.update({
            where: { id: exportId },
            data: { status: 'ready', fileId: stored.id, rowCount: lines.length - 1, finishedAt: new Date() },
          })
        }),
      )
    } catch (err) {
      this.logger.error({ err, tenantId, exportId }, 'Eksport yasalmadi')
      const error = err instanceof DomainError ? (err.detail ?? err.title) : 'Ichki xato — qayta urinib ko‘ring'
      await this.prisma.inTenantTransaction(tenantId, (tx) =>
        tx.export.update({ where: { id: exportId }, data: { status: 'failed', error, finishedAt: new Date() } }),
      )
    }
  }

  /** Sarlavha + qatorlar (matn bo'laklari); ustunlar rolga va do'kon sozlamasiga qarab (javobdagidek) */
  private async collect(
    resource: ExportResource,
    filter: ExportFilter,
    format: ExportFormat,
    role: Role,
    read: (sql: Prisma.Sql) => Promise<Row[]>,
  ): Promise<string[]> {
    const policy = visibilityPolicy(await this.settings.forTenant(filter.tenantId))
    const columns = resource.columns.filter((c) => !c.visibility || canSeeField(role, c.visibility, policy))
    const lines = [format === 'csv' ? csvLine(columns.map((c) => c.label)) : '']
    let after = FIRST_CURSOR
    for (;;) {
      // Ketma-ket ATAYLAB: keyingi sahifa kursori — oldingisining oxirgi qatori (N+1 emas: 1000 tadan)
      // eslint-disable-next-line no-await-in-loop
      const rows = await read(resource.page(filter, after, PAGE_SIZE))
      for (const row of rows) lines.push(format === 'csv' ? csvLine(values(row, columns)) : jsonRow(row, columns))
      if (rows.length < PAGE_SIZE) return lines
      after = rows.at(-1)!.id
    }
  }
}

function filterOf(resource: ExportResource, query: ExportQueryDto, tenantId: string): ExportFilter {
  return resource.dated ? { tenantId, dateFrom: query.dateFrom, dateTo: query.dateTo } : { tenantId }
}

/** Navbatdagi ishni oladi (bir marta) — so'rovchining JORIY roli bilan */
async function claim(tx: TenantTx, tenantId: string, exportId: string) {
  const [row] = await tx.$queryRaw<{ resource: string; format: string; params: Prisma.JsonValue; userId: string; role: Role }[]>`
    UPDATE exports e SET status = 'running'
      FROM users u
     WHERE e.tenant_id = ${tenantId}::uuid AND e.id = ${exportId}::uuid AND e.status = 'queued'
       AND u.tenant_id = e.tenant_id AND u.id = e.user_id
    RETURNING e.resource, e.format, e.params, e.user_id AS "userId", u.role`
  return row
}

/** Bazadan kelgan qiymat → oddiy JSON qiymati (BigInt, Decimal — son) */
function plain(value: unknown): unknown {
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Prisma.Decimal) return value.toNumber()
  return value
}

function values(row: Row, columns: readonly ExportColumn[]): unknown[] {
  return columns.map((c) => plain(row[c.key]))
}

function jsonRow(row: Row, columns: readonly ExportColumn[]): string {
  return JSON.stringify(Object.fromEntries(columns.map((c) => [c.key, plain(row[c.key]) ?? null])))
}

/** CSV — BOM bilan (Excel); JSON — massiv. Nom: `sotuvlar-2026-09-23.csv` */
function toFile(name: ExportResourceName, format: ExportFormat, lines: readonly string[]): ExportFile {
  const text = format === 'csv' ? CSV_BOM + lines.join('') : `[${lines.slice(1).join(',')}]`
  return {
    filename: `${EXPORT_RESOURCES[name].filename}-${businessDate()}.${format}`,
    mime: MIME[format],
    body: Buffer.from(text, 'utf8'),
  }
}
