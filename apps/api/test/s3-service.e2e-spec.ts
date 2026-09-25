import { ConfigService } from '@nestjs/config'
import { parseEnv, type Env } from '@/config/env.schema'
import { S3Service } from '@/modules/files/s3.service'
import { uuidv7 } from '@/common/ids'
import { pngImage, sha256 } from './helpers/files'

/**
 * S3 mijozi (T-086) — haqiqiy MinIO bilan (R2 bilan bir xil API, faqat
 * `S3_ENDPOINT` farq qiladi). Imzo shartlari brauzer tomonidan emas, S3
 * tomonidan tekshirilishi — shu testning asosiy maqsadi.
 */
describe('S3Service (MinIO)', () => {
  /** Ilovadagi kabi — sxemadan o'tgan (tiplangan) muhit */
  const configOf = (overrides: NodeJS.ProcessEnv = {}) =>
    new ConfigService<Env, true>(parseEnv({ ...process.env, ...overrides }))
  const s3 = new S3Service(configOf())
  const key = (name: string) => `t/s3-test/${uuidv7()}/${name}`

  it('ishga tushishda bucketlar tekshiriladi; yo‘q bucket — ilova ko‘tarilmaydi', async () => {
    await expect(s3.onApplicationBootstrap()).resolves.toBeUndefined()
    const broken = new S3Service(configOf({ S3_BUCKET: 'crm-yoq-bucket' }))
    await expect(broken.onApplicationBootstrap()).rejects.toThrow('crm-yoq-bucket')
  })

  it('yozish, hajm, bosh baytlar, xesh, o‘qish, o‘chirish', async () => {
    const body = await pngImage(64, 64)
    const k = key('orig.png')
    expect(await s3.size('media', k)).toBeNull()

    await s3.put('media', k, body, 'image/png')
    expect(await s3.size('media', k)).toBe(body.length)
    expect([...(await s3.head('media', k, 8))]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(await s3.sha256('media', k)).toBe(sha256(body))
    expect((await s3.getBuffer('media', k)).equals(body)).toBe(true)

    await s3.delete('media', [k, key('yoq.png')])
    expect(await s3.size('media', k)).toBeNull()
  })

  it('presigned PUT: MIME va hajm imzoda — boshqasini yuborib bo‘lmaydi; TTL 10 daqiqa', async () => {
    const body = Buffer.from('nom;narx\nSement;60000\n')
    const k = key('orig.csv')
    const url = await s3.presignPut('media', k, 'text/csv', body.length)
    expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('600')

    const wrongType = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/html' }, body })
    expect(wrongType.status).toBe(403)
    const wrongSize = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/csv' }, body: Buffer.concat([body, body]) })
    expect(wrongSize.status).toBe(403)
    expect(await s3.size('media', k)).toBeNull()

    const ok = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/csv' }, body })
    expect(ok.status).toBe(200)
    expect(await s3.size('media', k)).toBe(body.length)
    await s3.delete('media', [k])
  })

  it('presigned GET: yuklab olish nomi (attachment) va zaxira bucket alohida', async () => {
    const body = Buffer.from('{"a":1}')
    const k = key('orig.json')
    await s3.put('backup', k, body, 'application/json')
    expect(await s3.size('media', k)).toBeNull()

    const res = await fetch(await s3.presignGet('backup', k, 'hisobot 2026.json'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toBe("attachment; filename*=UTF-8''hisobot%202026.json")
    expect(await res.text()).toBe('{"a":1}')
    await s3.delete('backup', [k])
  })
})
