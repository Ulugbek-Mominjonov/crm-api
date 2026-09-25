import { Injectable } from '@nestjs/common'
import { Prisma, type DeliveryStatus } from '@prisma/client'
import { hasPermission } from '@crm/shared'
import { dateFromDb, dateToDb, moneyFromDb } from '@/common/crud/convert'
import { pageArgs, toPaged, type Paged } from '@/common/crud/paging'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { DomainError, NotFoundError, PermissionDeniedError } from '@/common/errors/domain.error'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import type {
  CreateDeliveryDto, DeliveryDto, DeliveryQueryDto, DeliveryStatusDto, DeliverySummaryDto, RouteQueryDto, RouteSheetDto,
  UpdateDeliveryDto,
} from './dto/delivery.dto'

const RESOURCE = 'Yetkazish'

/** Faqat oldinga; yakunlangan holatdan chiqish yo'q (T-074) */
const TRANSITIONS: Readonly<Record<DeliveryStatus, readonly DeliveryStatus[]>> = {
  pending: ['on_way', 'cancelled'],
  on_way: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
}
const ACTIVE: DeliveryStatus[] = ['pending', 'on_way']

const DELIVERY_SELECT = {
  id: true,
  saleId: true,
  address: true,
  phone: true,
  standaloneFee: true,
  status: true,
  scheduledDate: true,
  note: true,
  lat: true,
  lng: true,
  driverId: true,
  createdAt: true,
  deliveredAt: true,
  sale: { select: { number: true, deliveryFee: true, outstanding: true } },
  customer: { select: { id: true, name: true } },
  driver: { select: { id: true, name: true } },
} satisfies Prisma.DeliverySelect

type DeliveryRecord = Prisma.DeliveryGetPayload<{ select: typeof DELIVERY_SELECT }>

/**
 * Yetkazib berish (T-074, T-075). Chekli yetkazishning narxi chekda
 * (`sales.delivery_fee`, D3) — bu yerda takrorlanmaydi; alohida xizmat
 * yetkazishida — `standalone_fee`. Haydovchi — xodim.
 */
