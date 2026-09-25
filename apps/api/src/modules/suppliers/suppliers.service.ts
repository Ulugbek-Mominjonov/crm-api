import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { crudDelegate, SoftDeleteCrudService, type CrudDelegate } from '@/common/crud/crud.service'
import type { Paged } from '@/common/crud/paging'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import {
  SUPPLIER_SORT,
  type CreateSupplierDto,
  type SupplierCardDto,
  type SupplierDto,
  type SupplierListQueryDto,
  type SupplierListItemDto,
  type SupplierSummaryDto,
  type UpdateSupplierDto,
} from './dto/supplier.dto'

const SUPPLIER_SELECT = {
  id: true,
  name: true,
  phone: true,
  contactPerson: true,
  address: true,
  notes: true,
  email: true,
  tin: true,
  paymentTermDays: true,
  createdAt: true,
  updatedAt: true,
  // Ro'yxatdagi "mahsulotlar soni" — sahifa qatorlari uchun shu so'rovning o'zida
  _count: { select: { products: { where: { deletedAt: null } } } },
} satisfies Prisma.SupplierSelect

type SupplierRow = Prisma.SupplierGetPayload<{ select: typeof SUPPLIER_SELECT }>

/** Hali yopilmagan buyurtma holatlari: kutilayotgan yoki qisman kelgan */
const OPEN_ORDER_STATUSES = ['ordered', 'partial'] as const

const MIN_PHONE_SEARCH_DIGITS = 3
/** Kartada ko'rsatiladigan oxirgi buyurtma va to'lovlar soni */
const CARD_RECENT_ORDERS = 20
const CARD_RECENT_PAYMENTS = 10

type CardRow = Omit<SupplierRow, '_count'> & Pick<SupplierCardDto, 'orders' | 'payments' | 'productCount'> & {
  debt: bigint
  purchased: bigint
  openOrders: bigint
}

@Injectable()
export class SuppliersService extends SoftDeleteCrudService<
  SupplierRow,
  SupplierDto,
  CreateSupplierDto,
  UpdateSupplierDto,
  SupplierListQueryDto
