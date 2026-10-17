import { Injectable } from '@nestjs/common'
import { Prisma, type PayrollEntryType } from '@prisma/client'
import { hasPermission, isPayrollPayment, monthPeriod, type Permission } from '@crm/shared'
import { currentContext } from '@/common/context/request-context'
import { dateFromDb, dateToDb, moneyFromDb } from '@/common/crud/convert'
import { pageArgs, toPaged, type Paged } from '@/common/crud/paging'
import { withCtes } from '@/common/db/sql'
import { NotFoundError, PermissionDeniedError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import { CashRegisterService, type RegisterState } from '@/modules/cash/cash-register.service'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import type {
  CreateAccrualDto, CreatePaymentDto, PayrollEntryDto, PayrollEntryQueryDto, PayrollSheetDto, PayrollSheetQueryDto,
  PayrollSheetRowDto, PayrollSheetTotalsDto,
} from './dto/payroll.dto'

const RESOURCE = 'Maosh yozuvi'
const EMPLOYEE = 'Xodim'

export const PAYROLL_ENTRY_SELECT = {
  id: true,
  employeeId: true,
  type: true,
  amount: true,
  date: true,
  method: true,
  shiftId: true,
  auto: true,
  baseAmount: true,
  rate: true,
  note: true,
  userId: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.PayrollEntrySelect

type EntryRecord = Prisma.PayrollEntryGetPayload<{ select: typeof PAYROLL_ENTRY_SELECT }>

/** Varaq qatori bazadan: summalar `float8` (so'm butun — aniq) */
type SheetRow = Omit<PayrollSheetRowDto, 'payrollFrom' | 'earned' | 'paid' | 'closing'> & { payrollFrom: Date }

const SHEET_SUMS = ['opening', 'accruedSalary', 'bonus', 'award', 'penalty', 'earned', 'advance', 'payment', 'paid', 'closing'] as const

/** Naqd to'lovning kassaga ta'siri: chiqim; bank — ta'sirsiz (I9) */
const cashEffect = (entry: Pick<EntryRecord, 'method' | 'amount'>): bigint => (entry.method === 'cash' ? -entry.amount : 0n)

/**
 * Maosh hisobi (T-142): xodim varag'i yozuvlari — hisoblash (ishlab
 * topilganiga) va to'lov (kassadan yoki bankdan). Naqd to'lov kassadan
 * chiqadi — ochiq smena shart (I8); o'chirish va tiklash kassani to'g'ri
 * holatda qoldiradi. Mavjud yozuvni o'zgartiruvchi amal registr qulfini
 * BIRINCHI oladi (Q33), keyin yozuvni — xarajatlar bilan bir xil tartib.
 * Yozuv tahrirlanmaydi: o'chirib, qaytadan yoziladi (summa va sana
 * jurnalda ko'rinib turadi).
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly register: CashRegisterService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PayrollEntryQueryDto): Promise<Paged<PayrollEntryDto>> {
    const where: Prisma.PayrollEntryWhereInput = {
      ...(!query.withDeleted && { deletedAt: null }),
      ...(query.employeeId && { employeeId: query.employeeId }),
      ...(query.type && { type: query.type }),
      ...((query.dateFrom || query.dateTo) && {
        date: {
          ...(query.dateFrom && { gte: dateToDb(query.dateFrom) }),
          ...(query.dateTo && { lte: dateToDb(query.dateTo) }),
        },
      }),
      ...(query.q && { note: { contains: query.q, mode: 'insensitive' } }),
    }
    const [rows, total] = await Promise.all([
      this.prisma.scoped.payrollEntry.findMany({
        where,
        select: PAYROLL_ENTRY_SELECT,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.scoped.payrollEntry.count({ where }),
    ])
    return toPaged(rows.map(toEntryDto), total, query)
  }

  /**
   * Oylik varaq (vedomost) — bitta so'rov: har xodim uchun davr boshidagi
   * qoldiq (oldingi yozuvlar yig'indisi), davr yozuvlari tur bo'yicha va
   * avtomatik hisoblash bo'lgani. Bo'shatilgan xodim faqat davrda yozuvi
   * yoki qoldig'i bo'lsa ko'rinadi.
   */
  async sheet(query: PayrollSheetQueryDto): Promise<PayrollSheetDto> {
    const { tenantId } = requireTenantTx()
    const period = monthPeriod(query.period ?? businessDate().slice(0, 7))
    const rows = await this.prisma.scoped.$queryRaw<SheetRow[]>`
      WITH x AS (
        SELECT employee_id, type, amount, date, auto,
               CASE WHEN type IN ('penalty', 'advance', 'payment') THEN -amount ELSE amount END AS signed
          FROM payroll_entries
         WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL AND date <= ${period.end}::date)
      SELECT e.id AS "employeeId", e.name, e.position, e.status, e.salary::float8 AS salary,
             e.salary_day AS "salaryDay", e.sales_bonus_pct::float8 AS "salesBonusPct", e.payroll_from AS "payrollFrom",
             COALESCE(SUM(x.signed) FILTER (WHERE x.date < ${period.start}::date), 0)::float8 AS opening,
             COALESCE(SUM(x.amount) FILTER (WHERE x.date >= ${period.start}::date AND x.type = 'salary'), 0)::float8 AS "accruedSalary",
             COALESCE(SUM(x.amount) FILTER (WHERE x.date >= ${period.start}::date AND x.type = 'bonus'), 0)::float8 AS bonus,
             COALESCE(SUM(x.amount) FILTER (WHERE x.date >= ${period.start}::date AND x.type = 'award'), 0)::float8 AS award,
             COALESCE(SUM(x.amount) FILTER (WHERE x.date >= ${period.start}::date AND x.type = 'penalty'), 0)::float8 AS penalty,
             COALESCE(SUM(x.amount) FILTER (WHERE x.date >= ${period.start}::date AND x.type = 'advance'), 0)::float8 AS advance,
             COALESCE(SUM(x.amount) FILTER (WHERE x.date >= ${period.start}::date AND x.type = 'payment'), 0)::float8 AS payment,
             COALESCE(BOOL_OR(x.auto AND x.date >= ${period.start}::date), false) AS accrued
        FROM employees e
        LEFT JOIN x ON x.employee_id = e.id
       WHERE e.tenant_id = ${tenantId}::uuid AND e.deleted_at IS NULL
       GROUP BY e.id
      HAVING e.status <> 'fired'
          OR COUNT(x.amount) FILTER (WHERE x.date >= ${period.start}::date) > 0
          OR COALESCE(SUM(x.signed), 0) <> 0
       ORDER BY e.name, e.id`
    const sheetRows = rows.map(toSheetRow)
    return { period: period.key, start: period.start, end: period.end, rows: sheetRows, totals: sumRows(sheetRows) }
  }

  /** Hisoblash — ishlab topilganiga (kassaga ta'sirsiz) */
  async accrue(dto: CreateAccrualDto): Promise<PayrollEntryDto> {
    await this.assertEmployee(dto.employeeId)
    const row = await this.prisma.scoped.payrollEntry.create({
      data: {
        tenantId: requireTenantTx().tenantId,
        employeeId: dto.employeeId,
        type: dto.type,
        amount: BigInt(dto.amount),
        date: dateToDb(dto.date ?? businessDate()),
        note: dto.note ?? null,
        userId: currentContext().userId ?? null,
      },
      select: PAYROLL_ENTRY_SELECT,
    })
    await this.audit.log({
      action: 'payroll.accrual',
      entityType: 'payroll-entry',
      entityId: row.id,
      diff: { employeeId: dto.employeeId, type: dto.type, amount: dto.amount, date: dateFromDb(row.date) },
    })
    return toEntryDto(row)
  }

  /** To'lov: naqd — kassadan chiqadi (ochiq smena shart), bank — kassaga ta'sirsiz */
  async pay(dto: CreatePaymentDto): Promise<PayrollEntryDto> {
    const { tenantId } = requireTenantTx()
    await this.assertEmployee(dto.employeeId)
    const amount = BigInt(dto.amount)
    const delta = cashEffect({ method: dto.method, amount })
    // Bank to'lovi kassani (registrni) kutmaydi
    const shiftId = delta === 0n ? null : this.shiftFor(await this.register.lock(), delta)
    const id = uuidv7()
    await this.prisma.scoped.$executeRaw(
      withCtes(
        [
          Prisma.sql`entry AS (
            INSERT INTO payroll_entries (id, tenant_id, employee_id, type, amount, date, method, shift_id, note, user_id)
            VALUES (${id}::uuid, ${tenantId}::uuid, ${dto.employeeId}::uuid, ${dto.type}::"PayrollEntryType", ${amount},
                    ${dto.date ?? businessDate()}::date, ${dto.method}::"PayMethod", ${shiftId}::uuid, ${dto.note ?? null},
                    ${currentContext().userId ?? null}::uuid)
            RETURNING 1)`,
          ...this.cash(shiftId, delta),
        ],
        Prisma.sql`SELECT 1`,
      ),
    )
    await this.audit.log({
      action: 'payroll.payment',
      entityType: 'payroll-entry',
      entityId: id,
      diff: { employeeId: dto.employeeId, type: dto.type, amount: dto.amount, method: dto.method },
    })
    return this.get(id)
  }

  /** Yumshoq o'chirish: naqd to'lov puli kassaga qaytadi */
  async remove(id: string): Promise<void> {
    const register = await this.register.lock()
    const before = await this.lockEntry(id)
    if (before.deletedAt) throw new NotFoundError(RESOURCE, id)
    assertKindAllowed(before.type)
    const delta = -cashEffect(before)
    await this.write(id, delta, this.shiftFor(register, delta), Prisma.sql`deleted_at = now()`)
    await this.audit.log({
      action: 'payroll.delete',
      entityType: 'payroll-entry',
      entityId: id,
      diff: { employeeId: before.employeeId, type: before.type, amount: moneyFromDb(before.amount), method: before.method },
    })
  }

  /** Tiklash (undo): naqd to'lov yana kassadan chiqadi — joriy smenaga */
  async restore(id: string): Promise<PayrollEntryDto> {
    const register = await this.register.lock()
    const before = await this.lockEntry(id)
    if (!before.deletedAt) return toEntryDto(before)
    assertKindAllowed(before.type)
    const delta = cashEffect(before)
    const shiftId = this.shiftFor(register, delta)
    await this.write(id, delta, shiftId, Prisma.sql`deleted_at = NULL, shift_id = COALESCE(${shiftId}::uuid, shift_id)`)
    await this.audit.log({ action: 'payroll.restore', entityType: 'payroll-entry', entityId: id })
    return this.get(id)
  }

  private async get(id: string): Promise<PayrollEntryDto> {
    const row = await this.prisma.scoped.payrollEntry.findFirst({ where: { id }, select: PAYROLL_ENTRY_SELECT })
    if (!row) throw new NotFoundError(RESOURCE, id)
    return toEntryDto(row)
  }

  /** Bo'shatilgan xodimga ham yoziladi (hisob-kitobni yakunlash), o'chirilganiga — yo'q */
  private async assertEmployee(id: string): Promise<void> {
    const row = await this.prisma.scoped.employee.findFirst({ where: { id, deletedAt: null }, select: { id: true } })
    if (!row) throw new NotFoundError(EMPLOYEE, id)
  }

  /** Naqd ta'siri bo'lsa — ochiq smena shart (I8); bo'lmasa smena kerak emas */
  private shiftFor(register: RegisterState, delta: bigint): string | null {
    return delta === 0n ? null : this.register.requireOpenShift(register)
  }

  private cash(shiftId: string | null, delta: bigint): Prisma.Sql[] {
    return shiftId ? this.register.cashCtes(shiftId, delta) : []
  }

  /** Yozuv va kassa ta'siri — bitta so'rov */
  private async write(id: string, delta: bigint, shiftId: string | null, set: Prisma.Sql): Promise<void> {
    const { tenantId } = requireTenantTx()
    await this.prisma.scoped.$executeRaw(
      withCtes(
        [
          Prisma.sql`entry AS (
            UPDATE payroll_entries SET ${set}
             WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
            RETURNING 1)`,
          ...this.cash(shiftId, delta),
        ],
        Prisma.sql`SELECT 1`,
      ),
    )
  }

  /** Yozuv qulfi (registrdan KEYIN — Q33): parallel o'chirish kassa ta'sirini ikki marta qaytarmasin */
  private async lockEntry(id: string): Promise<EntryRecord> {
    const { tenantId } = requireTenantTx()
    const [row] = await this.prisma.scoped.$queryRaw<EntryRecord[]>`
      SELECT id, employee_id AS "employeeId", type, amount, date, method, shift_id AS "shiftId", auto,
             base_amount AS "baseAmount", rate, note, user_id AS "userId", created_at AS "createdAt", deleted_at AS "deletedAt"
        FROM payroll_entries
       WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
         FOR UPDATE`
    if (!row) throw new NotFoundError(RESOURCE, id)
    return row
  }
}

/** O'chirish/tiklash — yozuv turiga qarab: to'lov `payroll.pay`, hisoblash `payroll.accrue` */
function assertKindAllowed(type: PayrollEntryType): void {
  const action = isPayrollPayment(type) ? 'pay' : 'accrue'
  const permissions = currentContext().permissions ?? new Set<Permission>()
  if (!hasPermission(permissions, 'payroll', action)) {
    throw new PermissionDeniedError(`Bu yozuv uchun \`payroll.${action}\` ruxsati kerak`)
  }
}

export function toEntryDto(r: EntryRecord): PayrollEntryDto {
  const date = dateFromDb(r.date)
  return {
    id: r.id,
    employeeId: r.employeeId,
    type: r.type,
    amount: moneyFromDb(r.amount),
    date,
    period: date.slice(0, 7),
    method: r.method,
    shiftId: r.shiftId,
    auto: r.auto,
    baseAmount: r.baseAmount === null ? null : moneyFromDb(r.baseAmount),
    rate: r.rate === null ? null : r.rate.toNumber(),
    note: r.note,
    userId: r.userId,
    createdAt: r.createdAt,
    deletedAt: r.deletedAt,
  }
}

function toSheetRow(r: SheetRow): PayrollSheetRowDto {
  const earned = r.accruedSalary + r.bonus + r.award - r.penalty
  const paid = r.advance + r.payment
  return { ...r, payrollFrom: dateFromDb(r.payrollFrom), earned, paid, closing: r.opening + earned - paid }
}

function sumRows(rows: readonly PayrollSheetRowDto[]): PayrollSheetTotalsDto {
  const totals: PayrollSheetTotalsDto = {
    opening: 0, accruedSalary: 0, bonus: 0, award: 0, penalty: 0, earned: 0, advance: 0, payment: 0, paid: 0, closing: 0,
  }
  for (const row of rows) for (const k of SHEET_SUMS) totals[k] += row[k]
  return totals
}
