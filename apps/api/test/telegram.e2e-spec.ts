import { createHash, randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { MessageDispatcher } from '@/modules/messages/message-dispatcher'
import { SMS_PROVIDER, type SmsProvider } from '@/modules/messages/sms/sms.provider'
import {
  TELEGRAM_CLIENT, TelegramApiError, type SendOptions, type TelegramClient, type TelegramFile, type TelegramUpdate,
  type TelegramUser,
} from '@/modules/telegram/telegram.client'
import { BOT_TEXT } from '@/modules/telegram/telegram-texts'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedClient, seedTenant, testDb, truncateAll } from './helpers/db'

/** Soxta bot: yuborilganlarni yozadi, berilgan chatlarga xato qaytaradi */
class FakeTelegram implements TelegramClient {
  readonly sent: { chatId: number; text: string; opts?: SendOptions }[] = []
  readonly documents: { chatId: number; file: TelegramFile; caption: string }[] = []
  failures = new Map<number, TelegramApiError>()

  reset(): void {
    this.sent.length = 0
    this.documents.length = 0
    this.failures.clear()
  }

  async getMe(): Promise<TelegramUser> {
    return { id: 1, username: 'dokon_test_bot' }
  }

  async sendMessage(chatId: number, text: string, opts?: SendOptions): Promise<{ message_id: number }> {
    this.fail(chatId)
    this.sent.push({ chatId, text, opts })
    return { message_id: this.sent.length }
  }

  async sendDocument(chatId: number, file: TelegramFile, caption: string): Promise<{ message_id: number }> {
    this.fail(chatId)
    this.documents.push({ chatId, file, caption })
    return { message_id: 1000 + this.documents.length }
  }

  async setWebhook(): Promise<void> {}

  async getUpdates(): Promise<TelegramUpdate[]> {
    return []
  }

  private fail(chatId: number): void {
    const failure = this.failures.get(chatId)
    if (failure) throw failure
  }
}

class FakeSms implements SmsProvider {
  readonly name = 'fake'
  readonly sent: { phone: string; text: string }[] = []

  async send(phone: string, text: string): Promise<{ providerId: string }> {
    this.sent.push({ phone, text })
    return { providerId: `sms-${this.sent.length}` }
  }
}

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!
/** Shaxsiy chatda chat id = foydalanuvchi id */
const ALI_CHAT = 5_000_000_001
const STRANGER_CHAT = 5_000_000_002
const blocked403 = () => new TelegramApiError('sendMessage', 403, 'Forbidden: bot was blocked by the user')

/** Umumiy yordamchilar: ikki ilova (faqat Telegram va Telegram + SMS) uchun */
function botHarness(app: () => INestApplication, telegram: FakeTelegram) {
  let updateId = 0
  const api = () => request(app().getHttpServer())
  const webhook = (update: Omit<TelegramUpdate, 'update_id'>, secret = SECRET) =>
    api().post('/api/v1/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', secret).send({ update_id: ++updateId, ...update })
  const say = (chatId: number, text: string) =>
    webhook({ message: { message_id: updateId, chat: { id: chatId, type: 'private' }, from: { id: chatId }, text } }).expect(200)
  const member = (chatId: number, status: 'kicked' | 'member') =>
    webhook({ my_chat_member: { chat: { id: chatId, type: 'private' }, new_chat_member: { status } } }).expect(200)
  /** Xodim shaxsiy havola oladi (QR) — `start` parametri */
  const issueLink = async (auth: string, clientId: string): Promise<string> => {
    const res = await api().post(`/api/v1/clients/${clientId}/telegram-link`).set('Authorization', auth).expect(200)
    return new URL(res.body.link).searchParams.get('start')!
  }
  /** Mijoz QR'ni ochib Start bosadi */
  const link = async (auth: string, clientId: string, chatId: number): Promise<void> => {
    await say(chatId, `/start ${await issueLink(auth, clientId)}`)
  }
  const lastReply = () => telegram.sent.at(-1)
  const clientRow = (id: string) => testDb.client.findUniqueOrThrow({ where: { id } })
  const telegramStatus = async (auth: string, id: string): Promise<string> =>
    (await api().get(`/api/v1/clients/${id}`).set('Authorization', auth).expect(200)).body.telegramStatus
  const sendMessage = (auth: string, body: Record<string, unknown>) =>
    api().post('/api/v1/messages').set('Authorization', auth).set('Idempotency-Key', randomUUID()).send(body)
  return { api, webhook, say, member, issueLink, link, lastReply, clientRow, telegramStatus, sendMessage }
}

