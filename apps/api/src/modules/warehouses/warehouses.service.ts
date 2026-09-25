import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { currentTenantId } from '@/common/context/request-context'
import { crudDelegate, CrudService, type CrudDelegate } from '@/common/crud/crud.service'
import { searchWhere } from '@/common/crud/search'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { PlanService } from '@/modules/tenants/plan.service'
import { PrismaService } from '@/prisma/prisma.service'
import {
  WAREHOUSE_SORT,
  type ArchivedWarehouseDto,
  type CreateWarehouseDto,
  type UpdateWarehouseDto,
  type WarehouseDto,
  type WarehouseListQueryDto,
  type WarehouseStockDto,
} from './dto/warehouse.dto'

const WAREHOUSE_SELECT = {
  id: true,
  name: true,
  address: true,
  isDefault: true,
  archived: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WarehouseSelect

type WarehouseRow = Prisma.WarehouseGetPayload<{ select: typeof WAREHOUSE_SELECT }>

/**
 * Omborlar.
 *
 * O'chirish o'rniga ARXIVLASH: omborga qoldiqlar, harakatlar va cheklar
 * havola qiladi — u jismonan yo'qolmaydi, faqat yangi amallarda
 * tanlanmaydi. Sukut ombor arxivlanmaydi: sotuv joysiz qolmasin.
 */
@Injectable()
export class WarehousesService extends CrudService<
  WarehouseRow,
  WarehouseDto,
  CreateWarehouseDto,
  UpdateWarehouseDto,
  WarehouseListQueryDto
> {
  protected readonly resource = 'Ombor'
  protected readonly select = WAREHOUSE_SELECT
  protected readonly sortMap = WAREHOUSE_SORT
  protected readonly defaultSort = 'createdAt'
  protected override readonly uniqueRules = [{ field: 'name' }]

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlanService,
  ) {
    super()
  }

  protected delegate(): CrudDelegate<WarehouseRow> {
    return crudDelegate(this.prisma.scoped.warehouse)
  }

  protected toDto(row: WarehouseRow): WarehouseDto {
    return row
  }

  protected filters(query: WarehouseListQueryDto): Prisma.WarehouseWhereInput {
    return {
      ...searchWhere(query.q, ['name', 'address']),
      ...(query.archived !== undefined && { archived: query.archived }),
    }
  }

  protected async createData(dto: CreateWarehouseDto): Promise<Omit<Prisma.WarehouseUncheckedCreateInput, 'tenantId'>> {
    await this.plans.assertRoom('warehouses')
    return { name: dto.name, address: dto.address ?? null }
  }

  protected updateData(dto: UpdateWarehouseDto): Prisma.WarehouseUncheckedUpdateInput {
    return { name: dto.name, address: dto.address }
  }

  /**
   * Arxivlash. Omborda tovar qolgan bo'lsa amal BAJARILADI, lekin javobda
   * ogohlantirish qaytadi — qoldiqni boshqa omborga ko'chirish kerakligini
   * foydalanuvchi bilsin.
   */
  async archive(id: string): Promise<ArchivedWarehouseDto> {
    const tenantId = currentTenantId()
    return this.prisma.inTenantTransaction(tenantId, async (tx) => {
      const current = await tx.warehouse.findFirst({
        where: { id },
        select: { isDefault: true },
      })
      if (!current) throw new NotFoundError(this.resource, id)
      if (current.isDefault) {
        throw new DomainError('WAREHOUSE_DEFAULT_LOCKED', 'Sukut omborni arxivlab bo‘lmaydi')
      }

      const row = await tx.warehouse.update({
        where: { id },
        data: { archived: true },
        select: WAREHOUSE_SELECT,
      })

      // Joriy ombor arxivlansa kassa sukut omborga qaytadi — frontenddagi
      // `archiveWarehouse` bilan bir xil qoida
      const fallback = await tx.warehouse.findFirst({
        where: { isDefault: true },
        select: { id: true },
      })
      await tx.tenantState.updateMany({
        where: { activeWarehouseId: id },
        data: { activeWarehouseId: fallback?.id ?? null },
      })

      const productCount = await tx.productStock.count({
        where: { warehouseId: id, qty: { gt: 0 } },
      })
      return { ...row, stockWarning: productCount > 0 ? { productCount } : null }
    })
  }

  async restore(id: string): Promise<WarehouseDto> {
    const current = await this.prisma.scoped.warehouse.findFirst({ where: { id }, select: { archived: true } })
    // Tarif chegarasi arxivlanmaganlar bo'yicha (T-125) — arxivdan qaytarish joy egallaydi
    if (current?.archived) await this.plans.assertRoom('warehouses')
    return this.delegate()
      .update({ where: { id }, data: { archived: false }, select: WAREHOUSE_SELECT })
      .catch(this.rethrow(id))
  }

  /**
   * Omborlar bo'yicha tovar: turlar soni va tannarxdagi qiymat — BITTA
   * agregat (`product_stocks` × `products.cost`); qiymat sotuvchiga chiqmaydi.
   */
  async stock(): Promise<WarehouseStockDto[]> {
    const tenantId = currentTenantId()
    const rows = await this.prisma.scoped.$queryRaw<{ warehouseId: string; productCount: number; value: Prisma.Decimal }[]>`
      SELECT ps.warehouse_id AS "warehouseId", COUNT(*) FILTER (WHERE ps.qty > 0)::int AS "productCount",
             COALESCE(SUM(ps.qty * p.cost), 0) AS value
        FROM product_stocks ps
        JOIN products p ON p.tenant_id = ps.tenant_id AND p.id = ps.product_id AND p.deleted_at IS NULL
       WHERE ps.tenant_id = ${tenantId}::uuid
       GROUP BY ps.warehouse_id`
    return rows.map((r) => ({ warehouseId: r.warehouseId, productCount: r.productCount, stockValue: Math.round(r.value.toNumber()) }))
  }
}
