import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import type { EmployeeStatus } from '@prisma/client'
import request from 'supertest'
import { businessDate } from '@/common/time'
import { PayrollJobs } from '@/modules/payroll/payroll.jobs'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { openShift, roleIdOf, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { salesApi } from './helpers/sales'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

/**
 * Maosh hisobi (T-142): xodim sozlamalari; tungi hisoblash — o'tgan oy uchun
 * hisoblash kuni kelganda, qisman oy, savdodan bonus (qaytarish ayrilgan),
 * davrga bir marta; to'lovlar kassa bilan; oylik varaq (qoldiq ko'chadi);
 * foyda hisobotida hisoblangan maosh `salary` xarajati.
 */
describe('Maosh hisobi (/payroll)', () => {
  let app: INestApplication
  let a: Tenant
  let admin: string
  let seller: string
  let sellerId: string
  let shiftId: string

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
    admin = await bearer(app, a)
    seller = await bearer(app, a, 'sotuvchi')
    sellerId = (await testDb.user.findFirstOrThrow({ where: { tenantId: a.tenantId, email: { startsWith: 'sotuvchi+' } } })).employeeId
    shiftId = await openShift(a.tenantId, 5_000_000n)
  })

  const api = () => request(app.getHttpServer())
  const get = (path: string, token = admin) => api().get(`/api/v1/${path}`).set('Authorization', token)
  const post = (path: string, body: Record<string, unknown>, token = admin) =>
    api().post(`/api/v1/${path}`).set('Authorization', token).set('Idempotency-Key', randomUUID()).send(body)
  const jobs = () => app.get(PayrollJobs)
  const cash = async () => Number((await testDb.tenantState.findUniqueOrThrow({ where: { tenantId: a.tenantId } })).cashBalance)
  const employee = (data: { name: string; hiredAt?: Date; payrollFrom?: Date; salary?: bigint; status?: EmployeeStatus }) =>
    testDb.employee.create({
      data: { tenantId: a.tenantId, position: 'Xodim', phone: '+998900000002', hiredAt: new Date('2026-01-01'), payrollFrom: new Date('2026-01-01'), ...data },
      select: { id: true },
    })
  /** Sotuvchi 2026-09 da 2 chek (201 600, QQS bilan — I4 tushum qoidasi), bittasidan 1 qop qaytgan (−67 200) → asos 134 400 */
  const septemberSales = async () => {
    const p = await seedProduct(a.tenantId, a.warehouseId)
    const sales = salesApi(app, seller)
    const paid = { cash: 1_000_000, card: 0, transfer: 0 }
    const first = await sales.sell({ date: '2026-09-10', items: [{ productId: p, qty: 2 }], paid })
    await sales.sell({ date: '2026-09-20', items: [{ productId: p, qty: 1 }], paid })
    const ret = await sales.giveBack(first.id, [{ saleItemId: first.items[0].id, qty: 1 }])
    await testDb.sale.update({ where: { id: ret.id }, data: { date: new Date('2026-09-25') } })
    // Oktabrdagi chek davrga kirmaydi
    await sales.sell({ date: '2026-10-02', items: [{ productId: p, qty: 1 }], paid })
  }
  /** Sotuvchi xodimi: `bearer` uni hisob boshlanishisiz yaratadi (sukut — bugun), shuning uchun yanvardan */
  const configureSeller = (data: Record<string, unknown>) =>
    testDb.employee.update({ where: { id: sellerId }, data: { payrollFrom: new Date('2026-01-01'), ...data } })

  it('xodim sozlamalari: sukut (1-kun, 0%, hisob — ishga kirgan kundan), chegaralar 400, sotuvchiga yashirin', async () => {
    const res = await post('employees', { name: 'Bobur', position: 'Kassir', phone: '+998901112233', hiredAt: '2026-10-05', salary: 3_000_000 }).expect(201)
    expect(res.body).toMatchObject({ salary: 3_000_000, salaryDay: 1, salesBonusPct: 0, payrollFrom: '2026-10-05' })
    const patch = (body: Record<string, unknown>) =>
      api().patch(`/api/v1/employees/${res.body.id}`).set('Authorization', admin).set('If-Match', res.body.updatedAt).send(body)
    await patch({ salaryDay: 0 }).expect(400)
    await patch({ salaryDay: 29 }).expect(400)
    await patch({ salesBonusPct: 101 }).expect(400)
    await patch({ salesBonusPct: 2.555 }).expect(400)
    const ok = await patch({ salaryDay: 5, salesBonusPct: 2.5, payrollFrom: '2026-09-01' }).expect(200)
    expect(ok.body).toMatchObject({ salaryDay: 5, salesBonusPct: 2.5, payrollFrom: '2026-09-01' })

    // Xodimlarni ko'radigan, lekin `salary.view` siz rol — maosh sozlamalari javobda yo'q
    const viewer = await testDb.role.create({ data: { tenantId: a.tenantId, name: 'Ko‘ruvchi', permissions: ['employees.view'] } })
    await testDb.user.updateMany({ where: { tenantId: a.tenantId, email: { startsWith: 'sotuvchi+' } }, data: { roleId: viewer.id } })
    const hidden = await get(`employees/${res.body.id}`, seller).expect(200)
    expect(hidden.body).toMatchObject({ name: 'Bobur' })
    expect(Object.keys(hidden.body)).not.toEqual(expect.arrayContaining(['salary', 'salaryDay', 'salesBonusPct', 'payrollFrom']))
  })

  it('tungi hisoblash: hisoblash kuni kelganda o‘tgan oy — maosh (qisman oy kunlarga), bonus (savdo − qaytarish), davrga bir marta, o‘chirilgani qaytmaydi', async () => {
    await configureSeller({ salary: 3_000_000n, salesBonusPct: 2, salaryDay: 5 })
    const half = await employee({ name: 'Yarim oy', hiredAt: new Date('2026-09-16'), payrollFrom: new Date('2026-09-16'), salary: 3_000_000n })
    await employee({ name: 'Bo‘shatilgan', status: 'fired', salary: 3_000_000n })
    await employee({ name: 'Oktabrdan', payrollFrom: new Date('2026-10-01'), salary: 3_000_000n })
    await employee({ name: 'Maoshsiz' })
    await septemberSales()

    // 3-oktabr: sotuvchining kuni (5) kelmagan; «Yarim oy» kuni 1 — lekin cron hammasini bir xil tartibda ko'radi
    expect(await jobs().runAll(new Date('2026-10-03T06:00:00Z'))).toBe(1)
    expect(await jobs().runAll(new Date('2026-10-05T06:00:00Z'))).toBe(2)
    expect(await jobs().runAll(new Date('2026-10-20T06:00:00Z'))).toBe(0)

    const mine = (await get(`payroll/entries?employeeId=${sellerId}`).expect(200)).body
    expect(mine.total).toBe(2)
    expect(mine.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'salary', amount: 3_000_000, date: '2026-09-30', period: '2026-09', auto: true, baseAmount: 3_000_000, rate: null, note: null }),
      expect.objectContaining({ type: 'bonus', amount: 2_688, date: '2026-09-30', auto: true, baseAmount: 134_400, rate: 2 }),
    ]))
    const partial = (await get(`payroll/entries?employeeId=${half.id}`).expect(200)).body
    expect(partial.items).toEqual([expect.objectContaining({ type: 'salary', amount: 1_500_000, baseAmount: 3_000_000, note: '15/30 kun' })])
    expect(await testDb.payrollEntry.count()).toBe(3)
    expect(await testDb.auditEntry.count({ where: { action: 'payroll.run' } })).toBe(2)

    // Egasi bonusni o'chirdi — keyingi tun qayta hisoblamaydi; qo'lda ishga tushirish ham
    const bonus = mine.items.find((e: { type: string }) => e.type === 'bonus')
    await api().delete(`/api/v1/payroll/entries/${bonus.id}`).set('Authorization', admin).expect(204)
    expect(await jobs().runAll(new Date('2026-10-21T06:00:00Z'))).toBe(0)
    expect((await post('payroll/run-due', {}).expect(200)).body).toEqual({ created: 0 })
  })

  it('parallel ikki instansiya davrni ikki marta hisoblamaydi', async () => {
    await configureSeller({ salary: 3_000_000n })
    const now = new Date('2026-10-05T06:00:00Z')
    const [x, y] = await Promise.all([jobs().runAll(now), jobs().runAll(now)])
    expect(x + y).toBe(1)
    expect(await testDb.payrollEntry.count()).toBe(1)
  })

  it('to‘lov: naqd — kassadan va smena hisobotida, bank — ta’sirsiz, smenasiz 423; o‘chirish qaytaradi, tiklash yana chiqaradi; ruxsatlar', async () => {
    const advance = await post('payroll/payments', { employeeId: sellerId, type: 'advance', amount: 500_000, method: 'cash', note: 'Avans' }).expect(201)
    expect(advance.body).toMatchObject({ type: 'advance', amount: 500_000, method: 'cash', shiftId, period: businessDate().slice(0, 7), userId: a.userId })
    expect(await cash()).toBe(4_500_000)
    const bank = await post('payroll/payments', { employeeId: sellerId, type: 'payment', amount: 1_000_000, method: 'bank' }).expect(201)
    expect(bank.body.shiftId).toBeNull()
    expect(await cash()).toBe(4_500_000)
    expect((await get(`cash/shifts/${shiftId}/report`).expect(200)).body).toMatchObject({ expenses: 0, salaryPayments: 500_000 })

    await api().delete(`/api/v1/payroll/entries/${advance.body.id}`).set('Authorization', admin).expect(204)
    expect(await cash()).toBe(5_000_000)
    await post(`payroll/entries/${advance.body.id}/restore`, {}).expect(200)
    expect(await cash()).toBe(4_500_000)

    await testDb.tenantState.update({ where: { tenantId: a.tenantId }, data: { activeShiftId: null } })
    expect((await post('payroll/payments', { employeeId: sellerId, type: 'advance', amount: 1, method: 'cash' }).expect(423)).body.code).toBe('SHIFT_REQUIRED')
    await api().delete(`/api/v1/payroll/entries/${advance.body.id}`).set('Authorization', admin).expect(423)

    // DTO: to'lov turi hisoblashga va aksincha — 400; yo'q xodim — 404
    await post('payroll/accruals', { employeeId: sellerId, type: 'advance', amount: 1 }).expect(400)
    await post('payroll/payments', { employeeId: sellerId, type: 'award', amount: 1, method: 'bank' }).expect(400)
    await post('payroll/accruals', { employeeId: randomUUID(), type: 'award', amount: 1 }).expect(404)

    // Sukutda hech bir rolda yo'q; administrator menejer roliga `payroll.view` beradi — keyingi so'rovdanoq
    // (kesh COMMIT'da tozalanadi): ko'radi, lekin hisoblash/to'lash/o'chirish — alohida ruxsat
    const manager = await bearer(app, a, 'manager')
    await get('payroll', seller).expect(403)
    await post('payroll/payments', { employeeId: sellerId, type: 'advance', amount: 1, method: 'bank' }, seller).expect(403)
    await get('payroll', manager).expect(403)
    const roleId = await roleIdOf(a.tenantId, 'manager')
    const role = (await get(`roles/${roleId}`).expect(200)).body
    await api().patch(`/api/v1/roles/${roleId}`).set('Authorization', admin).set('If-Match', role.updatedAt)
      .send({ permissions: [...role.permissions, 'payroll.view'] }).expect(200)
    await get('payroll', manager).expect(200)
    await post('payroll/accruals', { employeeId: sellerId, type: 'award', amount: 1 }, manager).expect(403)
    expect((await api().delete(`/api/v1/payroll/entries/${bank.body.id}`).set('Authorization', manager).expect(403)).body.code).toBe('PERMISSION_DENIED')
  })

  it('oylik varaq: davr boshidagi qoldiq keyingi oyga ko‘chadi, jarima ayiradi, bo‘shatilgan — faqat yozuvi yoki qoldig‘i bo‘lsa', async () => {
    await configureSeller({ salary: 3_000_000n, salesBonusPct: 2, salaryDay: 5 })
    const fired = await employee({ name: 'Bo‘shatilgan', status: 'fired' })
    await septemberSales()
    expect(await jobs().runAll(new Date('2026-10-05T06:00:00Z'))).toBe(2)
    await post('payroll/payments', { employeeId: sellerId, type: 'advance', amount: 500_000, method: 'cash', date: '2026-10-03' }).expect(201)
    await post('payroll/payments', { employeeId: sellerId, type: 'payment', amount: 1_000_000, method: 'bank', date: '2026-10-05' }).expect(201)
    await post('payroll/accruals', { employeeId: sellerId, type: 'penalty', amount: 100_000, date: '2026-10-07', note: 'Kech kelish' }).expect(201)

    const sep = (await get('payroll?period=2026-09').expect(200)).body
    expect(sep).toMatchObject({ period: '2026-09', start: '2026-09-01', end: '2026-09-30' })
    expect(sep.rows.map((r: { employeeId: string }) => r.employeeId)).not.toContain(fired.id)
    expect(sep.rows.find((r: { employeeId: string }) => r.employeeId === sellerId)).toMatchObject({
      name: 'Sinov sotuvchi', salary: 3_000_000, salaryDay: 5, salesBonusPct: 2, payrollFrom: '2026-01-01',
      opening: 0, accruedSalary: 3_000_000, bonus: 2_688, award: 0, penalty: 0, earned: 3_002_688,
      advance: 0, payment: 0, paid: 0, closing: 3_002_688, accrued: true,
    })
    expect(sep.totals).toMatchObject({ earned: 3_002_688, paid: 0, closing: 3_002_688 })

    const oct = (await get('payroll?period=2026-10').expect(200)).body
    expect(oct.rows.find((r: { employeeId: string }) => r.employeeId === sellerId)).toMatchObject({
      opening: 3_002_688, accruedSalary: 0, bonus: 0, penalty: 100_000, earned: -100_000,
      advance: 500_000, payment: 1_000_000, paid: 1_500_000, closing: 1_402_688, accrued: false,
    })
    // Bo'shatilganga qarz qolsa — ko'rinadi
    await post('payroll/accruals', { employeeId: fired.id, type: 'award', amount: 50_000, date: '2026-10-01' }).expect(201)
    const again = (await get('payroll?period=2026-10').expect(200)).body
    expect(again.rows.find((r: { employeeId: string }) => r.employeeId === fired.id)).toMatchObject({ status: 'fired', earned: 50_000, closing: 50_000 })
    expect((await get('payroll?period=2026-13').expect(400)).body.code).toBe('VALIDATION_FAILED')
  })

  it('foyda hisoboti va bosh sahifa: hisoblangan maosh — `salary` xarajati (jarima ayiradi), to‘lovlar xarajat emas', async () => {
    await configureSeller({ salary: 3_000_000n, salesBonusPct: 2, salaryDay: 1 })
    await septemberSales()
    expect(await jobs().runAll(new Date('2026-10-01T06:00:00Z'))).toBe(2)
    await post('payroll/payments', { employeeId: sellerId, type: 'payment', amount: 3_000_000, method: 'cash' }).expect(201)
    await post('payroll/accruals', { employeeId: sellerId, type: 'award', amount: 50_000 }).expect(201)
    await post('payroll/accruals', { employeeId: sellerId, type: 'penalty', amount: 20_000 }).expect(201)
    await post('expenses', { category: 'transport', amount: 30_000, method: 'bank' }).expect(201)

    const pnl = (await get('reports/pnl?from=2026-09-01&to=2026-09-30').expect(200)).body
    expect(pnl.current).toMatchObject({ expenses: 3_002_688, netProfit: pnl.current.grossProfit - 3_002_688 })
    expect(pnl.expensesByCategory).toEqual([{ category: 'salary', amount: 3_002_688 }])

    const today = (await get('dashboard?days=7').expect(200)).body
    expect(today.today.expenses).toBe(30_000 + 50_000 - 20_000)
  })
})
