import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { MessageDispatcher } from '@/modules/messages/message-dispatcher'
import { SMS_PROVIDER, type SmsProvider } from '@/modules/messages/sms/sms.provider'
import { JobQueue, type JobName } from '@/modules/queue/job-queue'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedClient, seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, pngImage, putSigned, sha256 } from './helpers/files'

const sms: SmsProvider = { name: 'fake', send: async () => ({ providerId: 'fake-1' }) }

/**
 * Fon ishlari navbat orqali (T-096): amal COMMIT bo'lgandan keyin ish
 * qo'yiladi (ishchi saqlangan qatorni ko'radi); yiqilgan amal ish qo'ymaydi.
 * Ilova testda `inline` navbat bilan — ishlovchilar sinov uchun ulanadi.
 */
describe('Navbatga ulanish (T-096)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  const jobs: { name: JobName; committed: boolean }[] = []

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(SMS_PROVIDER).useValue(sms))
    const queue = app.get(JobQueue)
    // Ish bajarilayotganda qator allaqachon saqlanganmi — COMMIT'dan keyin qo'yilganini isbotlaydi
    queue.register('image-variants', async () => {
      jobs.push({ name: 'image-variants', committed: (await testDb.file.count({ where: { status: 'ready' } })) > 0 })
    })
    queue.register('sms-dispatch', async () => {
      jobs.push({ name: 'sms-dispatch', committed: (await testDb.messageRecipient.count()) > 0 })
      await app.get(MessageDispatcher).dispatch()
    })
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    jobs.length = 0
    a = await seedTenant('A do‘kon')
    auth = await bearer(app, a)
  })

  /** Ish fonda — shart bajarilguncha kutiladi */
  const waitFor = async (check: () => boolean | Promise<boolean>) => {
    const deadline = Date.now() + 3_000
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error('Ish bajarilmadi')
      await new Promise((r) => setTimeout(r, 20))
    }
  }

  it('rasm tasdiqlangach — `image-variants` (COMMIT’dan keyin); rad etilgan fayl — ish yo‘q', async () => {
    const files = filesApi(app, auth)
    const html = Buffer.from('<html></html>')
    const bad = await files.presign({ kind: 'product_image', mime: 'image/png', size: html.length, sha256: sha256(html) }).expect(200)
    await putSigned(bad.body.upload, html)
    await files.confirm(bad.body.file.id).expect(422)
    await files.upload(Buffer.from('nom;narx\n'), 'import', 'text/csv')

    await files.upload(await pngImage(20, 20))
    await waitFor(() => jobs.length > 0)
    expect(jobs).toEqual([{ name: 'image-variants', committed: true }])
  })

  it('xabar yuborilgach — `sms-dispatch` ishi darhol jo‘natadi', async () => {
    await seedClient(a.tenantId, { name: 'Ali' })
    await request(app.getHttpServer())
      .post('/api/v1/messages')
      .set('Authorization', auth)
      .set('Idempotency-Key', randomUUID())
      .send({ target: 'all', text: 'Salom {name}' })
      .expect(201)
    await waitFor(async () => (await testDb.messageRecipient.count({ where: { status: 'sent' } })) === 1)
    expect(jobs).toEqual([{ name: 'sms-dispatch', committed: true }])
  })
})
