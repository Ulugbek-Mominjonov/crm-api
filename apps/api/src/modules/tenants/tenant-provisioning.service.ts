import { Injectable } from '@nestjs/common'
import { PRODUCT_CATEGORIES } from '@crm/shared'
import { PrismaService } from '@/prisma/prisma.service'
import type { Role } from '@prisma/client'

/** Hujjat raqamlari prefikslari — har tenantda alohida hisoblagich (I12) */
export const DOC_PREFIXES = ['CHEK', 'QAYT', 'TKLF', 'BUY'] as const

export const DEFAULT_WAREHOUSE_NAME = 'Asosiy ombor'

export interface ProvisionInput {
  tenantName: string
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
      const tenant = await tx.tenant.create({ data: { name: input.tenantName } })

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
          role: 'admin' satisfies Role,
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
