import type { INestApplication } from '@nestjs/common'
import type { Socket } from 'socket.io-client'
import request from 'supertest'
import { BILLING_PERIODS, PLAN_NAMES, planPrice, TRIAL_DAYS, TRIAL_PLAN } from '@crm/shared'
import { PasswordService } from '@/modules/auth/password.service'
import { PAYME } from '@/modules/billing/payme.service'
import { FileGcJobs, ORPHAN_GRACE_MS } from '@/modules/files/files.jobs'
import { TELEGRAM_CLIENT, type TelegramUpdate } from '@/modules/telegram/telegram.client'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { filesApi, pngImage, seedFileRow } from './helpers/files'
import { connect, listen, record, until, type Received } from './helpers/realtime'
import { FakeTelegram } from './helpers/telegram-fake'

const OWNER_EMAIL = 'owner@workspaces.uz'
const OPERATOR_EMAIL = 'operator@workspaces.uz'
const PASSWORD = 'Egasi-2026!'
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET!
const PAYME_AUTH = `Basic ${Buffer.from(`Paycom:${process.env.PAYME_KEY}`).toString('base64')}`
const OWNER_CHAT = 7_000_000_101
const STRANGER_CHAT = 7_000_000_199
/** Payme sinov Uzcard'i — nazorat raqami (Luhn) to'g'ri */
const CARD = '8600069195406311'
const DAY = 86_400_000
const MESSAGE_ID = 77

/**
 * Tariflar katalogi (T-148) va egasining kartasiga to'lov (T-149): do'kon
 * hisob-faktura ochadi, kartaga o'tkazib «to'ladim» deydi (karta oxirgi 4
 * raqami, vaqt, chek) — egasi panelda yoki Telegram tugmasi bilan tasdiqlaydi
 * (tarif Payme bilan bir xil qoidada uzayadi) yoki rad etadi (sabab do'konga).
 */
