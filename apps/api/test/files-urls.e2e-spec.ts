import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, pngImage, seedFileRow } from './helpers/files'

/**
 * Ro'yxatdagi rasmlar havolasi (E13): `<img src>` token yubora olmaydi,
 * har rasmga alohida `raw` so'rovi esa N+1 — bitta so'rovda id → havola.
 */
describe('Fayl havolalari (GET /files/urls)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
  let auth: string

  beforeAll(async () => {
    app = await createTestApp()
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    a = await seedTenant('A do‘kon')
    b = await seedTenant('B do‘kon')
    auth = await bearer(app, a)
  })

  const urls = (ids: string[], variant?: string, token = auth) =>
    request(app.getHttpServer()).get('/api/v1/files/urls').set('Authorization', token)
      .query({ ids: ids.join(','), ...(variant && { variant }) })

  it('bir so‘rovda: id → imzolangan havola (brauzer to‘g‘ridan-to‘g‘ri oladi); yo‘q, tayyor emas, begona — tushib qoladi', async () => {
    const body = await pngImage(30, 30)
    const ready = await filesApi(app, auth).upload(body)
    const pending = (await seedFileRow(a.tenantId, { status: 'pending' })).id
    const deleted = (await seedFileRow(a.tenantId, { deletedAt: new Date() })).id
    const foreign = (await seedFileRow(b.tenantId)).id

    const res = await urls([ready, pending, deleted, foreign, '00000000-0000-4000-8000-000000000000']).expect(200)
    expect(Object.keys(res.body.urls)).toEqual([ready])
    expect(Date.parse(res.body.expiresAt) - Date.now()).toBeLessThanOrEqual(600_000)
    // Variant tayyor emas — asl fayl; imzo bilan S3'dan aynan o'sha baytlar
    const fetched = await fetch(res.body.urls[ready])
    expect(Buffer.from(await fetched.arrayBuffer()).equals(body)).toBe(true)
  })

  it('huquq fayl TURI bo‘yicha: sotuvchi eksport faylini ko‘rmaydi; noto‘g‘ri id, bo‘sh yoki 100 dan ortiq — 400', async () => {
    const image = (await seedFileRow(a.tenantId)).id
    const exported = (await seedFileRow(a.tenantId, { kind: 'export' })).id
    const seller = await bearer(app, a, 'omborchi')
    expect(Object.keys((await urls([image, exported], 'orig', seller).expect(200)).body.urls)).toEqual([image])
    expect(Object.keys((await urls([image, exported], 'orig').expect(200)).body.urls).sort()).toEqual([exported, image].sort())

    await urls(['yoq']).expect(400)
    await urls([]).expect(400)
    await urls(Array.from({ length: 101 }, () => crypto.randomUUID())).expect(400)
    await urls([image], 'huge').expect(400)
  })
})
