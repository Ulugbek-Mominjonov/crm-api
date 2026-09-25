import { createHash } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PLAN_MONTHLY_PRICE } from '@crm/shared'
import { PAYME } from '@/modules/billing/payme.service'
import { CLICK } from '@/modules/billing/click.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'

const PAYME_AUTH = `Basic ${Buffer.from(`Paycom:${process.env.PAYME_KEY}`).toString('base64')}`
const CLICK_SECRET = process.env.CLICK_SECRET_KEY!
const CLICK_SERVICE = process.env.CLICK_SERVICE_ID!

/**
 * To'lov webhooklari (T-126): tarif FAQAT to'lov tasdiqlanganda o'zgaradi;
 * webhook takrorlansa tarif ikki marta uzaymaydi; imzo/kalit tekshiriladi.
 */
describe('Obuna to‘lovlari (Payme, Click)', () => {
  let app: INestApplication
  let a: Awaited<ReturnType<typeof seedTenant>>
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
    auth = await bearer(app, a)
  })

  const api = () => request(app.getHttpServer())
  const invoice = async (plan = 'basic', months = 1) =>
    (await api().post('/api/v1/billing/invoices').set('Authorization', auth).send({ plan, months }).expect(201)).body
  const tenant = () => testDb.tenant.findUniqueOrThrow({ where: { id: a.tenantId } })
  let rpcId = 0
  const payme = (method: string, params: Record<string, unknown>, authorization = PAYME_AUTH) =>
    api().post('/api/v1/billing/payme').set('Authorization', authorization).send({ jsonrpc: '2.0', id: ++rpcId, method, params }).expect(200)

  it('hisob-faktura: summa tarif × oy, to‘lov havolalari; faqat administrator', async () => {
    const checkout = await invoice('pro', 3)
    expect(checkout.invoice).toMatchObject({ plan: 'pro', months: 3, amount: PLAN_MONTHLY_PRICE.pro * 3, state: 'created' })
    const decoded = Buffer.from(checkout.payme.split('/').at(-1), 'base64').toString()
    expect(decoded).toBe(`m=${process.env.PAYME_MERCHANT_ID};ac.order_id=${checkout.invoice.id};a=${PLAN_MONTHLY_PRICE.pro * 300}`)
    expect(checkout.click).toContain(`transaction_param=${checkout.invoice.id}`)
    await api().post('/api/v1/billing/invoices').set('Authorization', await bearer(app, a, 'manager')).send({ plan: 'pro', months: 1 }).expect(403)
    await api().post('/api/v1/billing/invoices').set('Authorization', auth).send({ plan: 'free', months: 1 }).expect(400)
  })

  describe('Payme', () => {
    it('to‘liq oqim: tekshirish → yaratish → bajarish; tarif faqat bajarilganda, takror — bir marta', async () => {
      const { invoice: inv } = await invoice('basic', 2)
      const amount = inv.amount * 100
      expect((await payme('CheckPerformTransaction', { amount, account: { order_id: inv.id } })).body.result).toEqual({ allow: true })

      const created = await payme('CreateTransaction', { id: 'pm-tx-1', time: Date.now(), amount, account: { order_id: inv.id } })
      expect(created.body.result).toMatchObject({ transaction: inv.id, state: 1 })
      // Takroriy yaratish — o'sha javob; hali tarif o'zgarmagan
      expect((await payme('CreateTransaction', { id: 'pm-tx-1', time: Date.now(), amount, account: { order_id: inv.id } })).body.result)
        .toEqual(created.body.result)
      expect(await tenant()).toMatchObject({ plan: 'free', planExpiresAt: null })

      const performed = await payme('PerformTransaction', { id: 'pm-tx-1' })
      expect(performed.body.result).toMatchObject({ transaction: inv.id, state: 2 })
      const after = await tenant()
      expect(after.plan).toBe('basic')
      const expires = after.planExpiresAt!.getTime()
      expect(expires - Date.now()).toBeGreaterThan(58 * 24 * 3_600_000)

      // Webhook takrorlandi — tarif ikkinchi marta uzaymaydi
      expect((await payme('PerformTransaction', { id: 'pm-tx-1' })).body.result).toEqual(performed.body.result)
      expect((await tenant()).planExpiresAt!.getTime()).toBe(expires)
      expect((await payme('CheckTransaction', { id: 'pm-tx-1' })).body.result).toMatchObject({ state: 2, transaction: inv.id })
      expect((await payme('CancelTransaction', { id: 'pm-tx-1', reason: 5 })).body.error.code).toBe(PAYME.CANNOT_CANCEL)
      expect(await testDb.auditEntry.count({ where: { tenantId: a.tenantId, action: 'billing.paid' } })).toBe(1)
    })

    it('xatolar: kalit, summa, buyurtma, band buyurtma, noma’lum tranzaksiya; bekor — tarif o‘zgarmaydi', async () => {
      const { invoice: inv } = await invoice()
      const amount = inv.amount * 100
      expect((await payme('CheckPerformTransaction', { amount, account: { order_id: inv.id } }, 'Basic xato')).body.error.code).toBe(PAYME.UNAUTHORIZED)
      expect((await payme('CheckPerformTransaction', { amount: amount - 1, account: { order_id: inv.id } })).body.error.code).toBe(PAYME.WRONG_AMOUNT)
      expect((await payme('CheckPerformTransaction', { amount, account: { order_id: 'yoq' } })).body.error).toMatchObject({ code: PAYME.ORDER_NOT_FOUND, data: 'order_id' })
      expect((await payme('PerformTransaction', { id: 'yoq' })).body.error.code).toBe(PAYME.TX_NOT_FOUND)
      expect((await payme('Nomalum', {})).body.error.code).toBe(PAYME.METHOD_NOT_FOUND)

      await payme('CreateTransaction', { id: 'pm-a', time: Date.now(), amount, account: { order_id: inv.id } })
      expect((await payme('CreateTransaction', { id: 'pm-b', time: Date.now(), amount, account: { order_id: inv.id } })).body.error.code).toBe(PAYME.ORDER_BUSY)
      expect((await payme('CancelTransaction', { id: 'pm-a', reason: 3 })).body.result).toMatchObject({ state: -1 })
      expect((await payme('PerformTransaction', { id: 'pm-a' })).body.error.code).toBe(PAYME.CANNOT_PERFORM)
      expect(await tenant()).toMatchObject({ plan: 'free' })
    })

    it('muddati o‘tgan (12 soat) tranzaksiya bajarilmaydi va bekor qilinadi', async () => {
      const { invoice: inv } = await invoice()
      await payme('CreateTransaction', { id: 'pm-old', time: Date.now() - 13 * 3_600_000, amount: inv.amount * 100, account: { order_id: inv.id } })
      expect((await payme('PerformTransaction', { id: 'pm-old' })).body.error.code).toBe(PAYME.CANNOT_PERFORM)
      expect((await testDb.billingInvoice.findUniqueOrThrow({ where: { id: inv.id } }))).toMatchObject({ state: 'cancelled', cancelReason: 4 })
    })

    it('GetStatement — oraliqdagi tranzaksiyalar', async () => {
      const { invoice: inv } = await invoice()
      const time = Date.now()
      await payme('CreateTransaction', { id: 'pm-st', time, amount: inv.amount * 100, account: { order_id: inv.id } })
      const res = await payme('GetStatement', { from: time - 1000, to: time + 1000 })
      expect(res.body.result.transactions).toEqual([
        expect.objectContaining({ id: 'pm-st', time, amount: inv.amount * 100, account: { order_id: inv.id }, state: 1 }),
      ])
    })
  })

  describe('Click', () => {
    const sign = (p: Record<string, string>) =>
      createHash('md5')
        .update(`${p.click_trans_id}${p.service_id}${CLICK_SECRET}${p.merchant_trans_id}${p.merchant_prepare_id ?? ''}${p.amount}${p.action}${p.sign_time}`)
        .digest('hex')
    const click = async (path: 'prepare' | 'complete', fields: Record<string, string>) => {
      const body = { service_id: CLICK_SERVICE, click_paydoc_id: '777', error: '0', error_note: 'Success', sign_time: '2026-09-23 12:00:00', ...fields }
      const form = { ...body, sign_string: fields.sign_string ?? sign(body) }
      return (await api().post(`/api/v1/billing/click/${path}`).type('form').send(form).expect(200)).body
    }

    it('prepare → complete: tarif uzayadi; takroriy complete — o‘sha javob, bir marta', async () => {
      const { invoice: inv } = await invoice('pro', 1)
      const amount = `${inv.amount}.00`
      const prepared = await click('prepare', { click_trans_id: 'ck-1', merchant_trans_id: inv.id, amount, action: '0' })
      expect(prepared).toMatchObject({ error: CLICK.SUCCESS, click_trans_id: 'ck-1', merchant_trans_id: inv.id })
      expect(await tenant()).toMatchObject({ plan: 'free' })

      const complete = { click_trans_id: 'ck-1', merchant_trans_id: inv.id, merchant_prepare_id: prepared.merchant_prepare_id, amount, action: '1' }
      const done = await click('complete', complete)
      expect(done).toMatchObject({ error: CLICK.SUCCESS, merchant_confirm_id: prepared.merchant_prepare_id })
      const expires = (await tenant()).planExpiresAt!.getTime()
      expect(await tenant()).toMatchObject({ plan: 'pro' })
      expect(await click('complete', complete)).toMatchObject({ error: CLICK.SUCCESS })
      expect((await tenant()).planExpiresAt!.getTime()).toBe(expires)
    })

    it('imzo, summa, buyurtma xatolari; Click tomonida xato — bekor, tarif o‘zgarmaydi', async () => {
      const { invoice: inv } = await invoice()
      const amount = `${inv.amount}.00`
      expect(await click('prepare', { click_trans_id: 'ck-2', merchant_trans_id: inv.id, amount, action: '0', sign_string: 'a'.repeat(32) }))
        .toMatchObject({ error: CLICK.SIGN_FAILED })
      expect(await click('prepare', { click_trans_id: 'ck-2', merchant_trans_id: inv.id, amount: '1.00', action: '0' })).toMatchObject({ error: CLICK.WRONG_AMOUNT })
      expect(await click('prepare', { click_trans_id: 'ck-2', merchant_trans_id: '00000000-0000-0000-0000-000000000000', amount, action: '0' }))
        .toMatchObject({ error: CLICK.ORDER_NOT_FOUND })

      const prepared = await click('prepare', { click_trans_id: 'ck-2', merchant_trans_id: inv.id, amount, action: '0' })
      const failed = await click('complete', {
        click_trans_id: 'ck-2', merchant_trans_id: inv.id, merchant_prepare_id: prepared.merchant_prepare_id, amount, action: '1', error: '-5017',
      })
      expect(failed).toMatchObject({ error: CLICK.CANCELLED })
      expect(await tenant()).toMatchObject({ plan: 'free' })
      expect(await testDb.billingInvoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ state: 'cancelled' })
    })
  })
})