/**
 * Telegram bot (Q116): mijoz SHAXSIY havola (QR) orqali Start bosib ulanadi —
 * raqam yuborish shart emas. Xabar: botga ulangan — Telegram, aks holda SMS
 * (bo'lsa), aks holda "botga ulanmagan". Chek — PDF bilan. `/stop` yo'q.
 */
describe('Telegram bot — SMS’siz (production kabi)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let ali: string
  const telegram = new FakeTelegram()
  const bot = botHarness(() => app, telegram)

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(TELEGRAM_CLIENT).useValue(telegram))
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    telegram.reset()
    a = await seedTenant('A do‘kon')
    auth = await bearer(app, a)
    ali = await seedClient(a.tenantId, { name: 'Ali' })
  })

  it('bot holati; webhook faqat to‘g‘ri sir bilan', async () => {
    expect((await bot.api().get('/api/v1/telegram').set('Authorization', auth).expect(200)).body).toEqual({
      enabled: true, botUsername: 'dokon_test_bot',
    })
    await bot.webhook({}, 'x'.repeat(SECRET.length)).expect(401)
    await bot.api().post('/api/v1/telegram/webhook').send({ update_id: 1 }).expect(401)
    await bot.webhook({}).expect(200)
  })

  it('shaxsiy havola → Start — ulanadi (raqamsiz); bazada token emas, xeshi; bir martalik', async () => {
    const res = await bot.api().post(`/api/v1/clients/${ali}/telegram-link`).set('Authorization', auth).expect(200)
    const token = new URL(res.body.link).searchParams.get('start')!
    expect(res.body.link).toBe(`https://t.me/dokon_test_bot?start=${token}`)
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(new Date(res.body.expiresAt).getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3_600_000)
    expect((await bot.clientRow(ali)).telegramLinkHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(await testDb.auditEntry.count({ where: { action: 'client.telegramLinkIssued', entityId: ali } })).toBe(1)

    await bot.say(ALI_CHAT, `/start ${token}`)
    expect(bot.lastReply()).toEqual({ chatId: ALI_CHAT, text: BOT_TEXT.linked('Qurilish Mollari', 'Ali'), opts: { html: true } })
    expect(await bot.clientRow(ali)).toMatchObject({ telegramChatId: BigInt(ALI_CHAT), telegramLinkHash: null, telegramBlockedAt: null })
    expect(await bot.telegramStatus(auth, ali)).toBe('linked')
    expect(await testDb.auditEntry.count({ where: { action: 'client.telegramLinked', entityId: ali } })).toBe(1)

    // Bir martalik: begona odam o'sha havola bilan ulana olmaydi; takroriy yangilanish — "ulangansiz"
    await bot.say(STRANGER_CHAT, `/start ${token}`)
    expect(bot.lastReply()?.text).toBe(BOT_TEXT.badLink)
    await bot.say(ALI_CHAT, `/start ${token}`)
    expect(bot.lastReply()?.text).toBe(BOT_TEXT.alreadyLinked)
    expect((await bot.clientRow(ali)).telegramChatId).toBe(BigInt(ALI_CHAT))
  })

  it('yangi havola eskisini bekor qiladi; muddati o‘tgan va faol bo‘lmagan do‘kon havolasi ishlamaydi', async () => {
    const old = await bot.issueLink(auth, ali)
    const fresh = await bot.issueLink(auth, ali)
    await bot.say(STRANGER_CHAT, `/start ${old}`)
    expect(bot.lastReply()?.text).toBe(BOT_TEXT.badLink)

    await testDb.client.update({ where: { id: ali }, data: { telegramLinkExpiresAt: new Date(Date.now() - 1_000) } })
    await bot.say(ALI_CHAT, `/start ${fresh}`)
    expect(bot.lastReply()?.text).toBe(BOT_TEXT.badLink)

    const again = await bot.issueLink(auth, ali)
    await testDb.tenant.update({ where: { id: a.tenantId }, data: { status: 'suspended' } })
    await bot.say(ALI_CHAT, `/start ${again}`)
    expect(bot.lastReply()?.text).toBe(BOT_TEXT.badLink)
    expect((await bot.clientRow(ali)).telegramChatId).toBeNull()
  })

  it('havolasiz /start, boshqa matn, /stop — to‘xtatib bo‘lmaydi; guruh chati e’tiborsiz', async () => {
    await bot.say(ALI_CHAT, '/start')
    expect(bot.lastReply()?.text).toBe(BOT_TEXT.noLink)
    await bot.link(auth, ali, ALI_CHAT)
    await bot.say(ALI_CHAT, '/start')
    expect(bot.lastReply()?.text).toBe(BOT_TEXT.alreadyLinked)
    await bot.say(ALI_CHAT, '/stop')
    expect(bot.lastReply()?.text).toBe(BOT_TEXT.help)
    expect((await bot.clientRow(ali)).telegramChatId).toBe(BigInt(ALI_CHAT))

    const before = telegram.sent.length
    await bot.webhook({ message: { message_id: 1, chat: { id: -100, type: 'group' }, from: { id: ALI_CHAT }, text: '/start' } }).expect(200)
    expect(telegram.sent).toHaveLength(before)
  })

  it('botni bloklash — "bloklagan" (bog‘lanish qoladi), qayta ochsa — davom etadi; barcha do‘konlarda', async () => {
    const b = await seedTenant('B do‘kon')
    const bAuth = await bearer(app, b)
    const bAli = await seedClient(b.tenantId, { name: 'Ali (B)' })
    await bot.link(auth, ali, ALI_CHAT)
    await bot.link(bAuth, bAli, ALI_CHAT)

    await bot.member(ALI_CHAT, 'kicked')
    for (const id of [ali, bAli]) {
      expect(await bot.clientRow(id)).toMatchObject({ telegramChatId: BigInt(ALI_CHAT), telegramBlockedAt: expect.any(Date) })
    }
    expect(await bot.telegramStatus(auth, ali)).toBe('blocked')

    await bot.member(ALI_CHAT, 'member')
    expect(await bot.telegramStatus(auth, ali)).toBe('linked')
    expect(await bot.telegramStatus(bAuth, bAli)).toBe('linked')
  })

  it('mijozlar ro‘yxati Telegram holati bo‘yicha (ulanmaganlarga QR berish uchun)', async () => {
    await seedClient(a.tenantId, { name: 'Vali' })
    const gani = await seedClient(a.tenantId, { name: 'Gani' })
    await bot.link(auth, ali, ALI_CHAT)
    await bot.link(auth, gani, STRANGER_CHAT)
    await bot.member(STRANGER_CHAT, 'kicked')
    const names = async (status: string) =>
      (await bot.api().get(`/api/v1/clients?telegramStatus=${status}`).set('Authorization', auth).expect(200)).body.items
        .map((c: { name: string }) => c.name)
    expect(await names('linked')).toEqual(['Ali'])
    expect(await names('none')).toEqual(['Vali'])
    expect(await names('blocked')).toEqual(['Gani'])
    await bot.api().get('/api/v1/clients?telegramStatus=boshqa').set('Authorization', auth).expect(400)
  })

  it('bitta mijoz: botga ulanmagan yoki bloklagan (SMS yo‘q) — 422 sababi bilan', async () => {
    const res = await bot.sendMessage(auth, { target: 'customer', customerId: ali, text: 'x' }).expect(422)
    expect(res.body).toMatchObject({
      code: 'RECIPIENT_UNREACHABLE', detail: 'Mijoz botga ulanmagan', errors: [{ meta: { reason: 'not_linked' } }],
    })
    await bot.link(auth, ali, ALI_CHAT)
    await bot.member(ALI_CHAT, 'kicked')
    expect((await bot.sendMessage(auth, { target: 'customer', customerId: ali, text: 'x' }).expect(422)).body).toMatchObject({
      detail: 'Mijoz botni bloklagan', errors: [{ meta: { reason: 'blocked' } }],
    })
    expect(await testDb.message.count()).toBe(0)
  })

  it('guruh: botga ulanganlarga yuboriladi (zamonaviy karta), ulanmaganlar soni saqlanadi; hech kim — 422', async () => {
    await seedClient(a.tenantId, { name: 'Vali' })
    await testDb.client.create({ data: { tenantId: a.tenantId, name: 'Telefonsiz', phone: '' } })
    expect((await bot.sendMessage(auth, { target: 'all', text: 'x' }).expect(422)).body).toMatchObject({
      code: 'RECIPIENT_UNREACHABLE', errors: [{ meta: { reason: 'not_linked', unreachable: 3 } }],
    })

    // Kartadagi aloqa — chekdagi telefon va manzil (sozlama keshlanishidan OLDIN)
    await testDb.settings.update({ where: { tenantId: a.tenantId }, data: { receiptPhone: '+998 71 200-00-00', receiptAddress: 'Chilonzor 5' } })
    await bot.link(auth, ali, ALI_CHAT)
    const preview = await bot.api().post('/api/v1/messages/preview').set('Authorization', auth).send({ target: 'all' }).expect(200)
    expect(preview.body).toEqual({ recipients: 1, telegram: 1, unreachable: 2, label: 'Barcha mijozlar' })

    const res = await bot.sendMessage(auth, { target: 'all', text: 'Salom {name}! Qarzingiz {debt} so‘m <aksiya>' }).expect(201)
    expect(res.body).toMatchObject({ recipients: 1, telegram: 1, unreachable: 2, deliveryStatus: 'queued', stats: { queued: 1 } })
    expect(await testDb.messageRecipient.findMany({ select: { clientId: true, channel: true } })).toEqual([{ clientId: ali, channel: 'telegram' }])
    expect(await app.get(MessageDispatcher).dispatch()).toEqual({ sent: 1, retried: 0, failed: 0 })
    expect(telegram.sent.at(-1)).toEqual({
      chatId: ALI_CHAT,
      text: '🏪 <b>Qurilish Mollari</b>\n\nSalom <b>Ali</b>! Qarzingiz <b>0</b> so‘m &lt;aksiya&gt;\n\n📞 +998 71 200-00-00\n📍 Chilonzor 5',
      opts: { html: true },
    })
    expect((await testDb.message.findUniqueOrThrow({ where: { id: res.body.id } })).deliveryStatus).toBe('sent')
  })

  it('yuborishda 403 (bloklagan) — qayta urilmaydi, mijoz "bloklagan" (bog‘lanish qoladi)', async () => {
    await bot.link(auth, ali, ALI_CHAT)
    telegram.failures.set(ALI_CHAT, blocked403())
    const res = await bot.sendMessage(auth, { target: 'customer', customerId: ali, text: 'Qarz eslatmasi' }).expect(201)
    expect(await app.get(MessageDispatcher).dispatch()).toEqual({ sent: 0, retried: 0, failed: 1 })
    expect(await testDb.messageRecipient.findFirstOrThrow({ where: { messageId: res.body.id } })).toMatchObject({ status: 'failed', attempts: 1 })
    expect(await bot.clientRow(ali)).toMatchObject({ telegramChatId: BigInt(ALI_CHAT), telegramBlockedAt: expect.any(Date) })
  })

  it('chekni Telegram’ga: PDF + izoh; mijozsiz, ulanmagan, bloklagan — 422', async () => {
    // Nasiya chek — mijozli (bazadagi qoida); mijozsiz — naqd to'langan
    const sale = (customerId: string | null, number: string) =>
      testDb.sale.create({
        data: {
          tenantId: a.tenantId, number, subtotal: 1_250_000n, total: 1_250_000n, customerId, date: new Date(),
          ...(customerId ? { status: 'pending' } : { status: 'completed', paidCash: 1_250_000n }),
        },
      })
    const toTelegram = (id: string) => bot.api().post(`/api/v1/sales/${id}/receipt/telegram`).set('Authorization', auth)

    const credit = await sale(ali, 'CHEK-1001')
    expect((await toTelegram(credit.id).expect(422)).body).toMatchObject({ errors: [{ meta: { reason: 'not_linked' } }] })
    expect((await toTelegram((await sale(null, 'CHEK-1002')).id).expect(422)).body).toMatchObject({ errors: [{ meta: { reason: 'no_customer' } }] })

    await bot.link(auth, ali, ALI_CHAT)
    await toTelegram(credit.id).expect(204)
    const [doc] = telegram.documents
    expect(doc).toMatchObject({ chatId: ALI_CHAT, file: { name: 'CHEK-1001.pdf', mime: 'application/pdf' } })
    expect(Buffer.from(doc!.file.content).subarray(0, 5).toString()).toBe('%PDF-')
    expect(doc!.caption).toContain('🧾 Chek <b>CHEK-1001</b>')
    expect(doc!.caption).toContain('⏳ Qarz:')
    expect(await testDb.auditEntry.count({ where: { action: 'sale.receiptSent', entityId: credit.id } })).toBe(1)

    // Telegram "bloklagan" dedi — mijoz belgilanadi, kassir sababini ko'radi
    telegram.failures.set(ALI_CHAT, blocked403())
    expect((await toTelegram(credit.id).expect(422)).body).toMatchObject({ errors: [{ meta: { reason: 'blocked' } }] })
    expect((await bot.clientRow(ali)).telegramBlockedAt).not.toBeNull()
    expect((await toTelegram(credit.id).expect(422)).body).toMatchObject({ detail: 'Mijoz botni bloklagan' })
  })

  it('havola: omborchiga yo‘q (403), o‘chirilgan mijozga — 404', async () => {
    await bot.api().post(`/api/v1/clients/${ali}/telegram-link`).set('Authorization', await bearer(app, a, 'omborchi')).expect(403)
    await testDb.client.update({ where: { id: ali }, data: { deletedAt: new Date() } })
    await bot.api().post(`/api/v1/clients/${ali}/telegram-link`).set('Authorization', auth).expect(404)
  })
})

