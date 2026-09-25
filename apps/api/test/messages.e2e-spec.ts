import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedClient, seedTenant, testDb, truncateAll } from './helpers/db'

/**
 * Xabarlar jurnali (T-076): qabul qiluvchilar serverda (mijoz / guruh /
 * qarzdorlar / hammasi), shablon o'zgaruvchilari, jurnal. Provayder `none`
 * — faqat jurnal (demo rejim).
 */
describe('Xabarlar (/messages)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
  let auth: string
  let ali: string
  let vali: string

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

  it('qabul qiluvchilar serverda: mijoz, guruh, qarzdorlar, hammasi (telefonsizlar kirmaydi)', async () => {
    expect((await preview({ target: 'customer', customerId: vali })).body).toEqual({ recipients: 1, label: 'Vali' })
    expect((await preview({ target: 'group', group: 'wholesale' })).body).toEqual({ recipients: 1, label: 'Guruh: Ulgurji' })
    expect((await preview({ target: 'debtors' })).body).toEqual({ recipients: 1, label: 'Qarzdorlar' })
    expect((await preview({ target: 'all' })).body).toEqual({ recipients: 2, label: 'Barcha mijozlar' })
  })

  it('shablon har qabul qiluvchi uchun; jurnal holat statistikasi bilan', async () => {
    const res = await send({ target: 'debtors', text: 'Hurmatli {name}, qarzingiz {debt} so‘m, bonusingiz {bonus}. {store}', template: 'debt' }).expect(201)
    expect(res.body).toMatchObject({
      target: 'debtors', recipientLabel: 'Qarzdorlar', recipients: 1, template: 'debt', deliveryStatus: 'logged',
      stats: { queued: 0, sent: 0, failed: 0, logged: 1 }, userId: a.userId,
    })
    const [row] = await testDb.messageRecipient.findMany({ where: { messageId: res.body.id } })
    expect(row).toMatchObject({ clientId: ali, status: 'logged' })
    expect(row!.text.replace(/\s/g, ' ')).toBe('Hurmatli Ali, qarzingiz 1 250 000 so‘m, bonusingiz 500. Qurilish Mollari')

    const list = await api().get('/api/v1/messages').set('Authorization', auth).expect(200)
    expect(list.body).toMatchObject({ total: 1, items: [{ id: res.body.id }] })
    expect(await testDb.auditEntry.count({ where: { action: 'message.send' } })).toBe(1)
  })

  it('qabul qiluvchi yo‘q — 400; mijoz tanlanmagan — 400; omborchi yubora olmaydi', async () => {
    await send({ target: 'group', group: 'vip', text: 'x' }).expect(400)
    await send({ target: 'customer', text: 'x' }).expect(400)
    await send({ target: 'all', text: 'x' }, await bearer(app, a, 'omborchi')).expect(403)
  })
})
