import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { NoSuchKey } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import type { Env } from '@/config/env.schema'
import { JobQueue } from '@/modules/queue/job-queue'
import { PrismaService } from '@/prisma/prisma.service'
import { S3Service, type BucketName } from './s3.service'

/** Server yasaydigan kengliklar (09 §9.8); `orig` ni brauzer ≤ 1600 px qilib yuklaydi */
export const VARIANT_WIDTHS = [128, 512] as const
const WEBP_QUALITY = 78
const WEBP_MIME = 'image/webp'
/** Bir aylanishda bir tenantdan olinadigan rasmlar */
const BATCH_SIZE = 20
/**
 * Piksel chegarasi: "dekompressiya bombasi" (kichik fayl, ulkan o'lcham)
 * 512 MB instansiyani yiqitmasin. Brauzer ≤ 1600 px yuboradi — 25 Mpx katta zaxira.
 */
const MAX_INPUT_PIXELS = 25_000_000

interface Claimed {
  id: string
  key: string
  bucket: string
}

/**
 * `variants`: kalitlar — tayyor; `{}` — rasm o'qilmadi yoki asl obyekt yo'q
 * (qayta urinish befoyda, faqat `orig`); `null` — S3 xatosi, navbatga qaytadi.
 */
interface Outcome {
  id: string
  variants: Record<string, string> | null
}

/**
 * Mahsulot rasmlarining `128`/`512` WebP variantlari (T-091). Fon ishi:
 * so'rovni kutdirmaydi, variant tayyor bo'lguncha `orig` beriladi
 * (`GET /files/:id/raw`). Ish o'chiq bo'lsa (`FILE_VARIANTS_INTERVAL_MS=0`)
 * ilova buzilmaydi — rasmlar shunchaki og'irroq.
 *
 * - Olish — `variants = '{}'` belgisi bilan (`SKIP LOCKED`): bir necha
 *   instansiya bitta rasmni ikki marta yasamaydi
 * - Yasash — tranzaksiyadan TASHQARIDA, bir vaqtda BITTA rasm (`concurrency: 1`)
 */
@Injectable()
export class ImageVariantsWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImageVariantsWorker.name)
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly config: ConfigService<Env, true>,
    private readonly scheduler: SchedulerRegistry,
    private readonly queue: JobQueue,
  ) {}

  /** Tasdiqlangan rasm navbat orqali darhol uyg'otadi; interval — zaxira (navbat ishi yo'qolsa) */
  onApplicationBootstrap(): void {
    const every = this.config.get('FILE_VARIANTS_INTERVAL_MS', { infer: true })
    if (every === 0) return
    this.queue.register('image-variants', () => this.tick())
    this.scheduler.addInterval('image-variants', setInterval(() => void this.tick(), every))
  }

  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      await this.processPending()
    } catch (err) {
      this.logger.error({ err }, 'Rasm variantlari aylanishi yiqildi')
    } finally {
      this.running = false
    }
  }

  /** Navbatdagi barcha rasmlar; natija — variantlari yasalganlar soni */
  async processPending(): Promise<number> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT tenants_with_pending_variants() AS id`
    let built = 0
    for (const { id } of tenants) built += await this.processTenant(id)
    return built
  }

  private async processTenant(tenantId: string): Promise<number> {
    const claimed = await this.prisma.inTenantTransaction(tenantId, (tx) =>
      tx.$queryRaw<Claimed[]>`
        UPDATE files f SET variants = '{}'::jsonb
         WHERE f.id IN (
                 SELECT id FROM files
                  WHERE tenant_id = ${tenantId}::uuid AND status = 'ready' AND kind = 'product_image'
                    AND variants IS NULL AND deleted_at IS NULL
                  ORDER BY created_at
                  LIMIT ${BATCH_SIZE}
                    FOR UPDATE SKIP LOCKED)
        RETURNING f.id, f.key, f.bucket`,
    )
    if (claimed.length === 0) return 0

    const outcomes: Outcome[] = []
    for (const file of claimed) outcomes.push(await this.build(file))

    await this.prisma.inTenantTransaction(tenantId, (tx) =>
      tx.$executeRaw`
        UPDATE files f SET variants = o.variants
          FROM jsonb_to_recordset(${JSON.stringify(outcomes)}::jsonb) AS o(id uuid, variants jsonb)
         WHERE f.tenant_id = ${tenantId}::uuid AND f.id = o.id`,
    )
    return outcomes.filter((o) => o.variants && Object.keys(o.variants).length > 0).length
  }

  private async build(file: Claimed): Promise<Outcome> {
    const bucket = file.bucket as BucketName
    try {
      const rendered = await this.render(file.id, await this.s3.getBuffer(bucket, file.key))
      if (!rendered) return { id: file.id, variants: {} }
      const variants: Record<string, string> = {}
      for (const { width, body } of rendered) {
        const key = file.key.replace(/orig\.\w+$/, `${width}.webp`)
        await this.s3.put(bucket, key, body, WEBP_MIME)
        variants[String(width)] = key
      }
      return { id: file.id, variants }
    } catch (err) {
      // Asl obyekt yo'q — qayta urinish befoyda; boshqa S3 xatosi vaqtinchalik
      const missing = err instanceof NoSuchKey
      this.logger.warn(
        { err, fileId: file.id },
        missing ? 'Rasm variantlari: asl obyekt yo‘q' : 'Rasm variantlari: S3 xatosi — keyingi aylanishda qayta',
      )
      return { id: file.id, variants: missing ? {} : null }
    }
  }

  /** Rasm o'qilmasa (buzilgan, juda katta) — `null` */
  private async render(fileId: string, source: Buffer): Promise<{ width: number; body: Buffer }[] | null> {
    const out: { width: number; body: Buffer }[] = []
    try {
      for (const width of VARIANT_WIDTHS) {
        const body = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
          // EXIF yo'nalishi qo'llanadi (telefon surati yonboshlab qolmasin), metama'lumot tashlanadi
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer()
        out.push({ width, body })
      }
      return out
    } catch (err) {
      this.logger.warn({ err, fileId }, 'Rasm o‘qilmadi — variantsiz qoladi, asl fayl ishlatiladi')
      return null
    }
  }
}