> {
  protected readonly resource = 'Ta’minotchi'
  protected readonly select = SUPPLIER_SELECT
  protected readonly sortMap = SUPPLIER_SORT
  protected readonly defaultSort = 'name'

  constructor(private readonly prisma: PrismaService) {
    super()
  }

  protected delegate(): CrudDelegate<SupplierRow> {
    return crudDelegate(this.prisma.scoped.supplier)
  }

  protected toDto({ _count, ...row }: SupplierRow): SupplierDto {
    return { ...row, productCount: _count.products }
  }

  /**
   * Ro'yxat: har qatorda mahsulotlar soni (`_count`, sahifa so'rovida) va
   * qarz — sahifa id'lari bo'yicha BITTA `groupBy`. Jami 3 so'rov, qatorlar
   * soniga bog'liq emas. Qarz — `purchase_orders.outstanding` (I18).
   */
  override async list(query: SupplierListQueryDto): Promise<Paged<SupplierListItemDto>> {
    const page = await super.list(query)
    const debts = await this.prisma.scoped.purchaseOrder.groupBy({
      by: ['supplierId'],
      where: { supplierId: { in: page.items.map((s) => s.id) }, deletedAt: null },
      _sum: { outstanding: true },
    })
    const debt = new Map(debts.map((d) => [d.supplierId, Number(d._sum.outstanding ?? 0n)]))
    return { ...page, items: page.items.map((s) => ({ ...s, debt: debt.get(s.id) ?? 0 })) }
  }

  /** Do'kon bo'yicha kreditorlik: jami qarz va qarzimiz bor ta'minotchilar — bitta agregat */
  async summary(): Promise<SupplierSummaryDto> {
    const { tenantId } = requireTenantTx()
    const [row] = await this.prisma.scoped.$queryRaw<{ debt: bigint; suppliers: bigint }[]>`
      SELECT COALESCE(SUM(outstanding), 0)::bigint AS debt, COUNT(DISTINCT supplier_id) AS suppliers
        FROM purchase_orders
       WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL AND outstanding > 0`
    return { debt: Number(row!.debt), suppliersWithDebt: Number(row!.suppliers) }
  }

  /** Nom (`suppliers_name_trgm`), aloqa shaxsi, STIR va telefon raqamlari bo'yicha; qarzi borlar */
  protected filters(query: SupplierListQueryDto): Prisma.SupplierWhereInput {
    const q = query.q
    const digits = q?.replace(/\D/g, '') ?? ''
    return {
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { contactPerson: { contains: q, mode: 'insensitive' } },
          ...(digits.length >= MIN_PHONE_SEARCH_DIGITS
            ? [{ phone: { contains: digits } }, { tin: { contains: digits } }]
            : []),
        ],
      }),
      ...(query.withDebt && { purchaseOrders: { some: { deletedAt: null, outstanding: { gt: 0 } } } }),
    }
  }

  /**
   * Ta'minotchi kartasi (T-072) — BITTA so'rov: ta'minotchi, jami qarz va
   * ochiq buyurtmalar soni, oxirgi buyurtmalar va to'lovlar (N+1 yo'q).
   * Qarz — `purchase_orders.outstanding` (faqat kelgan tovar, I18).
   */
  async card(id: string): Promise<SupplierCardDto> {
    const { tenantId } = requireTenantTx()
    const [row] = await this.prisma.scoped.$queryRaw<CardRow[]>`
      SELECT s.id, s.name, s.phone, s.contact_person AS "contactPerson", s.address, s.notes, s.email, s.tin,
             s.payment_term_days AS "paymentTermDays", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
             (SELECT COUNT(*)::int FROM products p
               WHERE p.tenant_id = s.tenant_id AND p.supplier_id = s.id AND p.deleted_at IS NULL) AS "productCount",
             (SELECT COALESCE(SUM(o.outstanding), 0)::bigint FROM purchase_orders o
               WHERE o.tenant_id = s.tenant_id AND o.supplier_id = s.id AND o.deleted_at IS NULL) AS debt,
             (SELECT COALESCE(SUM(o.received_value), 0)::bigint FROM purchase_orders o
               WHERE o.tenant_id = s.tenant_id AND o.supplier_id = s.id AND o.deleted_at IS NULL) AS purchased,
             (SELECT COUNT(*) FROM purchase_orders o
               WHERE o.tenant_id = s.tenant_id AND o.supplier_id = s.id AND o.deleted_at IS NULL
                 AND o.status IN ('ordered', 'partial')) AS "openOrders",
             (SELECT COALESCE(jsonb_agg(o ORDER BY o.date DESC, o.id DESC), '[]'::jsonb) FROM (
                SELECT id, number, status, total, paid, outstanding, date, due_date AS "dueDate"
                  FROM purchase_orders
                 WHERE tenant_id = s.tenant_id AND supplier_id = s.id AND deleted_at IS NULL
                 ORDER BY date DESC, id DESC LIMIT ${CARD_RECENT_ORDERS}) o) AS orders,
             (SELECT COALESCE(jsonb_agg(p ORDER BY p.created DESC), '[]'::jsonb) FROM (
                SELECT id, po_id AS "poId", amount, method, date, created_at AS created
                  FROM supplier_payments
                 WHERE tenant_id = s.tenant_id AND supplier_id = s.id
                 ORDER BY created_at DESC LIMIT ${CARD_RECENT_PAYMENTS}) p) AS payments
        FROM suppliers s
       WHERE s.tenant_id = ${tenantId}::uuid AND s.id = ${id}::uuid AND s.deleted_at IS NULL`
    if (!row) throw new NotFoundError(this.resource, id)
    const { debt, purchased, openOrders, orders, payments, ...supplier } = row
    return {
      ...supplier,
      debt: Number(debt),
      totalPurchased: Number(purchased),
      openOrders: Number(openOrders),
      orders,
      payments: payments.map(({ id: paymentId, poId, amount, method, date }) => ({ id: paymentId, poId, amount, method, date })),
    }
  }

  protected createData(dto: CreateSupplierDto): Omit<Prisma.SupplierUncheckedCreateInput, 'tenantId'> {
    return {
      name: dto.name,
      phone: dto.phone,
      contactPerson: dto.contactPerson ?? null,
      address: dto.address ?? null,
      notes: dto.notes ?? null,
      email: dto.email ?? null,
      tin: dto.tin ?? null,
      paymentTermDays: dto.paymentTermDays ?? null,
    }
  }

  protected updateData(dto: UpdateSupplierDto): Prisma.SupplierUncheckedUpdateInput {
    return { ...dto }
  }

  /**
   * Ochiq buyurtmasi bor ta'minotchi o'chmaydi: kelayotgan tovarni qabul
   * qilish va unga to'lash uchun u kerak (I18, I19).
   */
  protected override async assertDeletable(id: string): Promise<void> {
    const openOrders = await this.prisma.scoped.purchaseOrder.count({
      where: { supplierId: id, status: { in: [...OPEN_ORDER_STATUSES] }, deletedAt: null },
    })
    if (openOrders > 0) {
      throw new DomainError(
        'SUPPLIER_HAS_OPEN_ORDERS',
        `Ochiq buyurtmalar: ${openOrders} ta — avval qabul qiling yoki bekor qiling`,
        [{ field: 'id', code: 'SUPPLIER_HAS_OPEN_ORDERS', meta: { openOrders } }],
      )
    }
  }
}
