import type { INestApplication } from '@nestjs/common'
import { PERMISSIONS } from '@crm/shared'
import request from 'supertest'
import { TokenService } from '@/modules/auth/token.service'
import { createTestApp, resetThrottle } from './helpers/app'
import { bearer } from './helpers/auth'
import { roleIdOf, seedProduct, seedTenant, testDb, truncateAll } from './helpers/db'
import { connect, listen, record, until } from './helpers/realtime'

type Tenant = Awaited<ReturnType<typeof seedTenant>>

const PASSWORD = 'Qurilish2026!'

/**
 * Do'kon rollari (T-134): ruxsatlar rolda, foydalanuvchi — bitta rolda.
 * Huquq tokenda emas — har so'rovda bazadan (kesh bilan): rol tahriri,
 * rol almashtirish va faolsizlantirish keyingi so'rovdanoq kuchga kiradi.
 */
describe('Rollar va ruxsatlar (/roles)', () => {
  let app: INestApplication
  let url: string
  let a: Tenant
  let b: Tenant
  let auth: string

  beforeAll(async () => {
    app = await createTestApp()
    url = await listen(app)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  beforeEach(async () => {
    resetThrottle(app)
    await truncateAll()
    a = await seedTenant('A do‘kon')
    b = await seedTenant('B do‘kon')
    auth = await bearer(app, a)
  })

  const http = () => request(app.getHttpServer())

  const createRole = (name: string, permissions: string[], who = auth) =>
    http().post('/api/v1/roles').set('Authorization', who).send({ name, permissions })

  /** Xodim + shu roldagi hisob; token — to'g'ridan-to'g'ri (argon2siz) */
  const createUser = async (name: string, roleId: string) => {
    const employee = await http()
      .post('/api/v1/employees')
      .set('Authorization', auth)
      .send({ name, position: 'Kassir', phone: '+998 90 111 22 33', hiredAt: '2026-01-15', salary: 0 })
      .expect(201)
    const user = await http()
      .post('/api/v1/users')
      .set('Authorization', auth)
      .send({ employeeId: employee.body.id, email: `${name.toLowerCase()}@crm.uz`, password: PASSWORD, roleId })
      .expect(201)
    const { token } = await app.get(TokenService).signAccess({ sub: user.body.id, tid: a.tenantId, eid: employee.body.id })
    return { id: user.body.id as string, body: user.body as Record<string, unknown>, auth: `Bearer ${token}` }
  }

  it('do‘konda 4 ta tizim roli: tartib, foydalanuvchilar soni, administrator — hamma ruxsat', async () => {
    const res = await http().get('/api/v1/roles').set('Authorization', auth).expect(200)
    expect(res.body.map((r: { key: string }) => r.key)).toEqual(['admin', 'manager', 'sotuvchi', 'omborchi'])
    const [admin, , seller] = res.body
    expect(admin).toMatchObject({ name: 'Administrator', usersCount: 1, permissions: PERMISSIONS })
    expect(seller.permissions).toContain('sales.create')
    expect(seller.permissions).not.toContain('sales.cancel')

    const catalog = await http().get('/api/v1/roles/catalog').set('Authorization', auth).expect(200)
    expect(catalog.body.groups.map((g: { key: string }) => g.key)).toEqual(['sales', 'stock', 'finance', 'customers', 'admin', 'data'])
    expect(catalog.body.resources[0]).toMatchObject({ key: 'sales', group: 'sales', actions: expect.arrayContaining([
      { key: 'return', permission: 'sales.return', label: 'Qaytarish' },
    ]) })
  })

  it('rollarni boshqarish — `roles.*` ruxsati bilan: ruxsatsiz rol — 403', async () => {
    const manager = await bearer(app, a, 'manager')
    expect((await createRole('Kassir', ['sales.create'], manager).expect(403)).body.code).toBe('PERMISSION_DENIED')
    await http().get('/api/v1/roles').set('Authorization', manager).expect(403)
    const seller = await roleIdOf(a.tenantId, 'sotuvchi')
    await http().patch(`/api/v1/roles/${seller}`).set('Authorization', manager).send({ permissions: [] }).expect(403)
  })

  it('`roles.*` berilgan menejer — faqat o‘zida bor ruxsatlar doirasida: berish, olish, o‘chirish, ko‘chirish', async () => {
    const managerRole = await roleIdOf(a.tenantId, 'manager')
    const current = (await http().get(`/api/v1/roles/${managerRole}`).set('Authorization', auth).expect(200)).body
    await http().patch(`/api/v1/roles/${managerRole}`).set('Authorization', auth)
      .send({ permissions: [...current.permissions, 'roles.create', 'roles.edit', 'roles.delete'] }).expect(200)
    const manager = await bearer(app, a, 'manager')
    const patch = (id: string, body: Record<string, unknown>) =>
      http().patch(`/api/v1/roles/${id}`).set('Authorization', manager).send(body)

    // Yaratish: o'zida bor ruxsatlar — mumkin, yo'g'i (`users`) — 403
    const kassir = (await createRole('Kassir', ['sales.create'], manager).expect(201)).body
    await createRole('Kadrlar', ['users.view'], manager).expect(403)
    // Ruxsat berish va olib tashlash — o'zida borlari bilan
    await patch(kassir.id, { permissions: ['sales.create', 'sales.cancel'] }).expect(200)
    await patch(kassir.id, { permissions: ['sales.create'] }).expect(200)
    expect((await patch(kassir.id, { permissions: ['sales.create', 'audit.view'] }).expect(403)).body.code).toBe('PERMISSION_DENIED')
    // O'z roliga o'zida yo'q ruxsat — 403; tizim roli (o'zidan tor) — mumkin; administrator — 422
    await patch(managerRole, { permissions: [...current.permissions, 'roles.edit', 'users.view'] }).expect(403)
    await patch(await roleIdOf(a.tenantId, 'sotuvchi'), { permissions: ['sales.create'] }).expect(200)
    await patch(await roleIdOf(a.tenantId, 'admin'), { permissions: [] }).expect(422)

    // Kengroq rolga tegolmaydi
    const wide = (await createRole('Kadrlar', ['users.view']).expect(201)).body
    await patch(wide.id, { name: 'Kadr' }).expect(403)
    await http().delete(`/api/v1/roles/${wide.id}`).set('Authorization', manager).expect(403)

    // O'chirishda hisoblarni kengroq rolga ko'chira olmaydi
    await createUser('Ali', kassir.id)
    await http().delete(`/api/v1/roles/${kassir.id}?replaceWith=${await roleIdOf(a.tenantId, 'admin')}`).set('Authorization', manager).expect(403)
    await http().delete(`/api/v1/roles/${kassir.id}?replaceWith=${await roleIdOf(a.tenantId, 'sotuvchi')}`).set('Authorization', manager).expect(204)
  })

  it('do‘kon roli: ruxsatlar normallashadi, nom noyob (harf farqsiz)', async () => {
    const res = await createRole('  Kassir ', ['sales.create', 'profit.view', 'sales.create']).expect(201)
    expect(res.body).toMatchObject({
      name: 'Kassir',
      key: null,
      usersCount: 0,
      // `view`, kassa → katalog, foyda → tannarx
      permissions: ['sales.view', 'sales.create', 'products.view', 'cost.view', 'profit.view'],
    })
    const dup = await createRole('KASSIR', []).expect(409)
    expect(dup.body).toMatchObject({ code: 'ALREADY_EXISTS', errors: [{ field: 'name', code: 'ALREADY_EXISTS' }] })

    const bad = await createRole('Boshqa', ['sales.fly']).expect(400)
    expect(bad.body.errors[0].field).toBe('permissions')
  })

  it('rol ruxsati — endpoint, `/auth/me` va maxfiy maydonlar; tahrir keyingi so‘rovdanoq kuchga kiradi', async () => {
    const productId = await seedProduct(a.tenantId, a.warehouseId)
    const role = (await createRole('Kassir', ['debts.collect']).expect(201)).body
    const user = await createUser('Ali', role.id)
    expect(user.body).toMatchObject({ roleId: role.id, roleName: 'Kassir', role: null })

    const me = await http().get('/api/v1/auth/me').set('Authorization', user.auth).expect(200)
    expect(me.body).toMatchObject({ role: null, roleId: role.id, roleName: 'Kassir', permissions: ['debts.view', 'debts.collect'] })
    await http().get('/api/v1/debts').set('Authorization', user.auth).expect(200)
    const denied = await http().get(`/api/v1/products/${productId}`).set('Authorization', user.auth).expect(403)
    expect(denied.body.detail).toContain('products.view')

    // Tahrir (token o'sha): mahsulot ochiladi, tannarx — `cost.view` bilan
    await http().patch(`/api/v1/roles/${role.id}`).set('Authorization', auth).send({ permissions: ['debts.view', 'products.view'] }).expect(200)
    const product = await http().get(`/api/v1/products/${productId}`).set('Authorization', user.auth).expect(200)
    expect(product.body).not.toHaveProperty('cost')
    await http().patch(`/api/v1/roles/${role.id}`).set('Authorization', auth).send({ permissions: ['products.view', 'cost.view'] }).expect(200)
    expect((await http().get(`/api/v1/products/${productId}`).set('Authorization', user.auth).expect(200)).body.cost).toBe(45_000)
    await http().get('/api/v1/debts').set('Authorization', user.auth).expect(403)
  })

  it('tahrir: `If-Match` eskirgan — 409; ruxsat o‘zgarsa — do‘konga `access.changed`', async () => {
    const role = (await createRole('Kassir', ['sales.create']).expect(201)).body
    const socket = await connect(url, { token: (await bearer(app, a, 'sotuvchi')).slice('Bearer '.length) })
    try {
      const got = record(socket)
      const ok = await http().patch(`/api/v1/roles/${role.id}`).set('Authorization', auth).set('If-Match', role.updatedAt)
        .send({ name: 'Katta kassir', permissions: ['sales.create', 'sales.return'] }).expect(200)
      expect(ok.body).toMatchObject({ name: 'Katta kassir', permissions: ['sales.view', 'sales.create', 'sales.return', 'products.view'] })
      await until(() => got.length > 0)
      expect(got).toEqual([{ type: 'access.changed', payload: {} }])

      const stale = await http().patch(`/api/v1/roles/${role.id}`).set('Authorization', auth).set('If-Match', role.updatedAt)
        .send({ name: 'Boshqa' }).expect(409)
      expect(stale.body).toMatchObject({ code: 'VERSION_CONFLICT', current: { name: 'Katta kassir' } })
    } finally {
      socket.close()
    }
    const audit = await testDb.auditEntry.findFirst({ where: { tenantId: a.tenantId, action: 'role.update' } })
    expect(audit?.diff).toEqual({
      name: { from: 'Kassir', to: 'Katta kassir' },
      permissions: { added: ['sales.return'], removed: [] },
    })
  })

  it('tizim rollari: administrator o‘zgarmaydi, boshqalarida nom doimiy, hech biri o‘chmaydi; ruxsat tahriri — ta’sir qiladi', async () => {
    const [admin, seller] = await Promise.all([roleIdOf(a.tenantId, 'admin'), roleIdOf(a.tenantId, 'sotuvchi')])
    expect((await http().patch(`/api/v1/roles/${admin}`).set('Authorization', auth).send({ permissions: [] }).expect(422)).body.code)
      .toBe('ROLE_PROTECTED')
    expect((await http().patch(`/api/v1/roles/${seller}`).set('Authorization', auth).send({ name: 'Kassir' }).expect(422)).body.errors)
      .toEqual([{ field: 'name', code: 'ROLE_PROTECTED' }])
    expect((await http().delete(`/api/v1/roles/${seller}`).set('Authorization', auth).expect(422)).body.code).toBe('ROLE_PROTECTED')

    const sellerAuth = await bearer(app, a, 'sotuvchi')
    await http().get('/api/v1/clients').set('Authorization', sellerAuth).expect(200)
    await http().patch(`/api/v1/roles/${seller}`).set('Authorization', auth).send({ permissions: ['sales.create'] }).expect(200)
    await http().get('/api/v1/clients').set('Authorization', sellerAuth).expect(403)
  })

  it('rolni o‘chirish: foydalanuvchisi bo‘lsa — 409, `replaceWith` bilan — o‘tkaziladi (o‘chirilgan hisob ham)', async () => {
    const kassir = (await createRole('Kassir', ['sales.create']).expect(201)).body
    const user = await createUser('Ali', kassir.id)
    const gone = await createUser('Vali', kassir.id)
    await http().delete(`/api/v1/users/${gone.id}`).set('Authorization', auth).expect(204)

    const busy = await http().delete(`/api/v1/roles/${kassir.id}`).set('Authorization', auth).expect(409)
    expect(busy.body).toMatchObject({ code: 'ROLE_IN_USE', errors: [{ field: 'replaceWith', meta: { users: 2 } }] })
    const list = await http().get('/api/v1/roles').set('Authorization', auth).expect(200)
    expect(list.body.find((r: { id: string }) => r.id === kassir.id).usersCount).toBe(1)

    await http().delete(`/api/v1/roles/${kassir.id}?replaceWith=${b.userId}`).set('Authorization', auth).expect(422)
    const seller = await roleIdOf(a.tenantId, 'sotuvchi')
    await http().delete(`/api/v1/roles/${kassir.id}?replaceWith=${seller}`).set('Authorization', auth).expect(204)

    expect(await testDb.user.count({ where: { roleId: seller, id: { in: [user.id, gone.id] } } })).toBe(2)
    const me = await http().get('/api/v1/auth/me').set('Authorization', user.auth).expect(200)
    expect(me.body).toMatchObject({ role: 'sotuvchi', roleId: seller })
    await http().get('/api/v1/clients').set('Authorization', user.auth).expect(200)
  })

  it('foydalanuvchi rolini almashtirish va faolsizlantirish — o‘sha token bilan keyingi so‘rovdanoq', async () => {
    const user = await createUser('Ali', await roleIdOf(a.tenantId, 'omborchi'))
    await http().get('/api/v1/clients').set('Authorization', user.auth).expect(200)
    await http().post('/api/v1/clients').set('Authorization', user.auth).send({ name: 'X', phone: '+998901112233' }).expect(403)

    await http().patch(`/api/v1/users/${user.id}`).set('Authorization', auth).send({ roleId: await roleIdOf(a.tenantId, 'sotuvchi') }).expect(200)
    await http().post('/api/v1/clients').set('Authorization', user.auth).send({ name: 'X', phone: '+998901112233' }).expect(201)

    await http().patch(`/api/v1/users/${user.id}`).set('Authorization', auth).send({ isActive: false }).expect(200)
    expect((await http().get('/api/v1/clients').set('Authorization', user.auth).expect(401)).body.code).toBe('AUTH_INVALID_CREDENTIALS')
  })

  it('huquq oshirishdan himoya: `users` ruxsati bor menejer o‘zidan kengroq rolga tegolmaydi', async () => {
    const manager = await roleIdOf(a.tenantId, 'manager')
    const current = (await http().get(`/api/v1/roles/${manager}`).set('Authorization', auth).expect(200)).body
    await http().patch(`/api/v1/roles/${manager}`).set('Authorization', auth)
      .send({ permissions: [...current.permissions, 'users.create', 'users.edit'] }).expect(200)
    const managerAuth = await bearer(app, a, 'manager')
    const employee = (await http().post('/api/v1/employees').set('Authorization', managerAuth)
      .send({ name: 'Soli', position: 'Kassir', phone: '+998 90 111 22 33', hiredAt: '2026-01-15', salary: 0 }).expect(201)).body

    const send = (roleId: string) => http().post('/api/v1/users').set('Authorization', managerAuth)
      .send({ employeeId: employee.id, email: 'soli@crm.uz', password: PASSWORD, roleId })
    expect((await send(await roleIdOf(a.tenantId, 'admin')).expect(403)).body.code).toBe('PERMISSION_DENIED')
    const wide = (await createRole('Hammasi', ['salary.view', 'audit.view']).expect(201)).body
    await send(wide.id).expect(403)
    await send(await roleIdOf(a.tenantId, 'sotuvchi')).expect(201)

    // Administrator hisobiga (parol) tegolmaydi
    await http().patch(`/api/v1/users/${a.userId}`).set('Authorization', managerAuth).send({ password: 'Yangi-Parol-2026' }).expect(403)
  })

  it('izolyatsiya: boshqa do‘kon roli ko‘rinmaydi va berilmaydi', async () => {
    const foreign = await roleIdOf(b.tenantId, 'manager')
    await http().get(`/api/v1/roles/${foreign}`).set('Authorization', auth).expect(404)
    await http().patch(`/api/v1/roles/${foreign}`).set('Authorization', auth).send({ permissions: [] }).expect(404)
    const sellerAuth = await bearer(app, a, 'sotuvchi')
    const seller = await testDb.user.findFirstOrThrow({ where: { tenantId: a.tenantId, role: { key: 'sotuvchi' } } })
    const res = await http().patch(`/api/v1/users/${seller.id}`).set('Authorization', auth).send({ roleId: foreign }).expect(422)
    expect(res.body).toMatchObject({ code: 'REFERENCE_NOT_FOUND', errors: [{ field: 'roleId' }] })
    await http().get('/api/v1/clients').set('Authorization', sellerAuth).expect(200)
  })

  it('eski mijoz: `role` kaliti bilan hisob yaratiladi, javobda `roleId` ham', async () => {
    const employee = (await http().post('/api/v1/employees').set('Authorization', auth)
      .send({ name: 'Soli', position: 'Kassir', phone: '+998 90 111 22 33', hiredAt: '2026-01-15', salary: 0 }).expect(201)).body
    const res = await http().post('/api/v1/users').set('Authorization', auth)
      .send({ employeeId: employee.id, email: 'soli@crm.uz', password: PASSWORD, role: 'omborchi' }).expect(201)
    expect(res.body).toMatchObject({ role: 'omborchi', roleId: await roleIdOf(a.tenantId, 'omborchi'), roleName: 'Omborchi' })

    const none = await http().post('/api/v1/users').set('Authorization', auth)
      .send({ employeeId: employee.id, email: 'x@crm.uz', password: PASSWORD }).expect(400)
    expect(none.body.errors[0].field).toBe('roleId')
  })
})
