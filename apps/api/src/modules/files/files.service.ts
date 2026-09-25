import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { Prisma, type FileKind } from '@prisma/client'
import { hasPermission, planLimits } from '@crm/shared'
import { currentContext } from '@/common/context/request-context'
import { moneyFromDb } from '@/common/crud/convert'
import { CommittedDomainError, DomainError, NotFoundError, PermissionDeniedError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { JobQueue } from '@/modules/queue/job-queue'
import { PrismaService } from '@/prisma/prisma.service'
import { onCommit, requireTenantTx } from '@/prisma/tenant-tx'
import type { FileDto, FileUrlsDto, PresignDto, PresignResultDto, UsageDto, Variant } from './dto/file.dto'
import { EXTENSIONS, FILE_RULES, MAGIC_HEAD_BYTES, matchesMagic, type FileRule } from './file-rules'
import { PRESIGN_TTL_SEC, S3Service, type BucketName } from './s3.service'

const RESOURCE = 'Fayl'
/** Tarkib xeshi to'liq o'qib tekshiriladigan eng katta hajm (rasm, PDF, CSV) */
const SHA_VERIFY_MAX_BYTES = 10 * 1024 * 1024

export const FILE_SELECT = {
  id: true,
  kind: true,
  key: true,
  bucket: true,
  mime: true,
  sizeBytes: true,
  sha256: true,
  originalName: true,
  status: true,
  variants: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.FileSelect

export type FileRecord = Prisma.FileGetPayload<{ select: typeof FILE_SELECT }>

/**
 * Fayllar (E11, 09-storage). Fayl serverdan O'TMAYDI: server ruxsat beradi
 * (presigned PUT), keyin natijani tasdiqlaydi (sehrli baytlar, hajm, xesh,
 * kvota). Kalitni faqat server yasaydi: `t/{tenantId}/{bo'lim}/{fileId}/…`.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly audit: AuditService,
    private readonly queue: JobQueue,
  ) {}

  /**
   * Yuklash ruxsati (T-088): tur va MIME oq ro'yxatda, hajm chegarada,
   * kvota — presign'dan OLDIN. Shu tarkib bor bo'lsa — mavjud fayl (takror
   * saqlanmaydi, 09 §9.9).
   */
  async presign(dto: PresignDto, user: AuthContext): Promise<PresignResultDto> {
    const rule = FILE_RULES[dto.kind]
    assertCan(user, rule, 'create')
    if (!rule.mimes.includes(dto.mime)) {
      throw new DomainError('VALIDATION_FAILED', `${dto.kind} uchun ruxsat etilgan turlar: ${rule.mimes.join(', ')}`, [
        { field: 'mime', code: 'VALIDATION_FAILED', meta: { allowed: rule.mimes } },
      ])
    }
    const { limits, used } = await this.quota()
    const maxBytes = Math.min(rule.maxBytes, limits.file)
    if (dto.size > maxBytes) {
      throw new DomainError('PAYLOAD_TOO_LARGE', `Fayl ${maxBytes} baytdan oshmasin`, [
        { field: 'size', code: 'PAYLOAD_TOO_LARGE', meta: { max: maxBytes } },
      ])
    }

    const existing = await this.prisma.scoped.file.findFirst({
      where: { sha256: dto.sha256, kind: dto.kind },
      select: FILE_SELECT,
    })
    if (existing) return this.reuse(existing, dto)

    if (used + dto.size > limits.storage) throw quotaError(used, limits.storage)
    const { tenantId } = requireTenantTx()
    const id = uuidv7()
    // Parallel ikkinchi presign o'sha tarkib bilan: xatosiz (tranzaksiya
    // buzilmaydi) — birinchisining qatori qayta ishlatiladi
    const inserted = await this.prisma.scoped.$executeRaw`
      INSERT INTO files (id, tenant_id, kind, key, bucket, mime, size_bytes, sha256, original_name, uploaded_by_id)
      VALUES (${id}::uuid, ${tenantId}::uuid, ${dto.kind}::"FileKind",
              ${`t/${tenantId}/${rule.prefix}/${id}/orig.${EXTENSIONS[dto.mime]}`}, ${rule.bucket}, ${dto.mime},
              ${dto.size}::bigint, ${dto.sha256}, ${dto.originalName ?? null}, ${currentContext().userId ?? null}::uuid)
      ON CONFLICT (tenant_id, sha256, kind) DO NOTHING`
    const file = await this.prisma.scoped.file.findFirstOrThrow({
      where: { sha256: dto.sha256, kind: dto.kind },
      select: FILE_SELECT,
    })
    if (inserted === 0) return this.reuse(file, dto)
    return { file: toFileDto(file), reused: false, upload: await this.uploadTarget(file) }
  }

  /**
   * Tasdiqlash (T-089): obyekt bor va hajmi e'lon qilinganiga teng,
   * boshlanish baytlari MIME ga mos, xesh mos, kvota yetadi — shundan keyin
   * `ready` va hajm hisoblagichi oshadi. Mos kelmasa — obyekt o'chiriladi,
   * fayl karantinga, audit'ga yoziladi (yozuvlar saqlanadi, mijozga 422).
   */
  async confirm(id: string, user: AuthContext): Promise<FileDto> {
    const file = await this.lock(id)
    assertCan(user, FILE_RULES[file.kind], 'create')
    if (file.status === 'ready') return toFileDto(file)
    if (file.status === 'quarantined') throw rejected(file.id, 'avval rad etilgan')

    const size = await this.s3.size(bucketOf(file), file.key)
    if (size === null) {
      throw new DomainError('FILE_NOT_UPLOADED', 'Fayl hali yuklanmagan — avval PUT havolasiga yuboring')
    }
    const problem = await this.inspect(file, size)
    if (problem) await this.quarantine(file, problem)

    const { tenantId } = requireTenantTx()
    const { limits } = await this.quota()
    // Kvota qayta — atomik: parallel tasdiqlashlar birgalikda oshirib yubormasin
    const grown = await this.prisma.scoped.$executeRaw`
      UPDATE tenant_state SET storage_used_bytes = storage_used_bytes + ${file.sizeBytes}
       WHERE tenant_id = ${tenantId}::uuid AND storage_used_bytes + ${file.sizeBytes} <= ${limits.storage}`
    if (grown === 0) {
      await this.s3.delete(bucketOf(file), [file.key])
      await this.prisma.scoped.file.delete({ where: { id: file.id } })
      throw new CommittedDomainError(quotaError(Number(file.sizeBytes), limits.storage))
    }
    const ready = await this.prisma.scoped.file.update({ where: { id: file.id }, data: { status: 'ready' }, select: FILE_SELECT })
    await this.audit.log({
      action: 'file.upload',
      entityType: 'file',
      entityId: file.id,
      diff: { kind: file.kind, mime: file.mime, size: Number(file.sizeBytes) },
    })
    // Variantlar (T-091) — fonda; ishchi COMMIT'dan keyin tayyor qatorni ko'radi
    if (file.kind === 'product_image') onCommit(() => this.queue.add('image-variants'))
    return toFileDto(ready)
  }

  async get(id: string, user: AuthContext): Promise<FileDto> {
    const file = await this.find(id)
    assertCan(user, FILE_RULES[file.kind], 'view')
    return toFileDto(file)
  }

  /**
   * O'qish (T-090): huquq tekshiriladi, qisqa muddatli imzolangan GET.
   * Variant tayyor bo'lmasa — asl fayl. Boshqa tenant fayli — 404.
   */
  async rawUrl(id: string, variant: Variant, user: AuthContext): Promise<string> {
    const file = await this.find(id)
    assertCan(user, FILE_RULES[file.kind], 'view')
    return this.signedGet(file, variant)
  }

  /**
   * Ro'yxatdagi rasmlar havolasi — BITTA so'rov (`<img src>` token yubora
   * olmaydi; har rasmga alohida `raw` so'rovi N+1 bo'lardi). Imzolash —
   * mahalliy hisob (S3 ga murojaat yo'q). Yo'q, tayyor bo'lmagan yoki
   * huquq yetmagan fayl tushib qoladi — bitta buzuq rasm sahifani yiqitmaydi.
   */
  async urls(ids: string[], variant: Variant, user: AuthContext): Promise<FileUrlsDto> {
    const files = await this.prisma.scoped.file.findMany({
      where: { id: { in: ids }, status: 'ready', deletedAt: null },
      select: FILE_SELECT,
    })
    const visible = files.filter((f) => hasPermission(user.role, FILE_RULES[f.kind].resource, 'view'))
    const signed = await Promise.all(visible.map(async (f) => [f.id, await this.signedGet(f, variant)] as const))
    return { urls: Object.fromEntries(signed), expiresAt: new Date(Date.now() + PRESIGN_TTL_SEC * 1000) }
  }

  /**
   * Imzolangan havola — huquqni CHAQIRUVCHI tekshirgan: eksportni faqat
   * so'rovchi yuklab oladi (09 §9.2), fayl turidagi umumiy huquq emas.
   */
  async downloadUrl(id: string, expiresIn?: number): Promise<string> {
    return this.signedGet(await this.find(id), 'orig', expiresIn)
  }

  /** Yumshoq o'chirish; havolalar uziladi. S3'dan — 30 kundan keyin (GC, 09 §9.10) */
  async remove(id: string, user: AuthContext): Promise<void> {
    const file = await this.lock(id)
    assertCan(user, FILE_RULES[file.kind], 'delete')
    await this.prisma.scoped.product.updateMany({ where: { imageFileId: id }, data: { imageFileId: null } })
    await this.prisma.scoped.file.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.audit.log({ action: 'file.delete', entityType: 'file', entityId: id, diff: { kind: file.kind } })
  }

  async usage(): Promise<UsageDto> {
    const { limits, used } = await this.quota()
    const byKind = await this.prisma.scoped.file.groupBy({
      by: ['kind'],
      where: { status: 'ready' },
      _sum: { sizeBytes: true },
    })
    return {
      usedBytes: used,
      limitBytes: limits.storage,
      byKind: Object.fromEntries(byKind.map((k) => [k.kind, moneyFromDb(k._sum.sizeBytes ?? 0n)])),
    }
  }

  /**
   * Server o'zi yaratgan fayl (eksport, zaxira) — to'g'ridan-to'g'ri S3'ga
   * va darhol `ready`. Kvota va takroriylik — yuklash bilan bir xil qoida.
   */
  async putDirect(kind: FileKind, mime: string, body: Buffer, originalName: string): Promise<FileRecord> {
    const rule = FILE_RULES[kind]
    const sha256 = createHash('sha256').update(body).digest('hex')
    const existing = await this.prisma.scoped.file.findFirst({ where: { sha256, kind, status: 'ready', deletedAt: null }, select: FILE_SELECT })
    if (existing) return existing

    const { tenantId } = requireTenantTx()
    const { limits } = await this.quota()
    const grown = await this.prisma.scoped.$executeRaw`
      UPDATE tenant_state SET storage_used_bytes = storage_used_bytes + ${body.length}
       WHERE tenant_id = ${tenantId}::uuid AND storage_used_bytes + ${body.length} <= ${limits.storage}`
    if (grown === 0) throw quotaError(body.length, limits.storage)

    const id = uuidv7()
    const key = `t/${tenantId}/${rule.prefix}/${id}/orig.${EXTENSIONS[mime]}`
    await this.s3.put(rule.bucket, key, body, mime)
    return this.prisma.scoped.file.create({
      data: {
        id, tenantId, kind, key, bucket: rule.bucket, mime, sizeBytes: BigInt(body.length), sha256,
        originalName, status: 'ready', uploadedById: currentContext().userId ?? null,
      },
      select: FILE_SELECT,
    })
  }

  private signedGet(file: FileRecord, variant: Variant, expiresIn?: number): Promise<string> {
    if (file.status !== 'ready') throw new NotFoundError(RESOURCE, file.id)
    const variants = (file.variants ?? {}) as Record<string, string>
    const key = variant === 'orig' ? file.key : (variants[variant] ?? file.key)
    const name = file.originalName ?? `${file.id}.${EXTENSIONS[file.mime] ?? 'bin'}`
    return this.s3.presignGet(bucketOf(file), key, FILE_RULES[file.kind].attachment ? name : undefined, expiresIn)
  }

  /** Mavjud tarkib: tayyor — qayta ishlatiladi; kutilayotgan — yangi havola; o'chirilgan — tiklanadi */
  private async reuse(existing: FileRecord, dto: PresignDto): Promise<PresignResultDto> {
    if (existing.status === 'quarantined') throw rejected(existing.id, 'shu tarkib avval rad etilgan')
    if (existing.deletedAt) {
      const restored = await this.prisma.scoped.file.update({ where: { id: existing.id }, data: { deletedAt: null }, select: FILE_SELECT })
      return { file: toFileDto(restored), reused: restored.status === 'ready', upload: restored.status === 'ready' ? null : await this.uploadTarget(restored) }
    }
    if (existing.status === 'ready') return { file: toFileDto(existing), reused: true, upload: null }
    // Kutilayotgan (tugallanmagan yuklash) — o'sha kalitga yangi havola, e'lon qayta yoziladi
    const pending = await this.prisma.scoped.file.update({
      where: { id: existing.id },
      data: { mime: dto.mime, sizeBytes: BigInt(dto.size), originalName: dto.originalName ?? existing.originalName },
      select: FILE_SELECT,
    })
    return { file: toFileDto(pending), reused: false, upload: await this.uploadTarget(pending) }
  }

  private async uploadTarget(file: FileRecord): Promise<PresignResultDto['upload']> {
    return {
      url: await this.s3.presignPut(bucketOf(file), file.key, file.mime, Number(file.sizeBytes)),
      method: 'PUT',
      headers: { 'Content-Type': file.mime },
      expiresAt: new Date(Date.now() + PRESIGN_TTL_SEC * 1000),
    }
  }

  /** Nima noto'g'ri — yoki `null`: hajm, sehrli baytlar, tarkib xeshi */
  private async inspect(file: FileRecord, size: number): Promise<string | null> {
    if (size !== Number(file.sizeBytes)) return `hajm ${size}, e’lon qilingan ${file.sizeBytes}`
    const bucket = bucketOf(file)
    const head = await this.s3.head(bucket, file.key, MAGIC_HEAD_BYTES)
    if (!matchesMagic(head, file.mime)) return `tarkib ${file.mime} emas`
    if (size <= SHA_VERIFY_MAX_BYTES && (await this.s3.sha256(bucket, file.key)) !== file.sha256) {
      return 'tarkib xeshi mos emas'
    }
    return null
  }

  /** Karantin: obyekt darhol o'chadi, holat va audit SAQLANADI, mijozga 422 */
  private async quarantine(file: FileRecord, reason: string): Promise<never> {
    await this.s3.delete(bucketOf(file), [file.key])
    await this.prisma.scoped.file.update({ where: { id: file.id }, data: { status: 'quarantined' } })
    await this.audit.log({
      action: 'file.quarantine',
      entityType: 'file',
      entityId: file.id,
      detail: reason,
      diff: { kind: file.kind, mime: file.mime },
    })
    throw new CommittedDomainError(rejected(file.id, reason))
  }

  private async quota(): Promise<{ limits: { storage: number; file: number }; used: number }> {
    const { tenantId } = requireTenantTx()
    const [tenant, state] = await Promise.all([
      this.prisma.scoped.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { plan: true } }),
      this.prisma.scoped.tenantState.findUniqueOrThrow({ where: { tenantId }, select: { storageUsedBytes: true } }),
    ])
    const limits = planLimits(tenant.plan)
    return { limits: { storage: limits.storageBytes, file: limits.fileBytes }, used: Number(state.storageUsedBytes) }
  }

  /** O'chirilmagan fayl; boshqa tenantniki — 404 (mavjudligi oshkor qilinmaydi) */
  private async find(id: string): Promise<FileRecord> {
    const file = await this.prisma.scoped.file.findFirst({ where: { id, deletedAt: null }, select: FILE_SELECT })
    if (!file) throw new NotFoundError(RESOURCE, id)
    return file
  }

  /** Qator qulfi: parallel tasdiqlash hisoblagichni ikki marta oshirmasin */
  private async lock(id: string): Promise<FileRecord> {
    const { tenantId } = requireTenantTx()
    const [row] = await this.prisma.scoped.$queryRaw<{ id: string }[]>`
      SELECT id FROM files WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`
    if (!row) throw new NotFoundError(RESOURCE, id)
    return this.find(id)
  }
}

