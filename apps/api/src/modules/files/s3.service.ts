import { createHash } from 'node:crypto'
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, NotFound,
  PutObjectCommand, S3Client, S3ServiceException,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Env } from '@/config/env.schema'

/** Presigned havolalar muddati — 10 daqiqadan oshmaydi (09 §9.16) */
export const PRESIGN_TTL_SEC = 600
/** DeleteObjects bir so'rovda ko'pi bilan 1000 kalit (S3 cheklovi) */
const DELETE_BATCH = 1_000

export type BucketName = 'media' | 'backup'

/**
 * S3 mijozi (09 §9.3): MinIO (lokal) va R2 (prod) bilan bir xil — faqat
 * `S3_ENDPOINT` almashadi. Bucketlar ochiq EMAS: o'qish ham yozish ham
 * qisqa muddatli imzolangan havola orqali.
 */
@Injectable()
export class S3Service implements OnApplicationBootstrap {
  private readonly logger = new Logger(S3Service.name)
  private readonly client: S3Client
  private readonly buckets: Readonly<Record<BucketName, string>>

  constructor(config: ConfigService<Env, true>) {
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      // R2: SDK (>= 3.729) sukut bo'yicha qo'shadigan CRC32 checksum sarlavhalarini qabul
      // qilmaydi — checksum faqat operatsiya talab qilganda (Cloudflare tavsiyasi; MinIO ham)
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
    })
    this.buckets = {
      media: config.get('S3_BUCKET', { infer: true }),
      backup: config.get('S3_BACKUP_BUCKET', { infer: true }),
    }
  }

  bucketName(bucket: BucketName): string {
    return this.buckets[bucket]
  }

  /** Ishga tushishda: bucketlar mavjud va kalitga ruxsat bor — aks holda ilova ko'tarilmaydi */
  async onApplicationBootstrap(): Promise<void> {
    await Promise.all(
      Object.values(this.buckets).map((bucket) =>
        this.client.send(new HeadBucketCommand({ Bucket: bucket })).catch((err: unknown) => {
          this.logger.error({ err, bucket }, 'S3 bucket topilmadi yoki kalitga ruxsat yo‘q')
          throw new Error(`S3 bucket "${bucket}" mavjud emas yoki unga ruxsat yo'q`)
        }),
      ),
    )
  }

  /**
   * Yuklash havolasi: MIME va hajm IMZOGA kiradi — mijoz boshqa tur yoki
   * hajm yubora olmaydi (09 §9.6).
   */
  presignPut(bucket: BucketName, key: string, mime: string, size: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.buckets[bucket], Key: key, ContentType: mime, ContentLength: size }),
      { expiresIn: PRESIGN_TTL_SEC, signableHeaders: new Set(['content-type', 'content-length']) },
    )
  }

  /** O'qish havolasi; `attachment` — brauzer ochmaydi, yuklab oladi */
  presignGet(bucket: BucketName, key: string, attachmentName?: string, expiresIn = PRESIGN_TTL_SEC): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.buckets[bucket],
        Key: key,
        ...(attachmentName !== undefined && {
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(attachmentName)}`,
        }),
      }),
      { expiresIn },
    )
  }

  /** Obyekt hajmi; yo'q bo'lsa — `null` */
  async size(bucket: BucketName, key: string): Promise<number | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.buckets[bucket], Key: key }))
      return head.ContentLength ?? 0
    } catch (err) {
      if (err instanceof NotFound || (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404)) return null
      throw err
    }
  }

  /** Boshlanish baytlari (Range) — sehrli baytlarni tekshirish uchun */
  async head(bucket: BucketName, key: string, bytes: number): Promise<Uint8Array> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key, Range: `bytes=0-${bytes - 1}` }),
    )
    return res.Body ? res.Body.transformToByteArray() : new Uint8Array()
  }

  async getBuffer(bucket: BucketName, key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }))
    return Buffer.from(res.Body ? await res.Body.transformToByteArray() : [])
  }

  /** Tarkib xeshi — oqim bo'yicha (butun fayl xotiraga yig'ilmaydi) */
  async sha256(bucket: BucketName, key: string): Promise<string> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.buckets[bucket], Key: key }))
    const hash = createHash('sha256')
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) hash.update(chunk)
    return hash.digest('hex')
  }

  async put(bucket: BucketName, key: string, body: Buffer, mime: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.buckets[bucket], Key: key, Body: body, ContentType: mime }))
  }

  /**
   * Prefiks ostidagi HAMMA obyekt (do'kon o'chirilganda `t/{tenantId}/`).
   * Ro'yxat sahifalab (1000 tadan), har sahifa — bitta DeleteObjects.
   * Natija — o'chirilgan obyektlar soni.
   */
  async deletePrefix(bucket: BucketName, prefix: string): Promise<number> {
    let deleted = 0
    let token: string | undefined
    do {
      // Ketma-ket ATAYLAB: keyingi sahifa kaliti oldingi javobda
      // eslint-disable-next-line no-await-in-loop
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.buckets[bucket], Prefix: prefix, ContinuationToken: token }),
      )
      const keys = (page.Contents ?? []).map((o) => o.Key!).filter(Boolean)
      // eslint-disable-next-line no-await-in-loop
      if (keys.length > 0) await this.delete(bucket, keys)
      deleted += keys.length
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return deleted
  }

  /** Bir nechta obyekt — 1000 talik so'rovlar bilan; yo'q kalit xato emas */
  async delete(bucket: BucketName, keys: readonly string[]): Promise<void> {
    const batches = Array.from({ length: Math.ceil(keys.length / DELETE_BATCH) }, (_, i) =>
      keys.slice(i * DELETE_BATCH, (i + 1) * DELETE_BATCH),
    )
    await Promise.all(
      batches.map((batch) =>
        this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.buckets[bucket],
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        ),
      ),
    )
  }
}
