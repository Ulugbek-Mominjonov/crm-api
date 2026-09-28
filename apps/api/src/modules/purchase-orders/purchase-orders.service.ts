import { Injectable } from '@nestjs/common'
import { Prisma, type POStatus } from '@prisma/client'
import { dueDateFor, lineTotal } from '@crm/shared'
import { currentContext, currentRole } from '@/common/context/request-context'
import { dateFromDb, dateToDb, moneyFromDb, qtyFromDb } from '@/common/crud/convert'
import { pageArgs, toPaged, type Paged } from '@/common/crud/paging'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { withCtes } from '@/common/db/sql'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { fromMilli, milliToDb, toMilli } from '@/common/quantity'
import { canSeePurchaseAmounts } from '@/common/security/field-visibility'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import { CashRegisterService } from '@/modules/cash/cash-register.service'
import { DocNumberService } from '@/modules/doc-numbers/doc-number.service'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { StockService, type StockChange } from '@/modules/stock/stock.service'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import type {
  CreatePurchaseOrderDto, PayPurchaseOrderDto, PoItemInputDto, PoPaymentResultDto, PurchaseOrderDto,
  PurchaseOrderQueryDto, PurchaseOrderSummaryDto, ReceivePurchaseOrderDto, UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto'

const RESOURCE = 'Kirim buyurtmasi'

const PO_SELECT = {
  id: true,
  number: true,
  warehouseId: true,
  status: true,
  total: true,
  receivedValue: true,
  paid: true,
  outstanding: true,
  date: true,
  receivedDate: true,
  dueDate: true,
  note: true,
  createdAt: true,
  supplier: { select: { id: true, name: true } },
  items: {
    // Birlik — mahsulotdan (relationJoins: shu so'rovning o'zida)
    select: { id: true, productId: true, name: true, qty: true, receivedQty: true, cost: true, product: { select: { unit: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.PurchaseOrderSelect

type PoRecord = Prisma.PurchaseOrderGetPayload<{ select: typeof PO_SELECT }>

interface LockedOrder {
  id: string
  number: string
  status: POStatus
  supplierId: string
  warehouseId: string | null
  paid: bigint
  outstanding: bigint
}

/** Qabul qilinadigan qator: miqdor va kelgan qiymat (ulush bo'yicha yaxlitlangan) */
interface ReceiveLine {
  itemId: string
  productId: string
  qty: number
  cost: number
  value: number
}

/**
 * Kirim buyurtmalari (E8): yaratish va tahrir (`ordered` holatida),
 * qabul (to'liq/qisman, I19), ta'minotchiga to'lov (I18).
 *
 * Kreditorlik bazada: `received_value` qabulda oshadi, `outstanding` —
 * generated ustun (kelgan qiymat − to'langan). Qabul — ombor yozuvchisi
 * orqali (I11 o'rtacha tannarx, harakat jurnali) BITTA so'rovda.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly numbers: DocNumberService,
    private readonly register: CashRegisterService,
    private readonly audit: AuditService,
    private readonly events: DomainEvents,
  ) {}

  async list(query: PurchaseOrderQueryDto): Promise<Paged<PurchaseOrderDto>> {
    const where: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...((query.dateFrom || query.dateTo) && {
        date: {
          ...(query.dateFrom && { gte: dateToDb(query.dateFrom) }),
          ...(query.dateTo && { lte: dateToDb(query.dateTo) }),
        },
      }),
      ...(query.q && {
        OR: [
          { number: { contains: query.q, mode: 'insensitive' } },
          { supplier: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    }
    const [rows, total] = await Promise.all([
      this.prisma.scoped.purchaseOrder.findMany({
        where,
        select: PO_SELECT,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.scoped.purchaseOrder.count({ where }),
    ])
    const amounts = amountsVisible()
    return toPaged(rows.map((row) => toPoDto(row, amounts)), total, query)
  }

  /**
   * Sahifa kartalari — BITTA agregat (`(tenant_id, status)` indeksi; jadval
   * kichik). Summalar — faqat xarid pulini ko'radigan rolga.
   */
  async summary(): Promise<PurchaseOrderSummaryDto> {
    const { tenantId } = requireTenantTx()
    const monthStart = `${businessDate().slice(0, 7)}-01`
    const [row] = await this.prisma.scoped.$queryRaw<
      { outstanding: Prisma.Decimal; open: bigint; month: Prisma.Decimal; received: Prisma.Decimal }[]
    >`
      SELECT COALESCE(SUM(outstanding), 0) AS outstanding,
             COUNT(*) FILTER (WHERE status = 'ordered') AS open,
             COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled' AND date >= ${monthStart}::date), 0) AS month,
             COALESCE(SUM(total) FILTER (WHERE status = 'received'), 0) AS received
        FROM purchase_orders
       WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL`
    const openOrders = Number(row!.open)
    if (!amountsVisible()) return { openOrders }
    return {
      outstanding: row!.outstanding.toNumber(),
      openOrders,
      monthTotal: row!.month.toNumber(),
      receivedTotal: row!.received.toNumber(),
    }
  }

  async get(id: string): Promise<PurchaseOrderDto> {
    const row = await this.prisma.scoped.purchaseOrder.findFirst({ where: { id, deletedAt: null }, select: PO_SELECT })
    if (!row) throw new NotFoundError(RESOURCE, id)
    return toPoDto(row, amountsVisible())
  }

  /** Raqam `BUY-NNNN` (I12); to'lov muddati berilmasa — ta'minotchi shartidan */
  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrderDto> {
    const { tenantId } = requireTenantTx()
    const tx = this.prisma.scoped
    const supplier = await tx.supplier.findFirst({
      where: { id: dto.supplierId, deletedAt: null },
      select: { paymentTermDays: true },
    })
    if (!supplier) {
      throw new DomainError('REFERENCE_NOT_FOUND', 'Ta’minotchi topilmadi', [{ field: 'supplierId', code: 'REFERENCE_NOT_FOUND' }])
    }
    const items = await this.itemRows(tenantId, dto.items)
    const date = dto.date ?? businessDate()
    const dueDate = dto.dueDate ?? dueDateFor({ paymentTermDays: supplier.paymentTermDays ?? undefined }, date)
    const number = await this.numbers.next('BUY')

    const row = await tx.purchaseOrder
      .create({
        data: {
          tenantId,
          number,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId ?? null,
          total: totalOf(dto.items),
          date: dateToDb(date),
          dueDate: dueDate ? dateToDb(dueDate) : null,
          note: dto.note ?? null,
          items: { createMany: { data: items } },
        },
        select: PO_SELECT,
      })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE }))
    await this.audit.log({
      action: 'po.create',
      entityType: 'purchase-order',
      entityId: row.id,
      diff: { number, supplierId: dto.supplierId, total: moneyFromDb(row.total), lines: items.length },
    })
    return toPoDto(row, amountsVisible())
  }

  /** Faqat `ordered` holatida; qatorlar berilsa — to'liq almashtiriladi */
  async update(id: string, dto: UpdatePurchaseOrderDto): Promise<PurchaseOrderDto> {
    const { tenantId } = requireTenantTx()
    const order = await this.lockOrder(id)
    assertOrdered(order)
    const tx = this.prisma.scoped
    const items = dto.items ? await this.itemRows(tenantId, dto.items) : undefined
    if (items) await tx.pOItem.deleteMany({ where: { orderId: id } })
    const row = await tx.purchaseOrder
      .update({
        where: { id },
        data: {
          ...(dto.warehouseId !== undefined && { warehouseId: dto.warehouseId }),
          ...(dto.dueDate !== undefined && { dueDate: dateToDb(dto.dueDate) }),
          ...(dto.note !== undefined && { note: dto.note }),
          ...(items && { total: totalOf(dto.items!), items: { createMany: { data: items } } }),
        },
        select: PO_SELECT,
      })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE, id }))
    await this.audit.log({
      action: 'po.update',
      entityType: 'purchase-order',
      entityId: id,
      diff: { number: order.number, total: moneyFromDb(row.total) },
    })
    return toPoDto(row, amountsVisible())
  }

  /** Bekor qilish faqat `ordered` holatida — qisman kelgani bekor qilinmaydi (I19) */
  async cancel(id: string): Promise<PurchaseOrderDto> {
    const order = await this.lockOrder(id)
    assertOrdered(order)
    await this.prisma.scoped.purchaseOrder.update({ where: { id }, data: { status: 'cancelled' } })
    await this.audit.log({ action: 'po.cancel', entityType: 'purchase-order', entityId: id, diff: { number: order.number } })
    return this.get(id)
  }

  /** Yumshoq o'chirish: faqat tovar kelmagan va to'lanmagan buyurtma */
  async remove(id: string): Promise<void> {
    const order = await this.lockOrder(id)
    if ((order.status !== 'ordered' && order.status !== 'cancelled') || order.paid > 0n) {
      throw new DomainError('PO_ALREADY_RECEIVED', `${order.number}: tovar kelgan yoki to‘lov qilingan — o‘chirib bo‘lmaydi`)
    }
    await this.prisma.scoped.purchaseOrder.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.audit.log({ action: 'po.delete', entityType: 'purchase-order', entityId: id, diff: { number: order.number } })
  }

  /** O'chirishni qaytarish (undo): o'chirilgan buyurtma avvalgi holatida tiklanadi */
  async restore(id: string): Promise<PurchaseOrderDto> {
    const { count } = await this.prisma.scoped.purchaseOrder.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null },
    })
    if (count === 0) throw new NotFoundError(RESOURCE, id)
    const order = await this.get(id)
    await this.audit.log({ action: 'po.restore', entityType: 'purchase-order', entityId: id, diff: { number: order.number } })
    return order
  }

  /**
   * Qabul (T-069): qator buyurtmadan oshmaydi (I19, baza CHECK'i ham),
   * qisman — `partial`, hammasi kelsa — `received`. Har qator — kirim
   * harakati va o'rtacha tannarx (I11). Qulf tartibi: buyurtma → mahsulotlar.
   */
  async receive(id: string, dto: ReceivePurchaseOrderDto): Promise<PurchaseOrderDto> {
    const { tenantId } = requireTenantTx()
    const order = await this.lockOrder(id)
    if (order.status === 'cancelled') throw new DomainError('PO_CANCELLED', `${order.number} bekor qilingan`)
    if (order.status === 'received') throw new DomainError('PO_ALREADY_RECEIVED', `${order.number} to‘liq qabul qilingan`)

    const items = await this.prisma.scoped.pOItem.findMany({
      where: { orderId: id },
      select: { id: true, productId: true, qty: true, receivedQty: true, cost: true },
    })
    const lines = receiveLines(items, dto)
    if (lines.length === 0) throw new DomainError('PO_ALREADY_RECEIVED', `${order.number}: qabul qilinadigan qator yo‘q`)

    const received = new Map(lines.map((l) => [l.itemId, toMilli(l.qty)]))
    const fully = items.every((it) => toMilli(it.receivedQty) + (received.get(it.id) ?? 0) >= toMilli(it.qty))
    const plan = await this.stock.prepare(
      lines.map((line, i): StockChange => ({
        productId: line.productId,
        warehouseId: order.warehouseId ?? undefined,
        type: 'intake',
        qty: line.qty,
        unitCost: line.cost,
        supplierId: order.supplierId,
        refId: order.id,
        note: order.number,
        field: `items[${i}].poItemId`,
      })),
    )
    const date = businessDate()
    const value = lines.reduce((sum, l) => sum + l.value, 0)
    const rows = lines.map((l) => ({ id: l.itemId, qty: milliToDb(toMilli(l.qty)) }))

    await this.prisma.scoped
      .$executeRaw(
        withCtes(
          [
            ...this.stock.writeCtes(plan, { date, userId: currentContext().userId }),
            Prisma.sql`received_items AS (
              UPDATE po_items i SET received_qty = i.received_qty + r.qty
                FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS r(id uuid, qty numeric)
               WHERE i.tenant_id = ${tenantId}::uuid AND i.id = r.id
              RETURNING 1)`,
            Prisma.sql`received_order AS (
              UPDATE purchase_orders
                 SET received_value = received_value + ${value}::bigint,
                     status = ${fully ? 'received' : 'partial'}::"POStatus",
                     received_date = CASE WHEN ${fully} THEN ${date}::date ELSE received_date END
               WHERE tenant_id = ${tenantId}::uuid AND id = ${order.id}::uuid
              RETURNING 1)`,
          ],
          Prisma.sql`SELECT 1`,
        ),
      )
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE, id }))

    await this.audit.log({
      action: fully ? 'po.receive' : 'po.receivePartial',
      entityType: 'purchase-order',
      entityId: id,
      diff: { number: order.number, value, lines: lines.map((l) => ({ productId: l.productId, qty: l.qty })) },
    })
    this.events.publish('po.received', { orderId: id, productIds: [...new Set(lines.map((l) => l.productId))] })
    return this.get(id)
  }

  /**
   * Ta'minotchiga to'lov (T-070, I18): qarzdan — ya'ni KELGAN tovar
   * qiymatidan — oshmaydi; naqd — kassadan (ochiq smena), smena
   * hisobotida ko'rinadi (`supplier_payments.shift_id`).
   */
  async pay(id: string, dto: PayPurchaseOrderDto): Promise<PoPaymentResultDto> {
    const { tenantId } = requireTenantTx()
    const register = await this.register.lock()
    const order = await this.lockOrder(id)
    const outstanding = moneyFromDb(order.outstanding)
    if (dto.amount > outstanding) throw paymentExceedsDebt(order.number, outstanding, dto.amount)
    const shiftId = dto.method === 'cash' ? this.register.requireOpenShift(register) : register.activeShiftId
    const paymentId = uuidv7()
    const date = businessDate()

    const [row] = await this.prisma.scoped
      .$queryRaw<{ createdAt: Date }[]>(
        withCtes(
          [
            Prisma.sql`payment AS (
              INSERT INTO supplier_payments (id, tenant_id, po_id, supplier_id, amount, method, date, user_id, shift_id)
              VALUES (${paymentId}::uuid, ${tenantId}::uuid, ${order.id}::uuid, ${order.supplierId}::uuid,
                      ${dto.amount}::bigint, ${dto.method}::"PayMethod", ${date}::date,
                      ${currentContext().userId ?? null}::uuid, ${shiftId}::uuid)
              RETURNING created_at)`,
            Prisma.sql`order_paid AS (
              UPDATE purchase_orders SET paid = paid + ${dto.amount}::bigint
               WHERE tenant_id = ${tenantId}::uuid AND id = ${order.id}::uuid
              RETURNING 1)`,
            ...(dto.method === 'cash' ? this.register.cashCtes(shiftId!, -BigInt(dto.amount)) : []),
          ],
          Prisma.sql`SELECT created_at AS "createdAt" FROM payment`,
        ),
      )
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE, id }))

    await this.audit.log({
      action: 'po.pay',
      entityType: 'purchase-order',
      entityId: id,
      diff: { number: order.number, amount: dto.amount, method: dto.method, outstanding: outstanding - dto.amount },
    })
    return {
      payment: { id: paymentId, poId: order.id, amount: dto.amount, method: dto.method, date, shiftId, createdAt: row!.createdAt },
      order: await this.get(id),
    }
  }

  /** Buyurtma qatorlari: mahsulot nomi snapshot, tenant aniq (ichma-ich yozuv) */
  private async itemRows(tenantId: string, items: readonly PoItemInputDto[]): Promise<Prisma.POItemCreateManyOrderInput[]> {
    const products = await this.prisma.scoped.product.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.productId))] }, deletedAt: null },
      select: { id: true, name: true },
    })
    const names = new Map(products.map((p) => [p.id, p.name]))
    return items.map((item, i) => {
      const name = names.get(item.productId)
      if (!name) {
        throw new DomainError('REFERENCE_NOT_FOUND', 'Mahsulot topilmadi', [
          { field: `items[${i}].productId`, code: 'REFERENCE_NOT_FOUND' },
        ])
      }
      return {
        id: uuidv7(),
        tenantId,
        productId: item.productId,
        name,
        qty: milliToDb(toMilli(item.qty)),
        cost: BigInt(item.cost),
      }
    })
  }

  /** Buyurtma qatori qulfi. Boshqa tenantniki yoki o'chirilgan — 404 */
  private async lockOrder(id: string): Promise<LockedOrder> {
    const { tenantId } = requireTenantTx()
    const [order] = await this.prisma.scoped.$queryRaw<LockedOrder[]>`
      SELECT id, number, status, supplier_id AS "supplierId", warehouse_id AS "warehouseId", paid, outstanding
        FROM purchase_orders
       WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND deleted_at IS NULL
         FOR UPDATE`
    if (!order) throw new NotFoundError(RESOURCE, id)
    return order
  }
}

