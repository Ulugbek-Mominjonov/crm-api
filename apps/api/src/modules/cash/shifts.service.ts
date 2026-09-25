import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { currentContext } from '@/common/context/request-context'
import { moneyFromDb } from '@/common/crud/convert'
import { pageArgs, toPaged, type Paged } from '@/common/crud/paging'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { addDays, businessDayStart } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import { CashRegisterService } from './cash-register.service'
import type {
  CloseShiftDto, CurrentShiftDto, OpenShiftDto, ShiftDto, ShiftQueryDto, ShiftReportDto,
} from './dto/cash.dto'

const RESOURCE = 'Smena'

export const SHIFT_SELECT = {
  id: true,
  status: true,
  openedAt: true,
  closedAt: true,
  openingBalance: true,
  cashIn: true,
  cashOut: true,
  expectedBalance: true,
  countedBalance: true,
  difference: true,
  note: true,
  userId: true,
} satisfies Prisma.CashShiftSelect

type ShiftRecord = Prisma.CashShiftGetPayload<{ select: typeof SHIFT_SELECT }>

/** Z-hisobot: smena qatori + agregatlar — bitta so'rov natijasi */
interface ReportRow extends ShiftRecord {
  cashierName: string | null
  salesCount: bigint
  salesTotal: bigint
  salesCash: bigint
  salesCard: bigint
  salesTransfer: bigint
  salesCredit: bigint
  cancelled: bigint
  returnsCount: bigint
  returnsTotal: bigint
  returnsCash: bigint
  manualIn: bigint
  manualOut: bigint
  expenses: bigint
  debtCash: bigint
  debtBank: bigint
  supplierCash: bigint
  cashBalance: bigint
}

/**
 * Kassa smenasi (T-059, T-061): I8 — bir vaqtda bitta ochiq smena
 * (registr qulfi + baza qisman noyob indeksi), I10 — ochilishda balans
 * sanoqqa tenglashadi, yopishda kutilgan/sanalgan/farq saqlanadi.
 */