describe('Telegram bot + SMS: ulanmagan va bloklaganga — SMS', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  const telegram = new FakeTelegram()
  const sms = new FakeSms()
  const bot = botHarness(() => app, telegram)

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder.overrideProvider(TELEGRAM_CLIENT).useValue(telegram).overrideProvider(SMS_PROVIDER).useValue(sms),
    )
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    telegram.reset()
    sms.sent.length = 0
    a = await seedTenant('A do‘kon')
    await testDb.tenant.update({ where: { id: a.tenantId }, data: { plan: 'pro' } })
    auth = await bearer(app, a)
  })

  it('Telegram — ulanganga, SMS — qolganlarga (bloklagan ham); telefonsiz ulanmagan — yetib bormaydi; chegaraga faqat SMS', async () => {
    const ali = await seedClient(a.tenantId, { name: 'Ali' })
    const vali = await seedClient(a.tenantId, { name: 'Vali' })
    await testDb.client.update({ where: { id: vali }, data: { phone: '+998935554433' } })
    const gani = await seedClient(a.tenantId, { name: 'Gani' })
    await testDb.client.update({ where: { id: gani }, data: { phone: '+998977777777' } })
    await testDb.client.create({ data: { tenantId: a.tenantId, name: 'Telefonsiz', phone: '' } })
    await bot.link(auth, ali, ALI_CHAT)
    await bot.link(auth, gani, STRANGER_CHAT)
    await bot.member(STRANGER_CHAT, 'kicked')

    const res = await bot.sendMessage(auth, { target: 'all', text: 'Salom {name}' }).expect(201)
    expect(res.body).toMatchObject({ recipients: 3, telegram: 1, unreachable: 1 })
    expect(await app.get(MessageDispatcher).dispatch()).toEqual({ sent: 3, retried: 0, failed: 0 })
    expect(telegram.sent.at(-1)).toMatchObject({ chatId: ALI_CHAT, text: '🏪 <b>Qurilish Mollari</b>\n\nSalom <b>Ali</b>' })
    expect(sms.sent.map((s) => s.phone).sort()).toEqual(['+998935554433', '+998977777777'])

    // Tarif sahifasi: bugun 2 ta SMS (Telegram sanalmaydi)
    expect((await bot.api().get('/api/v1/tenants/current').set('Authorization', auth).expect(200)).body.usage.smsToday).toBe(2)
  })
})
