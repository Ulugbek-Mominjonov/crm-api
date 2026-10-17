import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { Socket } from 'socket.io-client'
import { PasswordService } from '@/modules/auth/password.service'
import { TELEGRAM_CLIENT, type TelegramUpdate } from '@/modules/telegram/telegram.client'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { connect, listen, record, until, type Received } from './helpers/realtime'
import { FakeTelegram } from './helpers/telegram-fake'

const OWNER_EMAIL = 'owner@workspaces.uz'
const OPERATOR_EMAIL = 'operator@workspaces.uz'
const PASSWORD = 'Egasi-2026!'
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!
const OWNER_CHAT = 7_000_000_001
const MESSAGES_PER_DAY = 5

/**
 * Do'kon murojaati platforma egasiga (T-140): bloklangan do'kon
 * administratori tizim ichidan yozadi (faqat-o'qishda ham), egasiga Telegram
 * darhol, egasi panelida ro'yxat/javob/yopish, do'konga realtime hodisa;
 * bir vaqtda bitta ochiq murojaat, kunlik chegara, boshqa do'kon ko'rmaydi.
 * Egasining aloqa ma'lumoti sozlamada — ochiq yo'lda va do'kon hisobida.
 */
describe('Do‘kon murojaati egasiga', () => {
  let app: INestApplication
  let url: string
  let a: Awaited<ReturnType<typeof seedTenant>>
  let b: Awaited<ReturnType<typeof seedTenant>>
  let storeAuth: string
  let owner: string
  let operator: string
  const telegram = new FakeTelegram()
  const sockets: Socket[] = []
  let updateId = 0

  beforeAll(async () => {
    app = await createTestApp((builder) => builder.overrideProvider(TELEGRAM_CLIENT).useValue(telegram))
    url = await listen(app)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  afterEach(() => {
    for (const s of sockets.splice(0)) s.close()
  })

  const api = () => request(app.getHttpServer())
  const token = async (email: string): Promise<string> =>
    `Bearer ${(await api().post('/api/v1/platform/auth/login').send({ email, password: PASSWORD }).expect(201)).body.accessToken}`
  const webhook = (update: Omit<TelegramUpdate, 'update_id'>) =>
    api().post('/api/v1/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send({ update_id: ++updateId, ...update })
  const linkOwner = async (): Promise<void> => {
    const res = await api().post('/api/v1/platform/auth/telegram-link').set('Authorization', owner).expect(201)
    const start = new URL(res.body.link).searchParams.get('start')!
    await webhook({ message: { message_id: updateId, chat: { id: OWNER_CHAT, type: 'private' }, from: { id: OWNER_CHAT }, text: `/start ${start}` } }).expect(200)
    telegram.reset()
  }
  const waitFor = (count: number) => vi.waitFor(() => expect(telegram.to(OWNER_CHAT)).toHaveLength(count), { timeout: 2_000 })
  const send = (auth: string, body: Record<string, unknown>) => api().post('/api/v1/tenants/current/requests').set('Authorization', auth).send(body)
  const addMessage = (auth: string, id: string, message: string) =>
    api().post(`/api/v1/tenants/current/requests/${id}/messages`).set('Authorization', auth).send({ message })
  const storeList = async (auth = storeAuth) => (await api().get('/api/v1/tenants/current/requests').set('Authorization', auth).expect(200)).body
  const platformList = async (query = '') => (await api().get(`/api/v1/platform/requests${query}`).set('Authorization', owner).expect(200)).body
  const platformGet = async (id: string) => (await api().get(`/api/v1/platform/requests/${id}`).set('Authorization', owner).expect(200)).body
  const reply = (auth: string, id: string, message: string) => api().post(`/api/v1/platform/requests/${id}/reply`).set('Authorization', auth).send({ message })
  const close = (id: string, body: Record<string, unknown> = {}) => api().post(`/api/v1/platform/requests/${id}/close`).set('Authorization', owner).send(body)
  const listenStore = async (): Promise<Received[]> => {
    const socket = await connect(url, { token: storeAuth.slice('Bearer '.length) })
    sockets.push(socket)
    return record(socket)
  }
  const platformAudit = async (): Promise<{ action: string; targetTenantName: string | null; diff: unknown }[]> =>
    (await api().get('/api/v1/platform/audit?pageSize=100').set('Authorization', owner).expect(200)).body.items

  beforeEach(async () => {
    resetThrottle(app)
    telegram.reset()
    await truncateAll()
    const hash = await app.get(PasswordService).hash(PASSWORD)
    await testDb.platformAdmin.createMany({
      data: [
        { email: OWNER_EMAIL, name: 'Egasi', role: 'owner', passwordHash: hash },
        { email: OPERATOR_EMAIL, name: 'Dilnoza', role: 'operator', passwordHash: hash },
      ],
    })
    a = await seedTenant('A do‘kon')
    b = await seedTenant('B do‘kon')
    storeAuth = await bearer(app, a)
    owner = await token(OWNER_EMAIL)
    operator = await token(OPERATOR_EMAIL)
  })

  it('bloklangan do‘kon: administrator yuboradi (201), sotuvchi 403, ikkinchisi 409; egasiga Telegram; ro‘yxat, statistika, karta; B ko‘rmaydi', async () => {
    await linkOwner()
    await api().post(`/api/v1/platform/tenants/${a.tenantId}/block`).set('Authorization', owner).send({ reason: 'To‘lov kelishuvi buzildi' }).expect(200)
    // Faqat-o'qish holati: oddiy yozuv 423, murojaat esa o'tadi
    await api().post('/api/v1/products').set('Authorization', storeAuth).send({ name: 'Sement', sku: 'S-1', unit: 'qop', price: 1_000, wholesalePrice: 900, cost: 800 }).expect(423)
    expect((await send(await bearer(app, a, 'sotuvchi'), { type: 'unblock', message: 'Salom' }).expect(403)).body.code).toBe('PERMISSION_DENIED')

    const created = await send(storeAuth, { type: 'unblock', message: 'To‘lovni <kecha> o‘tkazdik', phone: '+998 90 123-45-67' }).expect(201)
    expect(created.body).toMatchObject({ type: 'unblock', status: 'open', phone: '+998901234567', closedAt: null })
    expect(created.body.messages).toEqual([expect.objectContaining({ author: 'store', authorName: 'Test Admin', body: 'To‘lovni <kecha> o‘tkazdik' })])
    const requestId: string = created.body.id

    const again = await send(storeAuth, { type: 'other', message: 'Yana' }).expect(409)
    expect(again.body.code).toBe('ALREADY_EXISTS')
    expect(again.body.errors[0].meta.requestId).toBe(requestId)

    await waitFor(1)
    const text = telegram.to(OWNER_CHAT)[0]!
    for (const part of ['Murojaat', 'A do‘kon', 'blokdan chiqarish', 'To‘lov kelishuvi buzildi', 'Test Admin', '+998901234567', 'To‘lovni &lt;kecha&gt; o‘tkazdik']) {
      expect(text).toContain(part)
    }

    // Do'kon jurnalida — kim yubordi
    const audit = await testDb.auditEntry.findFirst({ where: { tenantId: a.tenantId, action: 'tenant.requestSent' }, select: { userId: true, entityId: true } })
    expect(audit).toEqual({ userId: a.userId, entityId: requestId })

    const list = await storeList()
    expect(list).toHaveLength(1)
    expect(list[0].messages).toHaveLength(1)

    // Egasi paneli
    const paged = await platformList()
    expect(paged.total).toBe(1)
    expect(paged.items[0]).toMatchObject({
      id: requestId, tenantId: a.tenantId, tenantName: 'A do‘kon', tenantStatus: 'blocked', type: 'unblock', status: 'open',
      phone: '+998901234567', authorName: 'Test Admin', message: 'To‘lovni <kecha> o‘tkazdik', messageCount: 1,
    })
    expect((await platformGet(requestId)).messages).toHaveLength(1)
    expect((await api().get('/api/v1/platform/stats').set('Authorization', owner).expect(200)).body.openRequests).toBe(1)
    expect((await api().get(`/api/v1/platform/tenants/${a.tenantId}`).set('Authorization', owner).expect(200)).body.openRequests).toBe(1)
    expect((await api().get(`/api/v1/platform/tenants/${b.tenantId}`).set('Authorization', owner).expect(200)).body.openRequests).toBe(0)
    expect((await platformList(`?tenantId=${b.tenantId}`)).total).toBe(0)
    expect((await platformList('?type=billing')).total).toBe(0)
    await api().get(`/api/v1/platform/requests/${randomUUID()}`).set('Authorization', owner).expect(404)

    // Boshqa do'kon: ko'rmaydi, yoza olmaydi
    const bAuth = await bearer(app, b)
    expect(await storeList(bAuth)).toEqual([])
    await addMessage(bAuth, requestId, 'Begona').expect(404)

    // DTO shartlari
    await send(bAuth, { type: 'other', message: 'x'.repeat(1001) }).expect(400)
    await send(bAuth, { type: 'spam', message: 'x' }).expect(400)
    await send(bAuth, { type: 'other', message: 'x', subject: 'yo‘q' }).expect(400)
    await send(bAuth, { type: 'other', message: 'x', phone: '12' }).expect(400)
  })

  it('javob → answered, qo‘shimcha xabar → open, yopish → closed; hodisa; yopilganiga yozilmaydi, yangisi ochiladi; jurnal', async () => {
    await linkOwner()
    const { id } = (await send(storeAuth, { type: 'billing', message: 'To‘lov o‘tmayapti' }).expect(201)).body
    await waitFor(1)
    const events = await listenStore()

    // Operator ham javob beradi
    const answered = await reply(operator, id, 'Tekshiryapmiz').expect(200)
    expect(answered.body).toMatchObject({ status: 'answered', messageCount: 2 })
    expect(answered.body.messages[1]).toMatchObject({ author: 'platform', authorName: 'Dilnoza', body: 'Tekshiryapmiz' })
    await until(() => events.some((e) => e.type === 'tenant.request'))
    expect(events).toEqual([{ type: 'tenant.request', payload: { requestId: id, status: 'answered' } }])
    expect((await storeList())[0]).toMatchObject({ status: 'answered' })
    expect((await platformList('?status=open')).total).toBe(0)

    // Do'kon yana yozadi — egasi kutayotganlar ro'yxatida, Telegram'da
    const reopened = await addMessage(storeAuth, id, 'Chek raqami 123').expect(201)
    expect(reopened.body).toMatchObject({ status: 'open' })
    expect(reopened.body.messages.map((m: { author: string }) => m.author)).toEqual(['store', 'platform', 'store'])
    await waitFor(2)
    expect(telegram.to(OWNER_CHAT)[1]).toContain('Murojaatga xabar')
    expect(telegram.to(OWNER_CHAT)[1]).toContain('Chek raqami 123')
    expect((await platformList('?status=open')).items[0]).toMatchObject({ id, messageCount: 3 })

    // Yopish yakuniy javob bilan
    const closed = await close(id, { message: 'Hal bo‘ldi' }).expect(200)
    expect(closed.body).toMatchObject({ status: 'closed', messageCount: 4 })
    expect(closed.body.closedAt).not.toBeNull()
    await until(() => events.length === 2)
    expect(events[1]).toEqual({ type: 'tenant.request', payload: { requestId: id, status: 'closed' } })

    expect((await addMessage(storeAuth, id, 'Rahmat').expect(422)).body.code).toBe('INVALID_STATUS_TRANSITION')
    await reply(owner, id, 'Kech').expect(422)
    await close(id).expect(422)

    // Yopilgach yangisi ochiladi; ro'yxatda eng yangisi birinchi, yopilgan — oxirida
    const next = (await send(storeAuth, { type: 'other', message: 'Boshqa savol' }).expect(201)).body
    expect((await storeList()).map((r: { id: string }) => r.id)).toEqual([next.id, id])
    expect((await platformList()).items.map((r: { id: string }) => r.id)).toEqual([next.id, id])
    expect((await storeList())[1].messages).toHaveLength(4)
    await close(next.id).expect(200)
    expect((await platformGet(next.id)).messageCount).toBe(1)

    const actions = (await platformAudit()).filter((e) => e.action.startsWith('request.'))
    expect(actions.map((e) => e.action)).toEqual(['request.close', 'request.close', 'request.reply'])
    expect(actions[0]).toMatchObject({ targetTenantName: 'A do‘kon', diff: { type: 'other', withMessage: false } })
  })

  it(`kunlik chegara: 24 soatda ${MESSAGES_PER_DAY} ta xabar, keyingisi — 429`, async () => {
    const { id } = (await send(storeAuth, { type: 'other', message: 'Birinchi' }).expect(201)).body
    for (let i = 2; i <= MESSAGES_PER_DAY; i++) await addMessage(storeAuth, id, `Xabar ${i}`).expect(201)
    const limited = await addMessage(storeAuth, id, 'Oshib ketdi').expect(429)
    expect(limited.body.code).toBe('MESSAGE_LIMIT_EXCEEDED')
    expect(limited.body.errors[0].meta).toEqual({ limit: MESSAGES_PER_DAY, used: MESSAGES_PER_DAY })
    // Egasi javobi chegaraga kirmaydi
    await reply(owner, id, 'Javob').expect(200)
    await addMessage(storeAuth, id, 'Yana').expect(429)
  })

  it('aloqa sozlamasi: egasi yozadi (operator — 403), ochiq yo‘lda va do‘kon hisobida; `""` o‘chiradi; jurnalda faqat o‘zgargani', async () => {
    const empty = { phone: null, telegram: null, hours: null }
    expect((await api().get('/api/v1/platform/settings').set('Authorization', owner).expect(200)).body.support).toEqual(empty)
    expect((await api().get('/api/v1/tenants/registration').expect(200)).body).toEqual({ mode: 'open', support: empty })
    await api().patch('/api/v1/platform/settings').set('Authorization', operator).send({ support: { phone: '+998' } }).expect(403)

    const support = { phone: '+998 90 123 45 67', telegram: 'workspaces_support', hours: 'Du–Sha 9:00–18:00' }
    const updated = await api().patch('/api/v1/platform/settings').set('Authorization', owner)
      .send({ support: { ...support, telegram: '@workspaces_support' } }).expect(200)
    expect(updated.body).toMatchObject({ registrationMode: 'open', support, updatedBy: 'Egasi' })
    expect((await api().get('/api/v1/tenants/registration').expect(200)).body).toEqual({ mode: 'open', support })
    expect((await api().get('/api/v1/tenants/current').set('Authorization', storeAuth).expect(200)).body.support).toEqual(support)

    await api().patch('/api/v1/platform/settings').set('Authorization', owner).send({ support: { telegram: 'ab' } }).expect(400)
    await api().patch('/api/v1/platform/settings').set('Authorization', owner).send({ support: { site: 'x' } }).expect(400)

    const cleared = await api().patch('/api/v1/platform/settings').set('Authorization', owner)
      .send({ registrationMode: 'closed', support: { phone: '' } }).expect(200)
    expect(cleared.body).toMatchObject({ registrationMode: 'closed', support: { ...support, phone: null } })
    // Hech narsa o'zgarmagan PATCH — jurnalsiz
    await api().patch('/api/v1/platform/settings').set('Authorization', owner).send({ registrationMode: 'closed', support: { hours: support.hours } }).expect(200)

    const entries = (await platformAudit()).filter((e) => e.action === 'platform.settings.update')
    expect(entries).toHaveLength(2)
    expect(entries[0]!.diff).toEqual({ before: { registrationMode: 'open', supportPhone: support.phone }, after: { registrationMode: 'closed', supportPhone: null } })
  })
})
