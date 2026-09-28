import type { INestApplication } from '@nestjs/common'
import type { Role } from '@prisma/client'
import request from 'supertest'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer, type TokenSubject } from './helpers/auth'
import { seedTenant, testDb, truncateAll } from './helpers/db'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

const PASSWORD = 'Qurilish2026!'

describe('Xodimlar va foydalanuvchilar (/employees, /users)', () => {
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

  const createEmployee = async (name: string, position = 'Kassir', token = auth): Promise<string> => {
    const res = await http()
      .post('/api/v1/employees')
      .set('Authorization', token)
      .send({ name, position, phone: '+998 90 111 22 33', hiredAt: '2026-01-15', salary: 4_500_000 })
      .expect(201)
    return res.body.id as string
  }

  /** Xodim + kirish hisobi; token uchun subyekt ham qaytadi */
  const createUser = async (
    name: string,
    role: Role,
    email = `${name.toLowerCase()}@crm.uz`,
  ): Promise<TokenSubject & { id: string }> => {
    const employeeId = await createEmployee(name)
    const res = await http()
      .post('/api/v1/users')
      .set('Authorization', auth)
      .send({ employeeId, email, password: PASSWORD, role })
      .expect(201)
    return { id: res.body.id, userId: res.body.id, tenantId: a.tenantId, employeeId }
  }

  const login = (email: string, password = PASSWORD) =>
    http().post('/api/v1/auth/login').send({ email, password })

  const refreshCookie = (res: request.Response): string =>
    (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!

  describe('D1: kirish hisobi doim xodimga tegishli', () => {
    it('xodimsiz foydalanuvchi yaratilmaydi', async () => {
      const send = (body: Record<string, unknown>) =>
        http().post('/api/v1/users').set('Authorization', auth).send({ email: 'x@crm.uz', password: PASSWORD, role: 'sotuvchi', ...body })

      await send({}).expect(400)
      const missing = await send({ employeeId: '0190a7a0-0000-7000-8000-000000000000' }).expect(422)
      expect(missing.body).toMatchObject({ code: 'REFERENCE_NOT_FOUND', errors: [{ field: 'employeeId' }] })

      const deleted = await createEmployee('Ketgan')
      await http().delete(`/api/v1/employees/${deleted}`).set('Authorization', auth).expect(204)
      await send({ employeeId: deleted }).expect(422)

      const b = await seedTenant('B do‘kon')
      await send({ employeeId: b.employeeId }).expect(422)

      // Ism FAQAT xodimda — foydalanuvchiga yuborib bo'lmaydi
      await send({ employeeId: await createEmployee('Ali'), name: 'Soxta' }).expect(400)
    })

    it('ism va lavozim xodimdan olinadi; parol javobda yo‘q; email kichik harfda', async () => {
      const employeeId = await createEmployee('Bobur', 'Kassir')
      const res = await http()
        .post('/api/v1/users')
        .set('Authorization', auth)
        .send({ employeeId, email: '  Bobur@CRM.uz ', password: PASSWORD, role: 'sotuvchi' })
        .expect(201)
      expect(res.body).toMatchObject({ name: 'Bobur', position: 'Kassir', email: 'bobur@crm.uz', role: 'sotuvchi', isActive: true })
      expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i)

      // Ism bitta joyda: xodim o'zgarsa, foydalanuvchida ham darhol
      await http().patch(`/api/v1/employees/${employeeId}`).set('Authorization', auth).send({ name: 'Bobur Toshmatov' }).expect(200)
      const user = await http().get(`/api/v1/users/${res.body.id}`).set('Authorization', auth).expect(200)
      expect(user.body.name).toBe('Bobur Toshmatov')
      const employee = await http().get(`/api/v1/employees/${employeeId}`).set('Authorization', auth).expect(200)
      expect(employee.body.userId).toBe(res.body.id)

      // Yaratilgan hisob bilan kirish ishlaydi (email katta-kichik harfga qaramaydi)
      await login('BOBUR@crm.uz').expect(201)
    })

    it('bitta xodimga bitta hisob; email do‘kon ichida noyob; kuchsiz parol rad etiladi', async () => {
      const first = await createUser('Ali', 'sotuvchi')
      const again = await http()
        .post('/api/v1/users')
        .set('Authorization', auth)
        .send({ employeeId: first.employeeId, email: 'boshqa@crm.uz', password: PASSWORD, role: 'sotuvchi' })
        .expect(409)
      expect(again.body.code).toBe('EMPLOYEE_HAS_USER')

      const dupEmail = await http()
        .post('/api/v1/users')
        .set('Authorization', auth)
        .send({ employeeId: await createEmployee('Vali'), email: 'ali@crm.uz', password: PASSWORD, role: 'sotuvchi' })
        .expect(409)
      expect(dupEmail.body).toMatchObject({ code: 'ALREADY_EXISTS', errors: [{ field: 'email' }] })

      await http()
        .post('/api/v1/users')
        .set('Authorization', auth)
        .send({ employeeId: await createEmployee('Soli'), email: 'soli@crm.uz', password: '12345678', role: 'sotuvchi' })
        .expect(400)
    })

    it('xodim–hisob bog‘lanishini PATCH bilan o‘zgartirib bo‘lmaydi', async () => {
      const user = await createUser('Ali', 'sotuvchi')
      await http()
        .patch(`/api/v1/users/${user.id}`)
        .set('Authorization', auth)
        .send({ employeeId: await createEmployee('Vali') })
        .expect(400)
    })

    it('kirish hisobi bor xodim o‘chmaydi → 409 EMPLOYEE_HAS_USER; hisob o‘chgach — o‘chadi', async () => {
      const user = await createUser('Ali', 'sotuvchi')
      const res = await http().delete(`/api/v1/employees/${user.employeeId}`).set('Authorization', auth).expect(409)
      expect(res.body.code).toBe('EMPLOYEE_HAS_USER')

      await http().delete(`/api/v1/users/${user.id}`).set('Authorization', auth).expect(204)
      await http().delete(`/api/v1/employees/${user.employeeId}`).set('Authorization', auth).expect(204)
    })
  })

  describe('O‘z hisobi va oxirgi administrator', () => {
    it('foydalanuvchi o‘z rolini o‘zgartira olmaydi (boshqa maydonlarini — mumkin)', async () => {
      const res = await http().patch(`/api/v1/users/${a.userId}`).set('Authorization', auth).send({ role: 'manager' }).expect(422)
      expect(res.body.code).toBe('SELF_ROLE_CHANGE')
      // Rol o'zgarmasa (forma hamma maydonni yuboradi) — xato emas
      await http()
        .patch(`/api/v1/users/${a.userId}`)
        .set('Authorization', auth)
        .send({ role: 'admin', email: 'direktor@crm.uz' })
        .expect(200)
    })

    it('o‘z hisobini o‘chirish yoki faolsizlantirish → 422 SELF_DELETE', async () => {
      const del = await http().delete(`/api/v1/users/${a.userId}`).set('Authorization', auth).expect(422)
      expect(del.body.code).toBe('SELF_DELETE')
      const off = await http().patch(`/api/v1/users/${a.userId}`).set('Authorization', auth).send({ isActive: false }).expect(422)
      expect(off.body.code).toBe('SELF_DELETE')
    })

    it('oxirgi faol administratorni o‘chirib/pasaytirib bo‘lmaydi → 422 LAST_ADMIN', async () => {
      // B admin edi, keyin faolsizlantirildi — lekin eski tokeni hali amal qiladi
      const b = await createUser('Bek', 'admin')
      const bAuth = await bearer(app, b, 'admin')
      await testDb.user.update({ where: { id: b.id }, data: { isActive: false } })

      const demote = await http().patch(`/api/v1/users/${a.userId}`).set('Authorization', bAuth).send({ role: 'manager' }).expect(422)
      expect(demote.body.code).toBe('LAST_ADMIN')
      const del = await http().delete(`/api/v1/users/${a.userId}`).set('Authorization', bAuth).expect(422)
      expect(del.body.code).toBe('LAST_ADMIN')
      await http().patch(`/api/v1/users/${a.userId}`).set('Authorization', bAuth).send({ isActive: false }).expect(422)

      // Ikkinchi FAOL admin bo'lsa — ruxsat
      await testDb.user.update({ where: { id: b.id }, data: { isActive: true } })
      await http().patch(`/api/v1/users/${a.userId}`).set('Authorization', bAuth).send({ role: 'manager' }).expect(200)
    })

    it('ikki admin bir-birini BIR VAQTDA pasaytirsa — bittasi qoladi', async () => {
      const b = await createUser('Bek', 'admin')
      const bAuth = await bearer(app, b, 'admin')

      // Ikkala so'rov haqiqatan ustma-ust tushsin: qatorlar vaqtincha
      // qulflanadi, so'rovlar YOZISHda kutib qoladi. Himoyasiz kod bu
      // holatda ikkalasini ham o'tkazib, do'konni adminsiz qoldirardi.
      let release!: () => void
      const held = new Promise<void>((resolve) => { release = resolve })
      let markLocked!: () => void
      const locked = new Promise<void>((resolve) => { markLocked = resolve })
      const blocker = testDb.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id IN (${a.userId}::uuid, ${b.id}::uuid) FOR UPDATE`
        markLocked()
        await held
      }, { timeout: 20_000 })
      // So'rovlar qulf olingandan KEYIN: aks holda sekin mashinada (CI) ular qulfdan oldin
      // o'tib ketib, kutish hech qachon yuz bermasdi (test poygasi)
      await locked

      const requests = Promise.all([
        http().patch(`/api/v1/users/${b.id}`).set('Authorization', auth).send({ role: 'manager' }),
        http().patch(`/api/v1/users/${a.userId}`).set('Authorization', bAuth).send({ role: 'manager' }),
      ])
      await vi.waitFor(async () => {
        const [row] = await testDb.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_locks WHERE NOT granted`
        expect(Number(row!.n)).toBeGreaterThanOrEqual(2)
        // Yuklama ostida (to'liq to'plam) so'rovlar qulfga kechroq yetadi
      }, { timeout: 15_000 })
      release()
      await blocker

      const [x, y] = await requests
      expect([x.status, y.status].sort()).toEqual([200, 422])
      expect([x.body.code, y.body.code]).toContain('LAST_ADMIN')
      expect(await testDb.user.count({ where: { tenantId: a.tenantId, role: 'admin' } })).toBe(1)
    })

    it('oxirgi administratorning xodimini bo‘shatib bo‘lmaydi (menejer ham)', async () => {
      const manager = await bearer(app, a, 'manager')
      const res = await http()
        .patch(`/api/v1/employees/${a.employeeId}`)
        .set('Authorization', manager)
        .send({ status: 'fired' })
        .expect(422)
      expect(res.body.code).toBe('LAST_ADMIN')

      await createUser('Bek', 'admin')
      await http().patch(`/api/v1/employees/${a.employeeId}`).set('Authorization', manager).send({ status: 'fired' }).expect(200)
    })
  })

  describe('Sessiyalar', () => {
    it('o‘chirilgan foydalanuvchining sessiyalari shu zahoti yopiladi', async () => {
      const user = await createUser('Ali', 'sotuvchi')
      const session = await login('ali@crm.uz').expect(201)

      await http().delete(`/api/v1/users/${user.id}`).set('Authorization', auth).expect(204)
      await http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie(session)).expect(401)
      await login('ali@crm.uz').expect(401)
    })

    it('administrator parolni tiklaydi: eski sessiyalar yopiladi, yangi parol ishlaydi', async () => {
      const user = await createUser('Ali', 'sotuvchi')
      const session = await login('ali@crm.uz').expect(201)

      await http().patch(`/api/v1/users/${user.id}`).set('Authorization', auth).send({ password: '12345678' }).expect(400)
      await http().patch(`/api/v1/users/${user.id}`).set('Authorization', auth).send({ password: 'YangiParol2026!' }).expect(200)

      await http().post('/api/v1/auth/refresh').set('Cookie', refreshCookie(session)).expect(401)
      await login('ali@crm.uz').expect(401)
      await login('ali@crm.uz', 'YangiParol2026!').expect(201)
    })

    it('o‘chirilgan hisoblar ro‘yxati va tiklash; qayta yaratishda — o‘chirilgan hisob id’si', async () => {
      const user = await createUser('Ali', 'sotuvchi')
      await createUser('Vali', 'sotuvchi')
      await http().delete(`/api/v1/users/${user.id}`).set('Authorization', auth).expect(204)

      const names = (body: { items: { name: string }[] }) => body.items.map((u) => u.name)
      expect(names((await http().get('/api/v1/users').set('Authorization', auth).expect(200)).body)).not.toContain('Ali')
      const deleted = await http().get('/api/v1/users?deleted=true').set('Authorization', auth).expect(200)
      expect(names(deleted.body)).toEqual(['Ali'])
      expect(deleted.body.items[0]).toMatchObject({ id: user.id, email: 'ali@crm.uz', role: 'sotuvchi' })
      expect(deleted.body.items[0].deletedAt).not.toBeNull()

      // Yangi hisob o'rniga — eskisini tiklash (id `meta` da)
      const again = await http()
        .post('/api/v1/users')
        .set('Authorization', auth)
        .send({ employeeId: user.employeeId, email: 'ali2@crm.uz', password: PASSWORD, role: 'sotuvchi' })
        .expect(409)
      expect(again.body.errors[0]).toMatchObject({ code: 'EMPLOYEE_HAS_USER', meta: { userId: user.id, deleted: true } })

      const restored = await http().post(`/api/v1/users/${user.id}/restore`).set('Authorization', auth).expect(200)
      expect(restored.body).toMatchObject({ id: user.id, name: 'Ali', deletedAt: null })
      await login('ali@crm.uz').expect(201)
      expect((await http().get('/api/v1/users?deleted=true').set('Authorization', auth).expect(200)).body.items).toHaveLength(0)
    })

    it('xodimi o‘chirilgan hisob tiklanmaydi — avval xodim tiklanadi (422)', async () => {
      const user = await createUser('Ali', 'sotuvchi')
      await http().delete(`/api/v1/users/${user.id}`).set('Authorization', auth).expect(204)
      await http().delete(`/api/v1/employees/${user.employeeId}`).set('Authorization', auth).expect(204)

      const res = await http().post(`/api/v1/users/${user.id}/restore`).set('Authorization', auth).expect(422)
      expect(res.body).toMatchObject({ code: 'REFERENCE_NOT_FOUND', errors: [{ field: 'employeeId' }] })
      await http().post(`/api/v1/employees/${user.employeeId}/restore`).set('Authorization', auth).expect(200)
      await http().post(`/api/v1/users/${user.id}/restore`).set('Authorization', auth).expect(200)
    })
  })

  describe('Xodimlar va huquqlar', () => {
    it('sana va maosh: YYYY-MM-DD, butun so‘m', async () => {
      const res = await http()
        .post('/api/v1/employees')
        .set('Authorization', auth)
        .send({ name: 'Ali', position: 'Omborchi', phone: '+998901112233', hiredAt: '2026-03-01', salary: 3_000_000 })
        .expect(201)
      expect(res.body).toMatchObject({ hiredAt: '2026-03-01', salary: 3_000_000, status: 'active', userId: null })

      for (const hiredAt of ['2026-02-30', '01.03.2026', '2026-3-1']) {
        await http()
          .post('/api/v1/employees')
          .set('Authorization', auth)
          .send({ name: 'Ali', position: 'Omborchi', phone: '+998901112233', hiredAt })
          .expect(400)
      }
    })

    it('menejer xodimni qo‘shadi/tahrirlaydi, lekin o‘chira olmaydi; foydalanuvchilarni ko‘rmaydi', async () => {
      const manager = await bearer(app, a, 'manager')
      const id = await createEmployee('Vali', 'Haydovchi', manager)
      await http().patch(`/api/v1/employees/${id}`).set('Authorization', manager).send({ position: 'Omborchi' }).expect(200)
      await http().delete(`/api/v1/employees/${id}`).set('Authorization', manager).expect(403)
      await http().get('/api/v1/users').set('Authorization', manager).expect(403)
    })

    it('sotuvchi xodimlar va maoshlarni umuman ko‘rmaydi', async () => {
      await http().get('/api/v1/employees').set('Authorization', await bearer(app, a, 'sotuvchi')).expect(403)
    })

    it('ro‘yxatlar: qidiruv va filtrlar', async () => {
      await createUser('Ali', 'sotuvchi')
      await createUser('Bek', 'omborchi')

      const users = await http().get('/api/v1/users?role=omborchi').set('Authorization', auth).expect(200)
      expect(users.body.items.map((u: { name: string }) => u.name)).toEqual(['Bek'])
      const byName = await http().get('/api/v1/users?q=ali').set('Authorization', auth).expect(200)
      expect(byName.body.items.map((u: { email: string }) => u.email)).toEqual(['ali@crm.uz'])
      const employees = await http().get('/api/v1/employees?q=bek').set('Authorization', auth).expect(200)
      expect(employees.body.items.map((e: { name: string }) => e.name)).toEqual(['Bek'])
    })
  })
})
