import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { MessageDispatcher } from '@/modules/messages/message-dispatcher'
import { SMS_PROVIDER, SmsSendError, type SmsProvider } from '@/modules/messages/sms/sms.provider'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedClient, seedTenant, testDb, truncateAll } from './helpers/db'

/** Sinov provayderi: yuborilganlarni yozadi, berilgan raqamlarga xato qaytaradi */
class FakeSms implements SmsProvider {
  readonly name = 'fake'
  readonly sent: { phone: string; text: string }[] = []
  failures = new Map<string, SmsSendError>()

  async send(phone: string, text: string): Promise<{ providerId: string }> {
    const failure = this.failures.get(phone)
    if (failure) throw failure
    this.sent.push({ phone, text })
    return { providerId: `fake-${this.sent.length}` }
  }
}

/**
 * Yuborish navbati (T-077) va cheklov (T-078): so'rov navbatga yozadi va
 * darhol qaytadi, ishchi yuboradi; xato — qayta urinish; kunlik chegara.
 */
describe('SMS navbati va chegarasi', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  const sms = new FakeSms()

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(SMS_PROVIDER).useValue(sms))
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    sms.sent.length = 0
    sms.failures.clear()
    a = await seedTenant('A do‘kon')
    // Kunlik chegara — provayder cheklovi (env, 1000); tarif chegarasi undan katta (T-125)
    await testDb.tenant.update({ where: { id: a.tenantId }, data: { plan: 'pro' } })
    auth = await bearer(app, a)
  })

  const send = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/v1/messages').set('Authorization', auth).set('Idempotency-Key', randomUUID()).send(body)
  const dispatcher = () => app.get(MessageDispatcher)
  /** Keyingi urinish vaqtini "hozir" ga surish — kutmasdan */
  const makeDue = () => testDb.messageRecipient.updateMany({ data: { nextAttemptAt: new Date(Date.now() - 1_000) } })

  it('so‘rov navbatga yozib darhol qaytadi; ishchi yuboradi', async () => {
    const c = await seedClient(a.tenantId, { name: 'Ali' })
    const res = await send({ target: 'customer', customerId: c, text: 'Salom {name}' }).expect(201)
    expect(res.body).toMatchObject({ deliveryStatus: 'queued', stats: { queued: 1 } })
    expect(sms.sent).toHaveLength(0)

    expect(await dispatcher().dispatch()).toEqual({ sent: 1, retried: 0, failed: 0 })
    expect(sms.sent).toEqual([{ phone: '+998901112233', text: 'Salom Ali' }])
    const message = await testDb.message.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(message.deliveryStatus).toBe('sent')
    // Ikkinchi aylanish — ish yo'q
    expect(await dispatcher().dispatch()).toEqual({ sent: 0, retried: 0, failed: 0 })
  })

  it('vaqtinchalik xato — qayta urinish; qayta urinish befoyda xato — darhol failed', async () => {
    const flaky = await seedClient(a.tenantId, { name: 'Flaky' })
    await testDb.client.update({ where: { id: flaky }, data: { phone: '+998900000001' } })
    const bad = await seedClient(a.tenantId, { name: 'Bad' })
    await testDb.client.update({ where: { id: bad }, data: { phone: '+998900000002' } })
    sms.failures.set('+998900000001', new SmsSendError('503', true))
    sms.failures.set('+998900000002', new SmsSendError('invalid phone', false))

    const res = await send({ target: 'all', text: 'x' }).expect(201)
    expect(await dispatcher().dispatch()).toEqual({ sent: 0, retried: 1, failed: 1 })
    const flakyRow = await testDb.messageRecipient.findFirstOrThrow({ where: { clientId: flaky } })
    expect(flakyRow).toMatchObject({ status: 'queued', attempts: 1, error: '503' })
    expect(flakyRow.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000)

    // Muddati kelmagan — urinilmaydi
    expect(await dispatcher().dispatch()).toEqual({ sent: 0, retried: 0, failed: 0 })
    sms.failures.delete('+998900000001')
    await makeDue()
    expect(await dispatcher().dispatch()).toEqual({ sent: 1, retried: 0, failed: 0 })
    const message = await testDb.message.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(message.deliveryStatus).toBe('partial')
  })

  it('urinishlar tugasa — failed', async () => {
    const c = await seedClient(a.tenantId)
    sms.failures.set('+998901112233', new SmsSendError('down', true))
    await send({ target: 'customer', customerId: c, text: 'x' }).expect(201)
    for (let i = 0; i < 3; i++) {
      await makeDue()
      await dispatcher().dispatch()
    }
    expect(await testDb.messageRecipient.findFirstOrThrow()).toMatchObject({ status: 'failed', attempts: 3 })
    expect((await testDb.message.findFirstOrThrow()).deliveryStatus).toBe('failed')
  })

  it('kunlik chegara (T-078): bugungi jami + yangi > chegara — 429', async () => {
    await seedClient(a.tenantId)
    await testDb.message.create({
      data: { tenantId: a.tenantId, target: 'all', recipientLabel: 'x', recipients: 1000, text: 'x' },
    })
    const res = await send({ target: 'all', text: 'x' }).expect(429)
    expect(res.body).toMatchObject({ code: 'MESSAGE_LIMIT_EXCEEDED', errors: [{ meta: { limit: 1000, used: 1000, requested: 1 } }] })
    // Kechagi xabarlar hisobga kirmaydi
    await testDb.message.updateMany({ data: { createdAt: new Date(Date.now() - 36 * 3600 * 1000) } })
    await send({ target: 'all', text: 'x' }).expect(201)
  })

  it('boshqa do‘kon navbati bu tenantning ishchisida aralashmaydi', async () => {
    const b = await seedTenant('B do‘kon')
    const bClient = await seedClient(b.tenantId)
    await testDb.client.update({ where: { id: bClient }, data: { phone: '+998977777777' } })
    const bAuth = await bearer(app, b)
    await request(app.getHttpServer()).post('/api/v1/messages').set('Authorization', bAuth).set('Idempotency-Key', randomUUID())
      .send({ target: 'all', text: 'B uchun' }).expect(201)
    await seedClient(a.tenantId)
    await send({ target: 'all', text: 'A uchun' }).expect(201)
    expect(await dispatcher().dispatch()).toEqual({ sent: 2, retried: 0, failed: 0 })
    expect(sms.sent.map((s) => [s.phone, s.text]).sort()).toEqual([['+998901112233', 'A uchun'], ['+998977777777', 'B uchun']])
  })
})