/** Buyurtma summasi — qatorlar so'mgacha yaxlitlanib (shared `lineTotal`) */
function totalOf(items: readonly PoItemInputDto[]): bigint {
  return BigInt(items.reduce((sum, item) => sum + lineTotal(item.cost, item.qty), 0))
}

/** Xarid summalari joriy rolga ko'rinadimi — sotuvchiga yo'q: bitta qatorli buyurtmada summadan tannarx tiklanadi */
function amountsVisible(): boolean {
  return canSeePurchaseAmounts(currentRole())
}

/** Qarzdan oshgan to'lov (I18). Xarid pulini ko'rmaydigan rolga qarz miqdori aytilmaydi */
function paymentExceedsDebt(number: string, outstanding: number, requested: number): DomainError {
  if (!amountsVisible()) {
    return new DomainError('PAYMENT_EXCEEDS_DEBT', `${number}: to‘lov kelgan tovar qarzidan oshmaydi`, [
      { field: 'amount', code: 'PAYMENT_EXCEEDS_DEBT', meta: { requested } },
    ])
  }
  return new DomainError('PAYMENT_EXCEEDS_DEBT', `${number}: qarz ${outstanding} so‘m, to‘lov ${requested} so‘m`, [
    { field: 'amount', code: 'PAYMENT_EXCEEDS_DEBT', meta: { outstanding, requested } },
  ])
}

