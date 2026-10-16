import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PLAN_MONTHLY_PRICE } from '@crm/shared'
import { PasswordService } from '@/modules/auth/password.service'
import { TELEGRAM_CLIENT, type TelegramUpdate } from '@/modules/telegram/telegram.client'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { blockedByUser, FakeTelegram } from './helpers/telegram-fake'

const OWNER_EMAIL = 'owner@workspaces.uz'
const OPERATOR_EMAIL = 'operator@workspaces.uz'
const PASSWORD = 'Egasi-2026!'
const STORE_PASSWORD = 'Qurilish2026!'
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!
const PAYME_AUTH = `Basic ${Buffer.from(`Paycom:${process.env.PAYME_KEY}`).toString('base64')}`
const OWNER_CHAT = 7_000_000_001
const OPERATOR_CHAT = 7_000_000_002

/**
 * Egasiga Telegram xabarlar (T-137): egasi hisobi botga shaxsiy havola bilan
 * ulanadi (mijozlar kabi, `p-` prefiks); yangi do'kon, onlayn to'lov va
 * o'chirish so'rovi — ulangan barcha faol hisoblarga. Qo'lda to'lov —
 * xabarsiz. Botni bloklagan — ulanish olib tashlanadi.
 */
describe('Egasiga Telegram xabarlar', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let owner: string
  let operator: string
  let storeAuth: string
  const telegram = new FakeTelegram()
  let updateId = 0

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(TELEGRAM_CLIENT).useValue(telegram))
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  const api = () => request(app.getHttpServer())
  const token = async (email: string): Promise<string> =>
    `Bearer ${(await api().post('/api/v1/platform/auth/login').send({ email, password: PASSWORD }).expect(201)).body.accessToken}`
  const me = async (auth: string) => (await api().get('/api/v1/platform/auth/me').set('Authorization', auth).expect(200)).body
  const webhook = (update: Omit<TelegramUpdate, 'update_id'>) =>
    api().post('/api/v1/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send({ update_id: ++updateId, ...update })
  const say = (chatId: number, text: string) =>
    webhook({ message: { message_id: updateId, chat: { id: chatId, type: 'private' }, from: { id: chatId }, text } }).expect(200)
  /** Egasi havola oladi — `start` parametri (`p-…`) */
  const issueLink = async (auth: string): Promise<string> => {
    const res = await api().post('/api/v1/platform/auth/telegram-link').set('Authorization', auth).expect(201)
    expect(res.body.link).toMatch(/^https:\/\/t\.me\/test_bot\?start=p-[A-Za-z0-9_-]{22}$/)
    return new URL(res.body.link).searchParams.get('start')!
  }
  const link = async (auth: string, chatId: number): Promise<void> => {
    await say(chatId, `/start ${await issueLink(auth)}`)
  }
  /** Xabar chaqiruvchini kutmaydi — kelishini kutamiz */
  const waitFor = (chatId: number, count: number) => vi.waitFor(() => expect(telegram.to(chatId)).toHaveLength(count), { timeout: 2_000 })
  const register = (email: string, store = 'Yangi do‘kon') =>
    api().post('/api/v1/tenants/register').send({ storeName: store, ownerName: 'Ali Valiyev', phone: '+998901234567', email, password: PASSWORD })
  let rpcId = 0
  const payme = (method: string, params: Record<string, unknown>) =>
    api().post('/api/v1/billing/payme').set('Authorization', PAYME_AUTH).send({ jsonrpc: '2.0', id: ++rpcId, method, params }).expect(200)

  beforeEach(async () => {
    resetThrottle(app)
    telegram.reset()
    await truncateAll()
    const passwords = app.get(PasswordService)
    const hash = await passwords.hash(PASSWORD)
    await testDb.platformAdmin.createMany({
      data: [
        { email: OWNER_EMAIL, name: 'Egasi', role: 'owner', passwordHash: hash },
        { email: OPERATOR_EMAIL, name: 'Dilnoza', role: 'operator', passwordHash: hash },
      ],
    })
    a = await seedTenant('A do‘kon')
    await testDb.user.update({ where: { id: a.userId }, data: { passwordHash: await passwords.hash(STORE_PASSWORD) } })
    storeAuth = await bearer(app, a)
    owner = await token(OWNER_EMAIL)
    operator = await token(OPERATOR_EMAIL)
  })

  it('ulanish: havola bir martalik, `me.telegramLinked`; bitta chat — bitta hisob; uzish — 204; jurnalda', async () => {
    expect((await me(owner)).telegramLinked).toBe(false)
    const start = await issueLink(owner)
    await say(OWNER_CHAT, `/start ${start}`)
    expect(telegram.to(OWNER_CHAT).at(-1)).toContain('Egasi')
    expect(telegram.to(OWNER_CHAT).at(-1)).toContain('egasi paneli xabarlari')
    expect((await me(owner)).telegramLinked).toBe(true)

    // Ishlatilgan havola — eskirgan; havolasiz /start — oddiy javob
    await say(OWNER_CHAT, `/start ${start}`)
    expect(telegram.to(OWNER_CHAT).at(-1)).toContain('eskirgan')
    await say(OWNER_CHAT, '/start p-AAAAAAAAAAAAAAAAAAAAAA')
    expect(telegram.to(OWNER_CHAT).at(-1)).toContain('eskirgan')

    // O'sha odam operator hisobini ulasa — egasi hisobidan chat olib tashlanadi
    await link(operator, OWNER_CHAT)
    expect((await me(operator)).telegramLinked).toBe(true)
    expect((await me(owner)).telegramLinked).toBe(false)

    await api().delete('/api/v1/platform/auth/telegram-link').set('Authorization', operator).expect(204)
    expect((await me(operator)).telegramLinked).toBe(false)
    await api().delete('/api/v1/platform/auth/telegram-link').set('Authorization', operator).expect(204)

    const audit = await api().get('/api/v1/platform/audit?group=platform&pageSize=100').set('Authorization', owner).expect(200)
    const actions = audit.body.items.map((e: { action: string }) => e.action)
    expect(actions.filter((x: string) => x === 'platform.telegram.link')).toHaveLength(2)
    expect(actions.filter((x: string) => x === 'platform.telegram.unlink')).toHaveLength(1)
  })

  it('yangi do‘kon, onlayn to‘lov, o‘chirish so‘rovi — ulangan hammaga; qo‘lda to‘lov — xabarsiz; faolsiz hisobga yo‘q', async () => {
    await link(owner, OWNER_CHAT)
    await link(operator, OPERATOR_CHAT)
    telegram.reset()

    // 1. Ro'yxatdan o'tish
    await register('ali@dokon.uz', 'Ali <Qurilish>').expect(201)
    await waitFor(OWNER_CHAT, 1)
    await waitFor(OPERATOR_CHAT, 1)
    const registered = telegram.to(OWNER_CHAT)[0]!
    expect(registered).toContain('Yangi do‘kon')
    expect(registered).toContain('Ali &lt;Qurilish&gt;')
    expect(registered).toContain('Ali Valiyev')
    expect(registered).toContain('+998901234567')
    expect(registered).toContain('ali@dokon.uz')

    // 2. Payme to'lovi (webhook)
    const { invoice } = (await api().post('/api/v1/billing/invoices').set('Authorization', storeAuth).send({ plan: 'basic', months: 2 }).expect(201)).body
    const amount = PLAN_MONTHLY_PRICE.basic * 2 * 100
    await payme('CreateTransaction', { id: 'pm-1', time: Date.now(), amount, account: { order_id: invoice.id } })
    await payme('PerformTransaction', { id: 'pm-1' })
    await waitFor(OWNER_CHAT, 2)
    const paid = telegram.to(OWNER_CHAT)[1]!
    expect(paid).toContain('To‘lov')
    expect(paid).toContain('A do‘kon')
    expect(paid).toContain('198 000 so‘m')
    expect(paid).toContain('basic')
    expect(paid).toContain('2 oy (payme)')
    // Takror webhook — tarif ham, xabar ham ikkinchi marta emas
    await payme('PerformTransaction', { id: 'pm-1' })

    // 3. Qo'lda to'lov — xabar yo'q
    await api().post(`/api/v1/platform/tenants/${a.tenantId}/plan`).set('Authorization', owner).send({ plan: 'pro', months: 1, provider: 'cash' }).expect(200)

    // 4. Do'kon o'chirishni so'radi
    await api().post('/api/v1/tenants/current/delete').set('Authorization', storeAuth).send({ password: STORE_PASSWORD }).expect(200)
    await waitFor(OWNER_CHAT, 3)
    const deletion = telegram.to(OWNER_CHAT)[2]!
    expect(deletion).toContain('O‘chirish so‘rovi')
    expect(deletion).toContain('A do‘kon')
    expect(deletion).toContain('30 kundan keyin')
    await waitFor(OPERATOR_CHAT, 3)

    // 5. Faolsiz hisobga xabar bormaydi
    const operatorId = (await me(operator)).id
    await api().patch(`/api/v1/platform/admins/${operatorId}`).set('Authorization', owner).send({ isActive: false }).expect(200)
    await register('vali@dokon.uz').expect(201)
    await waitFor(OWNER_CHAT, 4)
    expect(telegram.to(OPERATOR_CHAT)).toHaveLength(3)
  })

  it('egasi botni bloklagan — ulanish olib tashlanadi, boshqalarga xabar davom etadi', async () => {
    await link(owner, OWNER_CHAT)
    await link(operator, OPERATOR_CHAT)
    telegram.reset()
    telegram.failNext(OWNER_CHAT, blockedByUser())

    await register('ali@dokon.uz').expect(201)
    await waitFor(OPERATOR_CHAT, 1)
    await vi.waitFor(async () => expect((await me(owner)).telegramLinked).toBe(false), { timeout: 2_000 })
    expect(telegram.to(OWNER_CHAT)).toHaveLength(0)

    // Qayta ulash mumkin
    await link(owner, OWNER_CHAT)
    expect((await me(owner)).telegramLinked).toBe(true)
  })
})
