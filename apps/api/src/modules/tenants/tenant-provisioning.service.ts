import { Injectable } from '@nestjs/common'
import { PRODUCT_CATEGORIES, TRIAL_DAYS, TRIAL_PLAN } from '@crm/shared'
import { PrismaService } from '@/prisma/prisma.service'
import { DOC_PREFIXES } from '@/modules/doc-numbers/doc-number.service'
import { systemRoleRows } from '@/modules/roles/system-roles'

export const DEFAULT_WAREHOUSE_NAME = 'Asosiy ombor'

const DAY_MS = 86_400_000

export interface ProvisionInput {
  tenantName: string
  /**
   * Sinov muddati (T-148): `TRIAL_PLAN` tarifi `TRIAL_DAYS` kun — ro'yxatdan o'tish va tarifsiz
   * ochilgan do'kon. Berilmasa — `free` (egasi o'zi tarif beradi)
   */
  trial?: boolean
  owner: {
    name: string
    position?: string
    phone: string
    email: string
    /** ALLAQACHON xeshlangan parol — bu servis xeshlash bilan shug'ullanmaydi */
    passwordHash: string
  }
}

export interface ProvisionResult {
  tenantId: string
  employeeId: string
  userId: string
  warehouseId: string
}

@Injectable()
export class TenantProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Yangi do'kon yaratadi.
   *
   * Hammasi BITTA tranzaksiyada: yarim yaratilgan tenant ishlamaydi —
   * sozlamasi yoki ombori yo'q do'konda birinchi sotuvdayoq xato chiqadi.
   */
  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    return this.prisma.$transaction(async (tx) => {
      const trialEndsAt = input.trial ? new Date(Date.now() + TRIAL_DAYS * DAY_MS) : null
      const tenant = await tx.tenant.create({
        data: { name: input.tenantName, ...(trialEndsAt && { plan: TRIAL_PLAN, planExpiresAt: trialEndsAt, trialEndsAt }) },
      })
      // Qolgan yozuvlar YANGI tenantniki — RLS (WITH CHECK) ularni faqat shu
      // tenant o'rnatilgan tranzaksiyada qabul qiladi (`tenants` — global jadval)
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`

      await tx.settings.create({
        data: { tenantId: tenant.id, storeName: input.tenantName },
      })

      const warehouse = await tx.warehouse.create({
        data: { tenantId: tenant.id, name: DEFAULT_WAREHOUSE_NAME, isDefault: true },
      })

      await tx.tenantState.create({
        data: { tenantId: tenant.id, activeWarehouseId: warehouse.id },
      })

      // Sukut kategoriyalar — mijoz ilovasidagi ro'yxat bilan bir xil manba
      await tx.category.createMany({
        data: PRODUCT_CATEGORIES.map((name, i) => ({
          tenantId: tenant.id,
          name,
          sortOrder: i,
        })),
      })

      await tx.docCounter.createMany({
        data: DOC_PREFIXES.map((prefix) => ({ tenantId: tenant.id, prefix })),
      })

      // Tizim rollari (T-134) — egasi administrator
      const roles = await tx.role.createManyAndReturn({ data: systemRoleRows(tenant.id), select: { id: true, key: true } })
      const adminRole = roles.find((r) => r.key === 'admin')!

      // Egasi: avval SHAXS, keyin unga bog'langan kirish hisobi (D1)
      const employee = await tx.employee.create({
        data: {
          tenantId: tenant.id,
          name: input.owner.name,
          position: input.owner.position ?? 'Direktor',
          phone: input.owner.phone,
          hiredAt: new Date(),
        },
      })

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          employeeId: employee.id,
          email: input.owner.email.trim().toLowerCase(),
          passwordHash: input.owner.passwordHash,
          roleId: adminRole.id,
        },
      })

      return {
        tenantId: tenant.id,
        employeeId: employee.id,
        userId: user.id,
        warehouseId: warehouse.id,
      }
    }, { isolationLevel: 'ReadCommitted' })
  }
}
