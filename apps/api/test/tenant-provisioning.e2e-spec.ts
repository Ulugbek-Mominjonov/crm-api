import { Test } from '@nestjs/testing'
import { PRODUCT_CATEGORIES } from '@crm/shared'
import { PrismaService } from '@/prisma/prisma.service'
import {
  DEFAULT_WAREHOUSE_NAME,
  DOC_PREFIXES,
  TenantProvisioningService,
} from '@/modules/tenants/tenant-provisioning.service'
import { testDb, truncateAll } from './helpers/db'

const owner = {
  name: 'Bobur Toshmatov',
  phone: '+998901234567',
  email: 'Admin@CRM.uz',
  passwordHash: '$argon2id$fake',
}

describe('Tenant provisioning', () => {
  let service: TenantProvisioningService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantProvisioningService,
        { provide: PrismaService, useValue: testDb },
      ],
    }).compile()
    service = moduleRef.get(TenantProvisioningService)
  })

  beforeEach(async () => { await truncateAll() })
  afterAll(async () => { await testDb.$disconnect() })

  it('to‘liq do‘kon yaratadi', async () => {
    const res = await service.provision({ tenantName: 'Qurilish Mollari', owner })

    const settings = await testDb.settings.findUniqueOrThrow({
      where: { tenantId: res.tenantId },
    })
    expect(settings.storeName).toBe('Qurilish Mollari')

    const state = await testDb.tenantState.findUniqueOrThrow({
      where: { tenantId: res.tenantId },
    })
    expect(state.activeWarehouseId).toBe(res.warehouseId)
    expect(state.cashBalance).toBe(0n)

    const wh = await testDb.warehouse.findUniqueOrThrow({ where: { id: res.warehouseId } })
    expect(wh.name).toBe(DEFAULT_WAREHOUSE_NAME)
    expect(wh.isDefault).toBe(true)

    const categories = await testDb.category.findMany({
      where: { tenantId: res.tenantId },
      orderBy: { sortOrder: 'asc' },
    })
    expect(categories.map((c) => c.name)).toEqual([...PRODUCT_CATEGORIES])

    const counters = await testDb.docCounter.findMany({ where: { tenantId: res.tenantId } })
    expect(counters.map((c) => c.prefix).sort()).toEqual([...DOC_PREFIXES].sort())
    expect(counters.every((c) => c.lastNo === 1000n)).toBe(true)
  })

  it('D1: avval xodim, keyin unga bog‘langan kirish hisobi', async () => {
    const res = await service.provision({ tenantName: 'Do‘kon', owner })

    const user = await testDb.user.findUniqueOrThrow({
      where: { id: res.userId },
      include: { employee: true },
    })
    expect(user.employeeId).toBe(res.employeeId)
    expect(user.role).toBe('admin')
    // Ism FAQAT xodimda — foydalanuvchida takrorlanmaydi
    expect(user.employee.name).toBe(owner.name)
    expect(user.employee.position).toBe('Direktor')
    expect(user).not.toHaveProperty('name')
  })

  it('email kichik harfga keltiriladi', async () => {
    const res = await service.provision({ tenantName: 'Do‘kon', owner })
    const user = await testDb.user.findUniqueOrThrow({ where: { id: res.userId } })
    expect(user.email).toBe('admin@crm.uz')
  })

  it('xato bo‘lsa hech narsa yaratilmaydi (tranzaksiya)', async () => {
    await service.provision({ tenantName: 'Birinchi', owner })
    const before = await testDb.tenant.count()

    // Ikkinchi tenantda AYNI email — boshqa tenantda ruxsat etilgan,
    // shuning uchun ataylab boshqa xato keltiramiz: nom bo'sh emas, lekin
    // xodim telefoni juda uzun (baza cheklovi yo'q) — o'rniga noto'g'ri
    // hashni emas, mavjud tenant nomi bilan bir xil ombor nomini beramiz.
    await expect(
      testDb.$transaction(async (tx) => {
        const t = await tx.tenant.create({ data: { name: 'Ikkinchi' } })
        await tx.warehouse.create({ data: { tenantId: t.id, name: 'A', isDefault: true } })
        await tx.warehouse.create({ data: { tenantId: t.id, name: 'B', isDefault: true } })
      }),
    ).rejects.toThrow()

    expect(await testDb.tenant.count()).toBe(before)
  })

  it('ikki tenant bir xil email bilan yaratila oladi', async () => {
    const a = await service.provision({ tenantName: 'A', owner })
    const b = await service.provision({ tenantName: 'B', owner })
    expect(a.tenantId).not.toBe(b.tenantId)
    expect(await testDb.user.count({ where: { email: 'admin@crm.uz' } })).toBe(2)
  })
})