/** Bazada mantiqiy nom (`media`/`backup`); haqiqiy bucket — sozlamadan (S3Service) */
function bucketOf(file: FileRecord): BucketName {
  return file.bucket as BucketName
}

function assertCan(user: AuthContext, rule: FileRule, action: 'view' | 'create' | 'delete'): void {
  if (!hasPermission(user.role, rule.resource, action)) throw new PermissionDeniedError()
}

function quotaError(used: number, limit: number): DomainError {
  return new DomainError('STORAGE_QUOTA_EXCEEDED', `Saqlash hajmi ${limit} bayt — band: ${used}`, [
    { field: 'size', code: 'STORAGE_QUOTA_EXCEEDED', meta: { used, limit } },
  ])
}

function rejected(id: string, reason: string): DomainError {
  return new DomainError('FILE_REJECTED', `Fayl rad etildi: ${reason}`, [{ field: 'id', code: 'FILE_REJECTED', meta: { id } }])
}

export function toFileDto(f: FileRecord): FileDto {
  return {
    id: f.id,
    kind: f.kind,
    mime: f.mime,
    sizeBytes: Number(f.sizeBytes),
    sha256: f.sha256,
    originalName: f.originalName,
    status: f.status,
    variants: Object.keys((f.variants ?? {}) as Record<string, string>),
    createdAt: f.createdAt,
  }
}