@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly register: CashRegisterService,
    private readonly audit: AuditService,
    private readonly events: DomainEvents,
  ) {}

  async current(): Promise<CurrentShiftDto> {
    const { tenantId } = requireTenantTx()
    const state = await this.prisma.scoped.tenantState.findUniqueOrThrow({
      where: { tenantId },
      select: { activeShiftId: true, cashBalance: true },
    })
    const shift = state.activeShiftId
      ? await this.prisma.scoped.cashShift.findFirst({ where: { id: state.activeShiftId }, select: SHIFT_SELECT })
      : null
    const [dto = null] = shift ? await this.withCashiers([shift]) : []
    return { shift: dto, cashBalance: moneyFromDb(state.cashBalance) }
  }

  async list(query: ShiftQueryDto): Promise<Paged<ShiftDto>> {
    // `(tenant_id, opened_at)` indeksi; kun chegarasi — Toshkent vaqti bilan
    const where: Prisma.CashShiftWhereInput = {
      ...(query.status && { status: query.status }),
      ...((query.dateFrom || query.dateTo) && {
        openedAt: {
          ...(query.dateFrom && { gte: businessDayStart(query.dateFrom) }),
          ...(query.dateTo && { lt: businessDayStart(addDays(query.dateTo, 1)) }),
        },
      }),
    }
    const [rows, total] = await Promise.all([
      this.prisma.scoped.cashShift.findMany({
        where,
        select: SHIFT_SELECT,
        orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.scoped.cashShift.count({ where }),
    ])
    return toPaged(await this.withCashiers(rows), total, query)
  }

  /**
   * Kassir ismi — sahifadagi barcha smenalar uchun BITTA so'rov (users PK):
   * `users` ro'yxatini faqat admin ko'radi, kassa tarixi esa sotuvchiga ham ochiq.
   */
  private async withCashiers(rows: ShiftRecord[]): Promise<ShiftDto[]> {
    const ids = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))]
    const users = ids.length === 0
      ? []
      : await this.prisma.scoped.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, employee: { select: { name: true } } },
      })
    const names = new Map(users.map((u) => [u.id, u.employee.name]))
    return rows.map((r) => toShiftDto(r, (r.userId && names.get(r.userId)) ?? null))
  }

  /** Smena ochish: balans jismoniy sanoqqa tenglashadi (I10) */
  async open(dto: OpenShiftDto): Promise<ShiftDto> {
    const { tenantId } = requireTenantTx()
    const register = await this.register.lock()
    if (register.activeShiftId) {
      throw new DomainError('SHIFT_ALREADY_OPEN', 'Smena allaqachon ochiq — avval uni yoping')
    }
    const tx = this.prisma.scoped
    const shift = await tx.cashShift
      .create({
        data: {
          tenantId,
          openedAt: new Date(),
          openingBalance: BigInt(dto.openingBalance),
          userId: currentContext().userId ?? null,
        },
        select: SHIFT_SELECT,
      })
      .catch(rethrowOpenShift)
    await tx.tenantState.update({
      where: { tenantId },
      data: { activeShiftId: shift.id, cashBalance: BigInt(dto.openingBalance) },
    })
    await this.audit.log({
      action: 'shift.open',
      entityType: 'shift',
      entityId: shift.id,
      diff: { openingBalance: dto.openingBalance, previousBalance: moneyFromDb(register.cashBalance) },
    })
    this.events.publish('shift.opened', { shiftId: shift.id })
    const [result] = await this.withCashiers([shift])
    return result!
  }

  /** Smena yopish: kutilgan = kassa balansi, farq = sanalgan − kutilgan (I10) */
  async close(dto: CloseShiftDto): Promise<ShiftDto> {
    const { tenantId } = requireTenantTx()
    assertDenominations(dto)
    const register = await this.register.lock()
    if (!register.activeShiftId) {
      throw new DomainError('SHIFT_NOT_OPEN', 'Ochiq smena yo‘q')
    }
    const expected = register.cashBalance
    const counted = BigInt(dto.countedBalance)
    const tx = this.prisma.scoped
    const shift = await tx.cashShift.update({
      where: { id: register.activeShiftId },
      data: {
        status: 'closed',
        closedAt: new Date(),
        expectedBalance: expected,
        countedBalance: counted,
        difference: counted - expected,
        note: dto.note ?? null,
      },
      select: SHIFT_SELECT,
    })
    await tx.tenantState.update({ where: { tenantId }, data: { activeShiftId: null } })
    await this.audit.log({
      action: 'shift.close',
      entityType: 'shift',
      entityId: shift.id,
      diff: {
        expected: moneyFromDb(expected),
        counted: dto.countedBalance,
        difference: moneyFromDb(counted - expected),
        ...(dto.denominations && { denominations: dto.denominations }),
      },
    })
    this.events.publish('shift.closed', { shiftId: shift.id })
    const [result] = await this.withCashiers([shift])
    return result!
  }

  /**
   * X/Z hisobot — BITTA agregat so'rov (T-061). Har pul hujjati smenaga
   * `shift_id` bilan bog'langan; tushumga nasiya cheklar ham kiradi (I4).
   */
  async report(id: string): Promise<ShiftReportDto> {
    const { tenantId } = requireTenantTx()
    const [r] = await this.prisma.scoped.$queryRaw<ReportRow[]>`
      SELECT sh.id, sh.status, sh.opened_at AS "openedAt", sh.closed_at AS "closedAt",
             sh.opening_balance AS "openingBalance", sh.cash_in AS "cashIn", sh.cash_out AS "cashOut",
             sh.expected_balance AS "expectedBalance", sh.counted_balance AS "countedBalance",
             sh.difference, sh.note, sh.user_id AS "userId",
             (SELECT em.name FROM users u
                JOIN employees em ON em.tenant_id = u.tenant_id AND em.id = u.employee_id
               WHERE u.tenant_id = sh.tenant_id AND u.id = sh.user_id) AS "cashierName",
             s.*, m.*, e.*, d.*, sp.*, ts.cash_balance AS "cashBalance"
        FROM cash_shifts sh
        JOIN tenant_state ts ON ts.tenant_id = sh.tenant_id
       CROSS JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE type = 'sale' AND status <> 'cancelled')                      AS "salesCount",
                COALESCE(SUM(total) FILTER (WHERE type = 'sale' AND status <> 'cancelled'), 0)       AS "salesTotal",
                COALESCE(SUM(paid_cash) FILTER (WHERE type = 'sale' AND status <> 'cancelled'), 0)   AS "salesCash",
                COALESCE(SUM(paid_card) FILTER (WHERE type = 'sale' AND status <> 'cancelled'), 0)   AS "salesCard",
                COALESCE(SUM(paid_transfer) FILTER (WHERE type = 'sale' AND status <> 'cancelled'), 0) AS "salesTransfer",
                COALESCE(SUM(total - paid_cash - paid_card - paid_transfer)
                         FILTER (WHERE type = 'sale' AND status <> 'cancelled'), 0)                  AS "salesCredit",
                COUNT(*) FILTER (WHERE type = 'sale' AND status = 'cancelled')                       AS cancelled,
                COUNT(*) FILTER (WHERE type = 'return' AND status <> 'cancelled')                    AS "returnsCount",
                COALESCE(SUM(total) FILTER (WHERE type = 'return' AND status <> 'cancelled'), 0)     AS "returnsTotal",
                COALESCE(SUM(paid_cash) FILTER (WHERE type = 'return' AND status <> 'cancelled'), 0) AS "returnsCash"
           FROM sales WHERE tenant_id = ts.tenant_id AND shift_id = ${id}::uuid) s
       CROSS JOIN LATERAL (
         SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'in'), 0)  AS "manualIn",
                COALESCE(SUM(amount) FILTER (WHERE direction = 'out'), 0) AS "manualOut"
           FROM cash_movements WHERE tenant_id = ts.tenant_id AND shift_id = ${id}::uuid) m
       CROSS JOIN LATERAL (
         SELECT COALESCE(SUM(amount), 0) AS expenses
           FROM expenses WHERE tenant_id = ts.tenant_id AND shift_id = ${id}::uuid
            AND method = 'cash' AND deleted_at IS NULL) e
       CROSS JOIN LATERAL (
         SELECT COALESCE(SUM(amount) FILTER (WHERE method = 'cash'), 0) AS "debtCash",
                COALESCE(SUM(amount) FILTER (WHERE method = 'bank'), 0) AS "debtBank"
           FROM debt_payments WHERE tenant_id = ts.tenant_id AND shift_id = ${id}::uuid) d
       CROSS JOIN LATERAL (
         SELECT COALESCE(SUM(amount), 0) AS "supplierCash"
           FROM supplier_payments WHERE tenant_id = ts.tenant_id AND shift_id = ${id}::uuid AND method = 'cash') sp
       WHERE sh.tenant_id = ${tenantId}::uuid AND sh.id = ${id}::uuid`
    if (!r) throw new NotFoundError(RESOURCE, id)
    const n = (v: bigint) => Number(v)
    return {
      shift: toShiftDto(r, r.cashierName),
      sales: {
        count: n(r.salesCount),
        total: n(r.salesTotal),
        cash: n(r.salesCash),
        card: n(r.salesCard),
        transfer: n(r.salesTransfer),
        credit: n(r.salesCredit),
        cancelled: n(r.cancelled),
      },
      returns: { count: n(r.returnsCount), total: n(r.returnsTotal), cash: n(r.returnsCash) },
      manualIn: n(r.manualIn),
      manualOut: n(r.manualOut),
      expenses: n(r.expenses),
      debtPaymentsCash: n(r.debtCash),
      debtPaymentsBank: n(r.debtBank),
      supplierPayments: n(r.supplierCash),
      expectedBalance: r.status === 'open' ? n(r.cashBalance) : moneyFromDb(r.expectedBalance ?? 0n),
    }
  }
}