@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: DomainEvents,
  ) {}

  async list(query: DeliveryQueryDto): Promise<Paged<DeliveryDto>> {
    const today = businessDate()
    const where: Prisma.DeliveryWhereInput = {
      deletedAt: null,
      ...(query.status && { status: query.status }),
      ...(query.driverId && { driverId: query.driverId }),
      ...((query.dateFrom || query.dateTo) && {
        scheduledDate: {
          ...(query.dateFrom && { gte: dateToDb(query.dateFrom) }),
          ...(query.dateTo && { lte: dateToDb(query.dateTo) }),
        },
      }),
      ...(query.overdue && { status: { in: ACTIVE }, scheduledDate: { lt: dateToDb(today) } }),
      ...(query.q && {
        OR: [
          { address: { contains: query.q, mode: 'insensitive' } },
          { phone: { contains: query.q } },
          { customer: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      }),
    }
    const [rows, total] = await Promise.all([
      this.prisma.scoped.delivery.findMany({
        where,
        select: DELIVERY_SELECT,
        orderBy: [{ scheduledDate: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.scoped.delivery.count({ where }),
    ])
    return toPaged(rows.map((r) => toDeliveryDto(r, today)), total, query)
  }

  /**
   * Sahifa kartalari — 2 so'rov (parallel): holatlar bo'yicha son va
   * yetkazilganlar narxi (chekli — chekdagi, D3); faol yetkazishlar
   * haydovchi bo'yicha (`(tenant_id, driver_id, status)` indeksi).
   */
  async summary(): Promise<DeliverySummaryDto> {
    const { tenantId } = requireTenantTx()
    const [[counts], load] = await Promise.all([
      this.prisma.scoped.$queryRaw<{ pending: bigint; onWay: bigint; delivered: bigint; fee: Prisma.Decimal }[]>`
        SELECT COUNT(*) FILTER (WHERE d.status = 'pending') AS pending,
               COUNT(*) FILTER (WHERE d.status = 'on_way') AS "onWay",
               COUNT(*) FILTER (WHERE d.status = 'delivered') AS delivered,
               COALESCE(SUM(COALESCE(s.delivery_fee, d.standalone_fee, 0)) FILTER (WHERE d.status = 'delivered'), 0) AS fee
          FROM deliveries d
          LEFT JOIN sales s ON s.tenant_id = d.tenant_id AND s.id = d.sale_id
         WHERE d.tenant_id = ${tenantId}::uuid AND d.deleted_at IS NULL`,
      this.prisma.scoped.$queryRaw<{ id: string | null; name: string | null; count: bigint }[]>`
        SELECT d.driver_id AS id, e.name, COUNT(*) AS count
          FROM deliveries d
          LEFT JOIN employees e ON e.tenant_id = d.tenant_id AND e.id = d.driver_id
         WHERE d.tenant_id = ${tenantId}::uuid AND d.deleted_at IS NULL AND d.status IN ('pending', 'on_way')
         GROUP BY d.driver_id, e.name
         ORDER BY count DESC, e.name`,
    ])
    return {
      pending: Number(counts!.pending),
      onWay: Number(counts!.onWay),
      delivered: Number(counts!.delivered),
      feeRevenue: counts!.fee.toNumber(),
      workload: load.map((l) => ({ driver: l.id ? { id: l.id, name: l.name ?? '' } : null, count: Number(l.count) })),
    }
  }

  async get(id: string): Promise<DeliveryDto> {
    const row = await this.prisma.scoped.delivery.findFirst({ where: { id, deletedAt: null }, select: DELIVERY_SELECT })
    if (!row) throw new NotFoundError(RESOURCE, id)
    return toDeliveryDto(row, businessDate())
  }

  /** Chekli — narx chekdan (D3), mijoz ham chekdan; chekSIZ — alohida narx */
  async create(dto: CreateDeliveryDto): Promise<DeliveryDto> {
    const { tenantId } = requireTenantTx()
    let customerId = dto.customerId ?? null
    if (dto.saleId) {
      assertNoFeeOnSale(dto.fee)
      const sale = await this.prisma.scoped.sale.findFirst({
        where: { id: dto.saleId, deletedAt: null },
        select: { customerId: true, delivery: { select: { id: true } } },
      })
      if (!sale) {
        throw new DomainError('REFERENCE_NOT_FOUND', 'Chek topilmadi', [{ field: 'saleId', code: 'REFERENCE_NOT_FOUND' }])
      }
      if (sale.delivery) {
        throw new DomainError('ALREADY_EXISTS', 'Bu chek uchun yetkazish bor', [{ field: 'saleId', code: 'ALREADY_EXISTS' }])
      }
      customerId ??= sale.customerId
    }
    const row = await this.prisma.scoped.delivery
      .create({
        data: {
          tenantId,
          saleId: dto.saleId ?? null,
          customerId,
          address: dto.address,
          phone: dto.phone,
          standaloneFee: dto.saleId ? null : BigInt(dto.fee ?? 0),
          driverId: dto.driverId ?? null,
          scheduledDate: dateToDb(dto.scheduledDate),
          note: dto.note ?? null,
          lat: dto.lat ?? null,
          lng: dto.lng ?? null,
        },
        select: DELIVERY_SELECT,
      })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE }))
    await this.audit.log({
      action: 'delivery.create',
      entityType: 'delivery',
      entityId: row.id,
      diff: { saleId: row.saleId, driverId: row.driverId, scheduledDate: dto.scheduledDate },
    })
    return toDeliveryDto(row, businessDate())
  }

  /** Faqat faol (yetkazilmagan, bekor qilinmagan) yetkazish tahrirlanadi */
  async update(id: string, dto: UpdateDeliveryDto): Promise<DeliveryDto> {
    const current = await this.lock(id)
    if (!ACTIVE.includes(current.status)) {
      throw new DomainError('INVALID_STATUS_TRANSITION', `Yetkazish ${current.status} — tahrirlab bo‘lmaydi`, [
        { field: 'status', code: 'INVALID_STATUS_TRANSITION', meta: { from: current.status } },
      ])
    }
    if (current.saleId) assertNoFeeOnSale(dto.fee)
    const row = await this.prisma.scoped.delivery
      .update({
        where: { id },
        data: {
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.scheduledDate !== undefined && { scheduledDate: dateToDb(dto.scheduledDate) }),
          ...(dto.driverId !== undefined && { driverId: dto.driverId }),
          ...(dto.fee !== undefined && { standaloneFee: BigInt(dto.fee) }),
          ...(dto.note !== undefined && { note: dto.note }),
          ...(dto.lat !== undefined && { lat: dto.lat }),
          ...(dto.lng !== undefined && { lng: dto.lng }),
        },
        select: DELIVERY_SELECT,
      })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE, id }))
    await this.audit.log({ action: 'delivery.update', entityType: 'delivery', entityId: id })
    return toDeliveryDto(row, businessDate())
  }

  /**
   * Holat: faqat oldinga (`pending → on_way → delivered`), faol holatdan —
   * bekor. `deliveries.edit` huquqi bo'lmasa — faqat O'ZIGA biriktirilgan
   * yetkazishni (haydovchi rejimi, T-075).
   */
  async setStatus(id: string, dto: DeliveryStatusDto, user: AuthContext): Promise<DeliveryDto> {
    const current = await this.lock(id)
    if (!hasPermission(user.role, 'deliveries', 'edit') && current.driverId !== user.employeeId) {
      throw new PermissionDeniedError('Faqat o‘zingizga biriktirilgan yetkazish holatini o‘zgartira olasiz')
    }
    if (!TRANSITIONS[current.status].includes(dto.status)) {
      throw new DomainError('INVALID_STATUS_TRANSITION', `${current.status} → ${dto.status} mumkin emas`, [
        { field: 'status', code: 'INVALID_STATUS_TRANSITION', meta: { from: current.status, to: dto.status } },
      ])
    }
    const row = await this.prisma.scoped.delivery.update({
      where: { id },
      data: { status: dto.status, ...(dto.status === 'delivered' && { deliveredAt: new Date() }) },
      select: DELIVERY_SELECT,
    })
    await this.audit.log({
      action: 'delivery.status',
      entityType: 'delivery',
      entityId: id,
      diff: { from: current.status, to: dto.status },
    })
    this.events.publish('delivery.status', { deliveryId: id, status: dto.status })
    return toDeliveryDto(row, businessDate())
  }

  async remove(id: string): Promise<void> {
    const current = await this.lock(id)
    if (current.status === 'delivered') {
      throw new DomainError('INVALID_STATUS_TRANSITION', 'Yetkazilgan yozuv o‘chirilmaydi', [
        { field: 'status', code: 'INVALID_STATUS_TRANSITION', meta: { from: current.status } },
      ])
    }
    await this.prisma.scoped.delivery.update({ where: { id }, data: { deletedAt: new Date() } })
    await this.audit.log({ action: 'delivery.delete', entityType: 'delivery', entityId: id })
  }

  /**
   * O'chirishni qaytarish (undo). `sale_id` o'chirilganlar bilan ham noyob —
   * chekka ikkinchi yetkazish paydo bo'lmagan, to'qnashuv yo'q.
   */
  async restore(id: string): Promise<DeliveryDto> {
    const { count } = await this.prisma.scoped.delivery.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null },
    })
    if (count === 0) throw new NotFoundError(RESOURCE, id)
    await this.audit.log({ action: 'delivery.restore', entityType: 'delivery', entityId: id })
    return this.get(id)
  }

  /** Haydovchi ko'rinishi (T-075): faqat O'ZIGA biriktirilganlar — xodim tokendan */
  async mine(user: AuthContext, status?: DeliveryStatus): Promise<DeliveryDto[]> {
    const today = businessDate()
    const rows = await this.prisma.scoped.delivery.findMany({
      where: { deletedAt: null, driverId: user.employeeId, status: status ?? { in: ACTIVE } },
      select: DELIVERY_SELECT,
      orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }],
    })
    return rows.map((r) => toDeliveryDto(r, today))
  }

  /**
   * Marshrut varaqasi — BITTA so'rov: haydovchi va uning kungi yetkazishlari
   * (chek raqami, mijoz, olinadigan pul). Bekor qilinganlar kirmaydi.
   */
  async route(query: RouteQueryDto, user: AuthContext): Promise<RouteSheetDto> {
    const date = query.date ?? businessDate()
    const driverId = query.driverId ?? user.employeeId
    const driver = await this.prisma.scoped.employee.findFirst({
      where: { id: driverId, deletedAt: null },
      select: {
        id: true,
        name: true,
        deliveries: {
          where: { deletedAt: null, scheduledDate: dateToDb(date), status: { not: 'cancelled' } },
          select: DELIVERY_SELECT,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    })
    if (!driver) throw new NotFoundError('Haydovchi', driverId)
    const today = businessDate()
    const stops = driver.deliveries.map((d, i) => ({ ...toDeliveryDto(d, today), sequence: i + 1, collect: collectOf(d) }))
    return {
      date,
      driver: { id: driver.id, name: driver.name },
      stops,
      collectTotal: stops.reduce((sum, s) => sum + s.collect, 0),
    }
  }

  /** Qator qulfi: parallel holat o'zgarishi "oldinga" qoidasini chetlab o'tmasin */
  private async lock(id: string): Promise<{ status: DeliveryStatus; driverId: string | null; saleId: string | null }> {
    const { tenantId } = requireTenantTx()
    const [row] = await this.prisma.scoped.$queryRaw<{ status: DeliveryStatus; driverId: string | null; saleId: string | null }[]>`
      SELECT status, driver_id AS "driverId", sale_id AS "saleId"
        FROM deliveries
       WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid AND deleted_at IS NULL
         FOR UPDATE`
    if (!row) throw new NotFoundError(RESOURCE, id)
    return row
  }
}

/** D3: chekli yetkazish narxi chekda — bu yerda berilmaydi */
function assertNoFeeOnSale(fee: number | undefined): void {
  if (fee === undefined) return
  throw new DomainError('VALIDATION_FAILED', 'Chekli yetkazish narxi chekda — alohida berilmaydi', [
    { field: 'fee', code: 'VALIDATION_FAILED' },
  ])
}

/** Haydovchi oladigan pul: chekning qolgan qarzi yoki alohida xizmat narxi */
function collectOf(d: DeliveryRecord): number {
  return d.sale ? moneyFromDb(d.sale.outstanding) : moneyFromDb(d.standaloneFee ?? 0n)
}

function toDeliveryDto(d: DeliveryRecord, today: string): DeliveryDto {
  const scheduledDate = dateFromDb(d.scheduledDate)
  return {
    id: d.id,
    saleId: d.saleId,
    saleNumber: d.sale?.number ?? null,
    customer: d.customer,
    address: d.address,
    phone: d.phone,
    fee: d.sale ? moneyFromDb(d.sale.deliveryFee) : moneyFromDb(d.standaloneFee ?? 0n),
    driver: d.driver,
    status: d.status,
    scheduledDate,
    overdue: ACTIVE.includes(d.status) && scheduledDate < today,
    note: d.note,
    lat: d.lat,
    lng: d.lng,
    createdAt: d.createdAt,
    deliveredAt: d.deliveredAt,
  }
}
