import { createHash } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import type { FileKind } from '@prisma/client'
import sharp from 'sharp'
import request from 'supertest'
import { uuidv7 } from '@/common/ids'
import { testDb } from './db'

export const sha256 = (body: Buffer): string => createHash('sha256').update(body).digest('hex')

/** Haqiqiy PNG (sharp): sehrli baytlar ham, variant yasash ham ishlaydi */
export function pngImage(width = 800, height = 600, seed = 40): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: seed } } })
    .png()
    .toBuffer()
}

export interface UploadTarget {
  url: string
  headers: Record<string, string>
}

/** Imzolangan havolaga PUT — brauzer qiladigan ish */
export function putSigned(upload: UploadTarget, body: Buffer, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(upload.url, { method: 'PUT', headers: { ...upload.headers, ...headers }, body })
}

export function filesApi(app: INestApplication, auth: string) {
  const api = () => request(app.getHttpServer())
  const presign = (body: Record<string, unknown>) =>
    api().post('/api/v1/files/presign').set('Authorization', auth).send(body)
  const confirm = (id: string) => api().post(`/api/v1/files/${id}/confirm`).set('Authorization', auth)
  return {
    presign,
    confirm,
    get: (id: string) => api().get(`/api/v1/files/${id}`).set('Authorization', auth),
    raw: (id: string, variant?: string) =>
      api().get(`/api/v1/files/${id}/raw${variant ? `?variant=${variant}` : ''}`).set('Authorization', auth),
    remove: (id: string) => api().delete(`/api/v1/files/${id}`).set('Authorization', auth),
    usage: () => api().get('/api/v1/files/usage').set('Authorization', auth),

    /** Presign → PUT → confirm: tayyor (`ready`) fayl */
    async upload(body: Buffer, kind: FileKind = 'product_image', mime = 'image/png', originalName?: string) {
      const res = await presign({ kind, mime, size: body.length, sha256: sha256(body), originalName }).expect(200)
      if (res.body.upload) {
        const put = await putSigned(res.body.upload as UploadTarget, body)
        if (!put.ok) throw new Error(`PUT ${put.status}: ${await put.text()}`)
        await confirm(res.body.file.id as string).expect(200)
      }
      return res.body.file.id as string
    },
  }
}

/** Bazada tayyor fayl qatori (S3 obyektisiz) — izolyatsiya va GC holatlari uchun */
export async function seedFileRow(
  tenantId: string,
  overrides: Partial<{
    kind: FileKind
    status: 'pending' | 'ready' | 'quarantined'
    sizeBytes: bigint
    createdAt: Date
    deletedAt: Date | null
  }> = {},
): Promise<{ id: string; key: string }> {
  const id = uuidv7()
  const key = `t/${tenantId}/products/${id}/orig.png`
  await testDb.file.create({
    data: {
      id, tenantId, key, bucket: 'media', mime: 'image/png', kind: overrides.kind ?? 'product_image',
      sizeBytes: overrides.sizeBytes ?? 100n, sha256: sha256(Buffer.from(id)), status: overrides.status ?? 'ready',
      createdAt: overrides.createdAt, deletedAt: overrides.deletedAt ?? null,
    },
  })
  return { id, key }
}