function toShiftDto(s: ShiftRecord, cashierName: string | null): ShiftDto {
  return {
    id: s.id,
    status: s.status,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    openingBalance: moneyFromDb(s.openingBalance),
    cashIn: moneyFromDb(s.cashIn),
    cashOut: moneyFromDb(s.cashOut),
    expectedBalance: s.expectedBalance === null ? null : moneyFromDb(s.expectedBalance),
    countedBalance: s.countedBalance === null ? null : moneyFromDb(s.countedBalance),
    difference: s.difference === null ? null : moneyFromDb(s.difference),
    note: s.note,
    userId: s.userId,
    cashierName,
  }
}

/** Kupyuralar: qiymat va soni butun musbat, yig'indi sanalgan summaga teng */
function assertDenominations(dto: CloseShiftDto): void {
  if (!dto.denominations) return
  let sum = 0
  for (const [value, count] of Object.entries(dto.denominations)) {
    const face = Number(value)
    if (!Number.isSafeInteger(face) || face <= 0 || !Number.isSafeInteger(count) || count < 0) {
      throw new DomainError('VALIDATION_FAILED', `Kupyura noto‘g‘ri: ${value} × ${count}`, [
        { field: 'denominations', code: 'VALIDATION_FAILED' },
      ])
    }
    sum += face * count
  }
  if (sum !== dto.countedBalance) {
    throw new DomainError('VALIDATION_FAILED', `Kupyuralar yig‘indisi ${sum}, sanalgan ${dto.countedBalance}`, [
      { field: 'denominations', code: 'VALIDATION_FAILED', meta: { sum, counted: dto.countedBalance } },
    ])
  }
}

/** Baza qisman noyob indeksi (I8) — registr qulfini chetlab o'tgan poyga uchun oxirgi to'siq */
function rethrowOpenShift(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new DomainError('SHIFT_ALREADY_OPEN', 'Smena allaqachon ochiq')
  }
  throw err
}