describe('Karta orqali to‘lov va tariflar katalogi', () => {
  let app: INestApplication
  let url: string
  let a: Awaited<ReturnType<typeof seedTenant>>
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

  beforeEach(async () => {
    resetThrottle(app)
    telegram.reset()
    await truncateAll()
    const hash = await app.get(PasswordService).hash(PASSWORD)
    await testDb.platformAdmin.createMany({
      data: [
        // Botga ulangan egasi (T-137 havolasi o'z testida) — xabar va tugmalar shu chatga
        { email: OWNER_EMAIL, name: 'Egasi', role: 'owner', passwordHash: hash, telegramChatId: BigInt(OWNER_CHAT), telegramLinkedAt: new Date() },
        { email: OPERATOR_EMAIL, name: 'Dilnoza', role: 'operator', passwordHash: hash },
      ],
    })
    a = await seedTenant('A do‘kon')
    storeAuth = await bearer(app, a)
    owner = await token(OWNER_EMAIL)
    operator = await token(OPERATOR_EMAIL)
  })

  const api = () => request(app.getHttpServer())
  async function token(email: string): Promise<string> {
    return `Bearer ${(await api().post('/api/v1/platform/auth/login').send({ email, password: PASSWORD }).expect(201)).body.accessToken}`
  }
  const setCard = (card: Record<string, string> = { number: CARD, holder: 'ULUGBEK M.' }, auth = owner) =>
    api().patch('/api/v1/platform/settings').set('Authorization', auth).send({ paymentCard: card })
  const checkout = async (plan = 'business', months = 1) =>
    (await api().post('/api/v1/billing/invoices').set('Authorization', storeAuth).send({ plan, months }).expect(201)).body
  const claim = (id: string, body: Record<string, unknown> = { payerCard: '6311' }, auth = storeAuth) =>
    api().post(`/api/v1/billing/invoices/${id}/card-payment`).set('Authorization', auth).send(body)
  const storeInvoices = async () => (await api().get('/api/v1/billing/invoices').set('Authorization', storeAuth).expect(200)).body
  const tenant = () => testDb.tenant.findUniqueOrThrow({ where: { id: a.tenantId } })
  const invoiceRow = (id: string) => testDb.billingInvoice.findUniqueOrThrow({ where: { id } })
  const webhook = (update: Omit<TelegramUpdate, 'update_id'>) =>
    api().post('/api/v1/telegram/webhook').set('X-Telegram-Bot-Api-Secret-Token', SECRET).send({ update_id: ++updateId, ...update }).expect(200)
  /** Egasi xabaridagi tugmani bosish (Telegram `callback_query`) */
  const press = (chatId: number, data: string) =>
    webhook({ callback_query: { id: `cb-${updateId}`, from: { id: chatId }, message: { message_id: MESSAGE_ID, chat: { id: chatId, type: 'private' } }, data } })
  /** Egasiga xabar chaqiruvchini kutmasdan ketadi */
  const waitForNotice = (count = 1) =>
    vi.waitFor(() => expect(telegram.sent.filter((m) => m.chatId === OWNER_CHAT && m.opts?.buttons).length + telegram.documents.length).toBe(count), { timeout: 3_000 })
  const listenStore = async (): Promise<Received[]> => {
    const socket = await connect(url, { token: storeAuth.slice('Bearer '.length) })
    sockets.push(socket)
    return record(socket)
  }
  const platformAudit = async (): Promise<{ action: string; diff: Record<string, unknown> }[]> =>
    (await api().get('/api/v1/platform/audit?pageSize=100').set('Authorization', owner).expect(200)).body.items

  it('katalog ochiq: hamma tariflar, muddat narxlari (chegirma bilan), sinov, usullar; karta egasi kiritgach yoqiladi', async () => {
    const catalog = async () => (await api().get('/api/v1/billing/plans').expect(200)).body
    const before = await catalog()
    expect(before.plans.map((p: { key: string }) => p.key)).toEqual(PLAN_NAMES)
    const business = before.plans.find((p: { key: string }) => p.key === 'business')
    expect(business).toMatchObject({ label: 'Biznes', sellable: true, monthlyPrice: planPrice('business', 1), limits: { users: 10, warehouses: 5 } })
    expect(business.prices).toEqual(BILLING_PERIODS.map((months) => ({ months, amount: planPrice('business', months), discountPct: expect.any(Number) })))
    expect(business.prices.find((p: { months: number }) => p.months === 12).discountPct).toBe(20)
    expect(before.plans.find((p: { key: string }) => p.key === 'free')).toMatchObject({ sellable: false, prices: [] })
    expect(before).toMatchObject({ trial: { plan: TRIAL_PLAN, days: TRIAL_DAYS }, methods: { card: false, payme: true, click: true }, sms: false })

    // Karta: nazorat raqami xato — 400; operator — 403; egasi — saqlanadi (bo'sh joylar olib tashlanadi)
    expect((await setCard({ number: '8600 0691 9540 6312' }).expect(400)).body.code).toBe('VALIDATION_FAILED')
    await setCard(undefined, operator).expect(403)
    const saved = await setCard({ number: '8600 0691 9540 6311', holder: 'ULUGBEK M.' }).expect(200)
    expect(saved.body.paymentCard).toEqual({ number: CARD, holder: 'ULUGBEK M.' })
    expect((await catalog()).methods.card).toBe(true)
    const account = await api().get('/api/v1/tenants/current').set('Authorization', storeAuth).expect(200)
    expect(account.body.paymentCard).toEqual({ number: CARD, holder: 'ULUGBEK M.' })
    // Raqam o'chirilsa — usul o'chadi
    await setCard({ number: '' }).expect(200)
    expect((await catalog()).methods.card).toBe(false)
  })

  it('«to‘ladim»: tekshiruvda (tarif o‘zgarmaydi), egasiga Telegram tugmalar bilan; takror, ikkinchi da’vo, xato maydonlar, Payme band', async () => {
    await setCard().expect(200)
    const { invoice, card } = await checkout('business', 12)
    expect(invoice).toMatchObject({ amount: planPrice('business', 12), state: 'created' })
    expect(card).toEqual({ number: CARD, holder: 'ULUGBEK M.' })

    const transferredAt = new Date(Date.now() - 3_600_000).toISOString()
    const claimed = await claim(invoice.id, { payerCard: '6311', transferredAt, note: 'Akamning kartasidan <tez>' }).expect(200)
    expect(claimed.body).toMatchObject({ state: 'pending', provider: 'card', payerCard: '6311', payerNote: 'Akamning kartasidan <tez>', transferredAt })
    expect(claimed.body.claimedAt).not.toBeNull()
    expect(await tenant()).toMatchObject({ plan: 'free', planExpiresAt: null })

    await waitForNotice()
    const notice = telegram.sent.find((m) => m.chatId === OWNER_CHAT)!
    expect(notice.text).toContain('A do‘kon')
    expect(notice.text).toContain(`${planPrice('business', 12).toLocaleString('ru-RU').replace(/\s/g, ' ')} so‘m`)
    expect(notice.text).toContain('<b>Biznes</b>, 12 oy')
    expect(notice.text).toContain('•••• 6311')
    expect(notice.text).toContain('Akamning kartasidan &lt;tez&gt;')
    expect(notice.opts?.buttons).toEqual([[
      { text: '✅ Tasdiqlash', data: `pay:ok:${invoice.id}` }, { text: '❌ Rad etish', data: `pay:no:${invoice.id}` },
    ]])

    // Shu hisob-faktura qayta — 422; boshqasi — 409 (bitta tekshiruv); xato maydonlar — 400; administrator emas — 403
    expect((await claim(invoice.id).expect(422)).body.errors[0].meta).toEqual({ state: 'pending' })
    const second = await checkout('basic', 1)
    expect((await claim(second.invoice.id).expect(409)).body.errors[0].meta).toEqual({ invoiceId: invoice.id })
    await claim(second.invoice.id, { payerCard: '63' }).expect(400)
    await claim(second.invoice.id, { payerCard: '6311', transferredAt: new Date(Date.now() + DAY).toISOString() }).expect(400)
    await claim(second.invoice.id, { payerCard: '6311', transferredAt: new Date(Date.now() - 40 * DAY).toISOString() }).expect(400)
    await claim(second.invoice.id, undefined, await bearer(app, a, 'manager')).expect(403)

    // Tekshiruvdagi hisob-fakturani Payme orqali to'lab bo'lmaydi
    const busy = await api().post('/api/v1/billing/payme').set('Authorization', PAYME_AUTH)
      .send({ jsonrpc: '2.0', id: 1, method: 'CheckPerformTransaction', params: { amount: invoice.amount * 100, account: { order_id: invoice.id } } })
      .expect(200)
    expect(busy.body.error.code).toBe(PAYME.ORDER_BUSY)

    expect((await storeInvoices()).find((i: { id: string }) => i.id === invoice.id)).toMatchObject({ state: 'pending', payerCard: '6311' })
    expect(await testDb.auditEntry.count({ where: { tenantId: a.tenantId, action: 'billing.cardClaimed' } })).toBe(1)
  })

  it('egasi paneli: navbat va statistika; tasdiqlash — tarif uzayadi, suspended ochiladi, sinov tozalanadi, hodisa; takror 422', async () => {
    await testDb.tenant.update({
      where: { id: a.tenantId },
      data: { plan: 'basic', status: 'suspended', planExpiresAt: new Date(Date.now() - 10 * DAY), trialEndsAt: new Date(Date.now() - 10 * DAY) },
    })
    await setCard().expect(200)
    const { invoice } = await checkout('business', 1)
    await claim(invoice.id).expect(200)
    const events = await listenStore()

    const queue = await api().get('/api/v1/platform/invoices?state=pending&provider=card').set('Authorization', owner).expect(200)
    expect(queue.body).toMatchObject({ total: 1, items: [{ id: invoice.id, tenantName: 'A do‘kon', payerCard: '6311', hasReceipt: false, rejectReason: null }] })
    expect((await api().get('/api/v1/platform/stats').set('Authorization', owner).expect(200)).body.pendingPayments).toBe(1)

    // Operator ham tasdiqlaydi
    const confirmed = await api().post(`/api/v1/platform/invoices/${invoice.id}/confirm`).set('Authorization', operator).send({ note: 'Bank: 14:05' }).expect(200)
    expect(confirmed.body).toMatchObject({ id: invoice.id, state: 'paid', provider: 'card', note: 'Bank: 14:05' })
    const after = await tenant()
    expect(after).toMatchObject({ plan: 'business', status: 'active', trialEndsAt: null })
    // Boshqa tarif va muddati o'tgan — hozirdan bir oy
    expect(after.planExpiresAt!.getTime() - Date.now()).toBeGreaterThan(27 * DAY)
    expect(after.planExpiresAt!.getTime() - Date.now()).toBeLessThan(32 * DAY)
    await until(() => events.some((e) => e.type === 'billing.invoice') && events.some((e) => e.type === 'tenant.status'))
    expect(events.find((e) => e.type === 'billing.invoice')!.payload).toEqual({ invoiceId: invoice.id, state: 'paid' })
    expect((await api().get('/api/v1/platform/stats').set('Authorization', owner).expect(200)).body.pendingPayments).toBe(0)

    // Takror va noto'g'ri holat — 422; yo'q — 404
    expect((await api().post(`/api/v1/platform/invoices/${invoice.id}/confirm`).set('Authorization', owner).send({}).expect(422)).body.errors[0].meta)
      .toEqual({ state: 'paid', provider: 'card' })
    await api().post(`/api/v1/platform/invoices/${invoice.id}/reject`).set('Authorization', owner).send({ reason: 'Kech' }).expect(422)
    await api().post('/api/v1/platform/invoices/01923456-0000-7000-8000-000000000000/confirm').set('Authorization', owner).send({}).expect(404)
    const confirm = (await platformAudit()).find((e) => e.action === 'invoice.confirm')!
    expect(confirm.diff).toMatchObject({ plan: 'business', months: 1, amount: planPrice('business', 1), via: 'panel', note: 'Bank: 14:05' })
    expect(await testDb.auditEntry.count({ where: { tenantId: a.tenantId, action: 'billing.paid' } })).toBe(1)
  })

  it('rad etish: sabab do‘konga, tarif o‘zgarmaydi, hodisa; keyin yangi hisob-faktura bilan qayta yuboriladi', async () => {
    await setCard().expect(200)
    const { invoice } = await checkout('basic', 3)
    await claim(invoice.id).expect(200)
    const events = await listenStore()
    await api().post(`/api/v1/platform/invoices/${invoice.id}/reject`).set('Authorization', owner).send({ reason: 'ab' }).expect(400)
    const rejected = await api().post(`/api/v1/platform/invoices/${invoice.id}/reject`).set('Authorization', owner)
      .send({ reason: 'Tushum topilmadi — vaqtni tekshiring' }).expect(200)
    expect(rejected.body).toMatchObject({ state: 'cancelled', rejectReason: 'Tushum topilmadi — vaqtni tekshiring' })
    expect(await tenant()).toMatchObject({ plan: 'free', planExpiresAt: null })
    await until(() => events.some((e) => e.type === 'billing.invoice'))
    expect(events.find((e) => e.type === 'billing.invoice')!.payload).toEqual({ invoiceId: invoice.id, state: 'cancelled' })
    expect((await storeInvoices())[0]).toMatchObject({ id: invoice.id, state: 'cancelled', rejectReason: 'Tushum topilmadi — vaqtni tekshiring' })

    // Rad etilgan hisob-faktura qayta da'vo qilinmaydi — yangisi ochiladi
    await claim(invoice.id).expect(422)
    const again = await checkout('basic', 3)
    await claim(again.invoice.id).expect(200)
    expect((await platformAudit()).map((e) => e.action)).toContain('invoice.reject')
  })

  it('Telegram tugmasi: tasdiqlash va rad etish panel bilan bir yo‘l; begona — ruxsat yo‘q; ikkinchi bosish — allaqachon', async () => {
    await setCard().expect(200)
    const first = (await checkout('basic', 3)).invoice
    await claim(first.id).expect(200)
    await waitForNotice()

    await press(STRANGER_CHAT, `pay:ok:${first.id}`)
    expect(telegram.answers.at(-1)?.text).toBe('Bu amal sizga ochiq emas')
    expect((await invoiceRow(first.id)).state).toBe('pending')

    await press(OWNER_CHAT, `pay:ok:${first.id}`)
    expect(await invoiceRow(first.id)).toMatchObject({ state: 'paid', provider: 'card' })
    const paid = await tenant()
    expect(paid.plan).toBe('basic')
    expect(paid.planExpiresAt!.getTime() - Date.now()).toBeGreaterThan(88 * DAY)
    expect(telegram.answers.at(-1)?.text).toMatch(/^✅ Tasdiqlandi: A do‘kon — Start, \d{2}\.\d{2}\.\d{4} gacha$/)
    expect(telegram.removed).toEqual([{ chatId: OWNER_CHAT, messageId: MESSAGE_ID }])
    expect(telegram.sent.at(-1)).toMatchObject({ chatId: OWNER_CHAT, opts: { replyTo: MESSAGE_ID } })

    await press(OWNER_CHAT, `pay:ok:${first.id}`)
    expect(telegram.answers.at(-1)?.text).toBe('Allaqachon tasdiqlangan: A do‘kon')
    expect(paid.planExpiresAt!.getTime()).toBe((await tenant()).planExpiresAt!.getTime())

    const second = (await checkout('basic', 1)).invoice
    await claim(second.id).expect(200)
    await press(OWNER_CHAT, `pay:no:${second.id}`)
    expect((await invoiceRow(second.id)).state).toBe('cancelled')
    expect((await invoiceRow(second.id)).rejectReason).toContain('Tushum topilmadi')
    expect(telegram.answers.at(-1)?.text).toContain('❌ Rad etildi: A do‘kon')

    await press(OWNER_CHAT, 'pay:ok:bu-uuid-emas')
    expect(telegram.answers.at(-1)?.text).toBe('Hisob-faktura topilmadi')
    const confirm = (await platformAudit()).find((e) => e.action === 'invoice.confirm')!
    expect(confirm.diff).toMatchObject({ via: 'telegram', plan: 'basic', months: 3 })
  })

  it('chek: egasiga fayl sifatida (tugmalar bilan), panelda havola; begona tur — 422; GC bog‘langan chekni o‘chirmaydi', async () => {
    await setCard().expect(200)
    const files = filesApi(app, storeAuth)
    const body = await pngImage(120, 240)
    const receiptId = await files.upload(body, 'payment_receipt', 'image/png', 'chek.png')
    const loose = await files.upload(await pngImage(120, 240, 90), 'payment_receipt', 'image/png', 'ortiqcha.png')
    const productImage = await seedFileRow(a.tenantId)

    const { invoice } = await checkout('business', 1)
    expect((await claim(invoice.id, { payerCard: '6311', receiptFileId: productImage.id }).expect(422)).body.errors[0].field).toBe('receiptFileId')
    expect((await claim(invoice.id, { payerCard: '6311', receiptFileId: receiptId }).expect(200)).body.receiptFileId).toBe(receiptId)

    await waitForNotice()
    const [document] = telegram.documents
    expect(document).toMatchObject({ chatId: OWNER_CHAT, file: { name: 'chek.png', mime: 'image/png' } })
    expect(Buffer.from(document!.file.content).equals(body)).toBe(true)
    expect(document!.caption).toContain('•••• 6311')
    expect(document!.opts?.buttons?.[0]?.[0]?.data).toBe(`pay:ok:${invoice.id}`)

    const link = await api().get(`/api/v1/platform/invoices/${invoice.id}/receipt`).set('Authorization', owner).expect(200)
    expect(link.body.mime).toBe('image/png')
    expect(Buffer.from(await (await fetch(link.body.url)).arrayBuffer()).equals(body)).toBe(true)
    const other = await checkout('basic', 1)
    await api().get(`/api/v1/platform/invoices/${other.invoice.id}/receipt`).set('Authorization', owner).expect(404)

    // Bog'lanmagan chek sutkadan keyin o'chadi, hisob-fakturadagisi — yo'q (moliyaviy dalil)
    await app.get(FileGcJobs).gcOrphans(new Date(Date.now() + ORPHAN_GRACE_MS + DAY))
    const [kept, dropped] = await Promise.all([testDb.file.findUniqueOrThrow({ where: { id: receiptId } }), testDb.file.findUniqueOrThrow({ where: { id: loose } })])
    expect([kept.deletedAt, dropped.deletedAt !== null]).toEqual([null, true])
  })

  it('karta kiritilmagan — 422 PAYMENT_METHOD_UNAVAILABLE; egasi qo‘lda `card` usulini yozadi (summa — katalog narxi)', async () => {
    const { invoice, card } = await checkout('business', 1)
    expect(card).toBeNull()
    expect((await claim(invoice.id).expect(422)).body.code).toBe('PAYMENT_METHOD_UNAVAILABLE')

    await api().post(`/api/v1/platform/tenants/${a.tenantId}/plan`).set('Authorization', owner)
      .send({ plan: 'business', months: 6, provider: 'card', note: 'Kartaga o‘tkazdi' }).expect(200)
    const manual = await testDb.billingInvoice.findFirstOrThrow({ where: { tenantId: a.tenantId, provider: 'card' } })
    expect(manual).toMatchObject({ state: 'paid', months: 6, amount: BigInt(planPrice('business', 6)) })
  })
})
