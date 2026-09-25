import { ConfigService } from '@nestjs/config'
import { parseEnv, type Env } from '@/config/env.schema'
import { uuidv7 } from '@/common/ids'
import { S3Service } from '@/modules/files/s3.service'

/**
 * Production bucket'lari (T-118, 11 §11.6) — haqiqiy R2 bilan, faqat
 * `S3_SMOKE_*` o'zgaruvchilari berilganda (CI'da maxfiy o'zgaruvchi, lokal —
 * qo'lda). Tekshiriladi: ikkala bucket bor va token ularga yozadi, bucket
 * ochiq EMAS, CORS faqat frontend domeni uchun, presigned PUT ishlaydi.
 *
 *   S3_SMOKE_ENDPOINT=https://<acc>.r2.cloudflarestorage.com S3_SMOKE_ACCESS_KEY=… \
 *   S3_SMOKE_SECRET_KEY=… S3_SMOKE_ORIGIN=https://crm.domen.uz npm run test:e2e -- s3-prod-smoke
 */
const smoke = {
  endpoint: process.env.S3_SMOKE_ENDPOINT,
  accessKey: process.env.S3_SMOKE_ACCESS_KEY,
  secretKey: process.env.S3_SMOKE_SECRET_KEY,
  bucket: process.env.S3_SMOKE_BUCKET ?? 'crm-media-prod',
  backupBucket: process.env.S3_SMOKE_BACKUP_BUCKET ?? 'crm-backup-prod',
  origin: process.env.S3_SMOKE_ORIGIN,
}

describe.skipIf(!smoke.endpoint || !smoke.accessKey || !smoke.secretKey || !smoke.origin)('R2 production smoke', () => {
  // Faqat ishga tushganda (o'tkazib yuborilsa — muhit tekshirilmaydi)
  let s3: S3Service
  beforeAll(() => {
    s3 = new S3Service(
      new ConfigService<Env, true>(
        parseEnv({
          ...process.env,
          S3_ENDPOINT: smoke.endpoint,
          S3_ACCESS_KEY: smoke.accessKey,
          S3_SECRET_KEY: smoke.secretKey,
          S3_BUCKET: smoke.bucket,
          S3_BACKUP_BUCKET: smoke.backupBucket,
          S3_FORCE_PATH_STYLE: 'true',
          S3_REGION: 'auto',
        }),
      ),
    )
  })
  const key = `t/smoke/${uuidv7()}/orig.csv`
  const body = Buffer.from('smoke;test\n')

  afterAll(async () => {
    await s3.delete('media', [key])
  })

  it('ikkala bucket bor va token ularga kira oladi', async () => {
    await expect(s3.onApplicationBootstrap()).resolves.toBeUndefined()
  })

  it('presigned PUT (brauzer kabi) va o‘qish; imzosiz havola — rad (bucket ochiq emas)', async () => {
    const url = await s3.presignPut('media', key, 'text/csv', body.length)
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/csv', Origin: smoke.origin! }, body })
    expect(put.status).toBe(200)
    expect(put.headers.get('access-control-allow-origin')).toBe(smoke.origin)

    const signed = new URL(await s3.presignGet('media', key))
    expect((await fetch(signed)).status).toBe(200)
    expect((await fetch(`${signed.origin}${signed.pathname}`)).status).toBeGreaterThanOrEqual(400)
  })

  it('CORS: frontend domeniga ruxsat, begona domenga — yo‘q', async () => {
    const url = await s3.presignPut('media', key, 'text/csv', body.length)
    const preflight = (origin: string) =>
      fetch(url, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' },
      })
    expect((await preflight(smoke.origin!)).headers.get('access-control-allow-origin')).toBe(smoke.origin)
    expect((await preflight('https://begona.example')).headers.get('access-control-allow-origin')).toBeNull()
  })
})