function assertOrdered(order: LockedOrder): void {
  if (order.status === 'cancelled') throw new DomainError('PO_CANCELLED', `${order.number} bekor qilingan`)
  if (order.status !== 'ordered') {
    throw new DomainError('PO_ALREADY_RECEIVED', `${order.number}: tovar kela boshlagan — o‘zgartirib/bekor qilib bo‘lmaydi`)
  }
}

/**
 * Qabul qatorlari: berilmasa — qolgan hammasi. Miqdor qolgandan oshmaydi
 * (I19). Kelgan qiymat ulush yig'indisi bo'yicha yaxlitlanadi — qator
 * to'liq kelganda aynan `round(qty × cost)`, ya'ni buyurtma summasi.
 */
function receiveLines(
  items: readonly { id: string; productId: string; qty: Prisma.Decimal; receivedQty: Prisma.Decimal; cost: bigint }[],
  dto: ReceivePurchaseOrderDto,
): ReceiveLine[] {
  const byId = new Map(items.map((it) => [it.id, it]))
  const requests =
    dto.items ??
    items
      .filter((it) => toMilli(it.qty) > toMilli(it.receivedQty))
      .map((it) => ({ poItemId: it.id, qty: fromMilli(toMilli(it.qty) - toMilli(it.receivedQty)) }))
  if (new Set(requests.map((r) => r.poItemId)).size !== requests.length) {
    throw new DomainError('VALIDATION_FAILED', 'Bir qator bir marta bo‘ladi', [{ field: 'items', code: 'VALIDATION_FAILED' }])
  }
  return requests.map((request, i) => {
    const item = byId.get(request.poItemId)
    if (!item) {
      throw new DomainError('REFERENCE_NOT_FOUND', 'Buyurtma qatori topilmadi', [
        { field: `items[${i}].poItemId`, code: 'REFERENCE_NOT_FOUND' },
      ])
    }
    const ordered = qtyFromDb(item.qty)
    const done = qtyFromDb(item.receivedQty)
    if (toMilli(done) + toMilli(request.qty) > toMilli(ordered)) {
      throw new DomainError('PO_OVER_RECEIVE', `Buyurtma ${ordered}, qabul qilingan ${done}, yana ${request.qty} — ko‘p`, [
        { field: `items[${i}].qty`, code: 'PO_OVER_RECEIVE', meta: { ordered, received: done, requested: request.qty } },
      ])
    }
    const cost = moneyFromDb(item.cost)
    return {
      itemId: item.id,
      productId: item.productId,
      qty: request.qty,
      cost,
      value: lineTotal(cost, fromMilli(toMilli(done) + toMilli(request.qty))) - lineTotal(cost, done),
    }
  })
}

/** `amounts` — xarid summalari (`amountsVisible`) */
function toPoDto(r: PoRecord, amounts: boolean): PurchaseOrderDto {
  return {
    id: r.id,
    number: r.number,
    supplier: r.supplier,
    warehouseId: r.warehouseId,
    status: r.status,
    ...(amounts && {
      total: moneyFromDb(r.total),
      receivedValue: moneyFromDb(r.receivedValue),
      paid: moneyFromDb(r.paid),
      outstanding: moneyFromDb(r.outstanding),
    }),
    date: dateFromDb(r.date),
    receivedDate: r.receivedDate ? dateFromDb(r.receivedDate) : null,
    dueDate: r.dueDate ? dateFromDb(r.dueDate) : null,
    note: r.note,
    createdAt: r.createdAt,
    items: r.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      name: it.name,
      qty: qtyFromDb(it.qty),
      receivedQty: qtyFromDb(it.receivedQty),
      unit: it.product.unit,
      cost: moneyFromDb(it.cost),
    })),
  }
}
