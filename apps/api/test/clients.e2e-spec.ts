import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'
import { captureQueries, explain } from './helpers/queries'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

describe('Mijozlar (/clients)', () => {
  let app: INestApplication
  let a: Tenant
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

  const http = () => request(app.getHttpServer())

  const createClient = async (body: Record<string, unknown> = {}): Promise<string> => {
    const res = await http()
      .post('/api/v1/clients')
      .set('Authorization', auth)
      .send({ name: 'Alisher Qodirov', phone: '+998 90 123-45-67', ...body })
      .expect(201)
    return res.body.id as string
  }

  /** Nasiya cheki — sotuv moduli (E6) hali yo'q, shuning uchun bazaga */
  const seedSale = async (
    customerId: string,
    status: 'pending' | 'completed' | 'cancelled',
    total: bigint,
    paid: bigint,
  ): Promise<void> => {
    const count = await testDb.sale.count({ where: { tenantId: a.tenantId } })
    await testDb.sale.create({
      data: {
        tenantId: a.tenantId, number: `CHEK-${1001 + count}`, customerId, status,
        subtotal: total, total, paidCash: paid, date: new Date('2026-09-01'),
      },
    })
  }

  it('yaratish: guruh, nasiya limiti, to‘lov muddati; telefon bir ko‘rinishda', async () => {
    const res = await http()
      .post('/api/v1/clients')
      .set('Authorization', auth)
      .send({
        name: 'Qurilish Servis MChJ', phone: '+998 (71) 233-22-11', type: 'company',
        group: 'wholesale', creditLimit: 30_000_000, paymentTermDays: 21,
      })
      .expect(201)
    expect(res.body).toMatchObject({
      phone: '+998712332211',
      type: 'company',
      group: 'wholesale',
      status: 'lead',
      creditLimit: 30_000_000,
      paymentTermDays: 21,
      bonusPoints: 0,
      email: '',
    })
  })

  it('noto‘g‘ri qiymatlar: guruh, telefon, manfiy limit, bonusni qo‘lda berish', async () => {
    const bad = [
      { group: 'gold' },
      { phone: '12-34' },
      { creditLimit: -1 },
      { paymentTermDays: 400 },
      { email: 'emas' },
      { bonusPoints: 100 }, // I17: bonus faqat sotuv orqali
    ]
    for (const body of bad) {
      await http()
        .post('/api/v1/clients')
        .set('Authorization', auth)
        .send({ name: 'X', phone: '+998901112233', ...body })
        .expect(400)
    }
  })

  it('qarzi bor mijozni o‘chirish → 409 CLIENT_HAS_DEBT (qarz summasi bilan)', async () => {
    const id = await createClient()
    await seedSale(id, 'pending', 1_000_000n, 250_000n)

    const res = await http().delete(`/api/v1/clients/${id}`).set('Authorization', auth).expect(409)
    expect(res.body.code).toBe('CLIENT_HAS_DEBT')
    expect(res.body.errors[0].meta).toEqual({ debt: 750_000 })
    expect((await testDb.client.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull()
  })

  it('karta raqamlari: sof xarid, qarz, muddati o‘tgani, oxirgi xarid, cheklar soni — serverda', async () => {
    const id = await createClient()
    await seedSale(id, 'completed', 500_000n, 500_000n)
    await seedSale(id, 'pending', 1_000_000n, 250_000n)
    await seedSale(id, 'cancelled', 900_000n, 0n)

    const stats = (await http().get(`/api/v1/clients/${id}/stats`).set('Authorization', auth).expect(200)).body
    expect(stats).toMatchObject({ totalSpent: 1_500_000, debt: 750_000, overdue: 0 })
    expect(stats.lastPurchase).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const [row] = (await http().get('/api/v1/clients').set('Authorization', auth).query({ q: 'Alisher' }).expect(200)).body.items
    expect(row).toMatchObject({ id, salesCount: 3 })
    await http().get('/api/v1/clients/00000000-0000-4000-8000-000000000000/stats').set('Authorization', auth).expect(404)
  })

  it('to‘langan yoki bekor qilingan cheklar o‘chirishga to‘sqinlik qilmaydi', async () => {
    const id = await createClient()
    await seedSale(id, 'completed', 500_000n, 500_000n)
    await seedSale(id, 'cancelled', 900_000n, 0n)

    await http().delete(`/api/v1/clients/${id}`).set('Authorization', auth).expect(204)
    await http().get(`/api/v1/clients/${id}`).set('Authorization', auth).expect(404)
    await http().post(`/api/v1/clients/${id}/restore`).set('Authorization', auth).expect(200)
  })

  it('qidiruv: nom, kompaniya va telefon raqamlari; filtrlar', async () => {
    await createClient({ name: 'Alisher Qodirov', phone: '+998901234567', group: 'vip' })
    await createClient({ name: 'Zafar', company: 'Beton Plus', phone: '+998935551122', status: 'active' })

    const names = async (query: string) =>
      (await http().get(`/api/v1/clients${query}`).set('Authorization', auth).expect(200)).body.items.map(
        (c: { name: string }) => c.name,
      )
    expect(await names('?q=alisher')).toEqual(['Alisher Qodirov'])
    expect(await names('?q=beton')).toEqual(['Zafar'])
    // Raqamlar formatdan qat'i nazar topiladi
    expect(await names('?q=93 555')).toEqual(['Zafar'])
    expect(await names('?group=vip')).toEqual(['Alisher Qodirov'])
    expect(await names('?status=active')).toEqual(['Zafar'])
    expect(await names('?phone=%2B998 90 123 45 67')).toEqual(['Alisher Qodirov'])
  })

  it('telefon bo‘yicha qidiruv indeksdan foydalanadi (API yuborgan so‘rov rejasi)', async () => {
    // Planner indeksni haqiqiy hajmda tanlaydi — kichik jadvalda ketma-ket
    // o'qish arzonroq bo'lgani uchun katta mijozlar bazasi yaratiladi
    await testDb.$executeRawUnsafe(
      `INSERT INTO clients (id, tenant_id, name, phone, created_at)
       SELECT gen_random_uuid(), $1::uuid, 'Mijoz ' || g, '+99890' || lpad(g::text, 7, '0'), now()
         FROM generate_series(1, 20000) g`,
      a.tenantId,
    )
    await testDb.$executeRawUnsafe('ANALYZE clients')

    const { result, events } = await captureQueries(() =>
      http().get('/api/v1/clients?phone=%2B998900012345').set('Authorization', auth),
    )
    expect(result.status).toBe(200)
    expect(result.body.items).toHaveLength(1)

    const page = events.find((e) => /FROM "public"\."clients"/.test(e.query) && /LIMIT/.test(e.query))!
    const plan = await explain(page)
    expect(plan).toMatch(/clients_tenant_id_phone_idx/)
    expect(plan).not.toMatch(/Seq Scan on clients/)
  })

  it('sotuvchi mijoz qo‘shadi (customers huquqi), omborchi faqat ko‘radi', async () => {
    await http()
      .post('/api/v1/clients')
      .set('Authorization', await bearer(app, a, 'sotuvchi'))
      .send({ name: 'Yangi', phone: '+998901112233' })
      .expect(201)
    const storekeeper = await bearer(app, a, 'omborchi')
    await http().get('/api/v1/clients').set('Authorization', storekeeper).expect(200)
    await http()
      .post('/api/v1/clients')
      .set('Authorization', storekeeper)
      .send({ name: 'Yangi', phone: '+998901112233' })
      .expect(403)
  })

  it('tahrirlash va sukut tartib — yangilari birinchi', async () => {
    const first = await createClient({ name: 'Birinchi' })
    await createClient({ name: 'Ikkinchi' })
    await http()
      .patch(`/api/v1/clients/${first}`)
      .set('Authorization', auth)
      .send({ creditLimit: null, notes: 'Doimiy mijoz' })
      .expect(200)

    const res = await http().get('/api/v1/clients').set('Authorization', auth).expect(200)
    expect(res.body.items.map((c: { name: string }) => c.name)).toEqual(['Ikkinchi', 'Birinchi'])
    expect(res.body.items[1]).toMatchObject({ creditLimit: null, notes: 'Doimiy mijoz' })
  })
})
