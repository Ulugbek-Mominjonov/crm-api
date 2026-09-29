import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { SMS_PROVIDER, type SmsProvider } from '@/modules/messages/sms/sms.provider'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedClient, seedTenant, testDb, truncateAll } from './helpers/db'

/** Yubormaydi — ishchi testda aylanmaydi (`SMS_DISPATCH_INTERVAL_MS=0`); faqat SMS kanali yoqiladi */
const sms: SmsProvider = { name: 'fake', send: async () => ({ providerId: 'fake' }) }

/**
 * Xabarlar jurnali (T-076): qabul qiluvchilar serverda (mijoz / guruh /
 * qarzdorlar / hammasi), shablon o'zgaruvchilari, jurnal. Kanal — SMS
 * (Telegram — `telegram.e2e-spec`).
 */
describe('Xabarlar (/messages)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let ali: string
  let vali: string

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
    a = await seedTenant('A do‘kon')
    auth = await bearer(app, a)
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { storeName: 'Qurilish Mollari' } })
    ali = await seedClient(a.tenantId, { name: 'Ali', bonusPoints: 500n })
    vali = await seedClient(a.tenantId, { name: 'Vali' })
    await testDb.client.update({ where: { id: vali }, data: { group: 'wholesale' } })
    await testDb.client.create({ data: { tenantId: a.tenantId, name: 'Telefonsiz', phone: '' } })
    await testDb.sale.create({
      data: { tenantId: a.tenantId, number: 'CHEK-1', subtotal: 1_250_000n, total: 1_250_000n, status: 'pending', customerId: ali, date: new Date() },
    })
  })

  const api = () => request(app.getHttpServer())
  const send = (body: Record<string, unknown>, token = auth) =>
    api().post('/api/v1/messages').set('Authorization', token).set('Idempotency-Key', randomUUID()).send(body)
  const preview = (body: Record<string, unknown>) => api().post('/api/v1/messages/preview').set('Authorization', auth).send(body).expect(200)

  it('qabul qiluvchilar serverda: mijoz, guruh, qarzdorlar, hammasi (telefonsiz — yetib bormaydi)', async () => {
    const counts = { telegram: 0, unreachable: 0 }
    expect((await preview({ target: 'customer', customerId: vali })).body).toEqual({ recipients: 1, ...counts, label: 'Vali' })
    expect((await preview({ target: 'group', group: 'wholesale' })).body).toEqual({ recipients: 1, ...counts, label: 'Guruh: Ulgurji' })
    expect((await preview({ target: 'debtors' })).body).toEqual({ recipients: 1, ...counts, label: 'Qarzdorlar' })
    expect((await preview({ target: 'all' })).body).toEqual({ recipients: 2, telegram: 0, unreachable: 1, label: 'Barcha mijozlar' })
  })

  it('shablon har qabul qiluvchi uchun; jurnal holat statistikasi bilan', async () => {
    const res = await send({ target: 'debtors', text: 'Hurmatli {name}, qarzingiz {debt} so‘m, bonusingiz {bonus}. {store}', template: 'debt' }).expect(201)
    expect(res.body).toMatchObject({
      target: 'debtors', recipientLabel: 'Qarzdorlar', recipients: 1, telegram: 0, unreachable: 0, template: 'debt',
      deliveryStatus: 'queued', stats: { queued: 1, sent: 0, failed: 0, logged: 0 }, userId: a.userId,
    })
    const [row] = await testDb.messageRecipient.findMany({ where: { messageId: res.body.id } })
    expect(row).toMatchObject({ clientId: ali, channel: 'sms', status: 'queued' })
    expect(row!.text.replace(/\s/g, ' ')).toBe('Hurmatli Ali, qarzingiz 1 250 000 so‘m, bonusingiz 500. Qurilish Mollari')

    const list = await api().get('/api/v1/messages').set('Authorization', auth).expect(200)
    expect(list.body).toMatchObject({ total: 1, items: [{ id: res.body.id }] })
    expect(await testDb.auditEntry.count({ where: { action: 'message.send' } })).toBe(1)
  })

  it('Telegram bot sozlanmagan: botga ulangan mijoz ham SMS kanalida', async () => {
    await testDb.client.update({ where: { id: ali }, data: { telegramChatId: 5_000_000_001n } })
    const res = await send({ target: 'customer', customerId: ali, text: 'x' }).expect(201)
    expect(res.body).toMatchObject({ telegram: 0, deliveryStatus: 'queued' })
    expect(await testDb.messageRecipient.findFirstOrThrow({ where: { messageId: res.body.id } })).toMatchObject({ channel: 'sms' })
  })

  it('qabul qiluvchi yo‘q — 400; mijoz tanlanmagan — 400; omborchi yubora olmaydi', async () => {
    await send({ target: 'group', group: 'vip', text: 'x' }).expect(400)
    await send({ target: 'customer', text: 'x' }).expect(400)
    await send({ target: 'all', text: 'x' }, await bearer(app, a, 'omborchi')).expect(403)
  })
})

/**
 * Hech bir kanal sozlanmagan (bot ham, SMS ham yo'q): xabar yetib bormaydi —
 * 422 `RECIPIENT_UNREACHABLE` (avvalgi "demo" jurnal yo'q), Telegram yo'llari yopiq (Q116)
 */
describe('Xabarlar — kanal sozlanmagan', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let ali: string

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
    auth = await bearer(app, a)
    ali = await seedClient(a.tenantId, { name: 'Ali' })
  })

  const api = () => request(app.getHttpServer())

  it('xabar, havola va chek — 422 `no_channel`; bot holati o‘chiq; webhook yopiq', async () => {
    const res = await api().post('/api/v1/messages').set('Authorization', auth).set('Idempotency-Key', randomUUID())
      .send({ target: 'customer', customerId: ali, text: 'x' }).expect(422)
    expect(res.body).toMatchObject({ code: 'RECIPIENT_UNREACHABLE', errors: [{ meta: { reason: 'no_channel' } }] })
    expect((await api().post('/api/v1/messages/preview').set('Authorization', auth).send({ target: 'all' }).expect(200)).body)
      .toEqual({ recipients: 0, telegram: 0, unreachable: 1, label: 'Barcha mijozlar' })
    expect(await testDb.message.count()).toBe(0)

    expect((await api().get('/api/v1/telegram').set('Authorization', auth).expect(200)).body).toEqual({ enabled: false, botUsername: null })
    await api().post(`/api/v1/clients/${ali}/telegram-link`).set('Authorization', auth).expect(422)
    const sale = await testDb.sale.create({
      data: { tenantId: a.tenantId, number: 'CHEK-1', subtotal: 1_000n, total: 1_000n, status: 'pending', customerId: ali, date: new Date() },
    })
    expect((await api().post(`/api/v1/sales/${sale.id}/receipt/telegram`).set('Authorization', auth).expect(422)).body)
      .toMatchObject({ errors: [{ meta: { reason: 'no_channel' } }] })
    await api().post('/api/v1/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', process.env.TELEGRAM_WEBHOOK_SECRET!)
      .send({ update_id: 1 }).expect(401)
  })
})
