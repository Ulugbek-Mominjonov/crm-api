import { Injectable } from '@nestjs/common'
import { Prisma, type PayMethod } from '@prisma/client'
import { currentContext } from '@/common/context/request-context'
import { dateFromDb, dateToDb, moneyFromDb } from '@/common/crud/convert'
import { pageArgs, toPaged, type Paged } from '@/common/crud/paging'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { withCtes } from '@/common/db/sql'
import { NotFoundError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import { CashRegisterService, type RegisterState } from '@/modules/cash/cash-register.service'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import type {
  CreateExpenseDto, ExpenseDto, ExpenseQueryDto, ExpenseSummaryDto, UpdateExpenseDto,
} from './dto/expense.dto'

const RESOURCE = 'Xarajat'

export const EXPENSE_SELECT = {
  id: true,
  category: true,
  amount: true,
  method: true,
  date: true,
  note: true,
  userId: true,
  shiftId: true,
  templateId: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.ExpenseSelect

type ExpenseRecord = Prisma.ExpenseGetPayload<{ select: typeof EXPENSE_SELECT }>

/** Ro'yxat va xulosa filtri — bitta joyda */
function expenseWhere(query: ExpenseQueryDto): Prisma.ExpenseWhereInput {
  return {
    ...(!query.withDeleted && { deletedAt: null }),
    ...(query.category && { category: query.category }),
    ...(query.method && { method: query.method }),
    ...((query.dateFrom || query.dateTo) && {
      date: {
        ...(query.dateFrom && { gte: dateToDb(query.dateFrom) }),
        ...(query.dateTo && { lte: dateToDb(query.dateTo) }),
      },
    }),
    ...(query.q && { note: { contains: query.q, mode: 'insensitive' } }),
  }
}

/** Xarajatning kassaga ta'siri: naqd — chiqim, bank — ta'sirsiz (I9) */
const cashEffect = (method: PayMethod, amount: bigint): bigint => (method === 'cash' ? -amount : 0n)

/**
 * Xarajatlar (T-062). Naqd xarajat kassadan chiqadi — ochiq smena shart
 * (I8). Tahrirda eski ta'sir qaytarilib yangisi qo'llanadi (farqi joriy
 * smenaga), o'chirish va tiklash ham kassani to'g'ri holatda qoldiradi.
 * Mavjud xarajatni o'zgartiruvchi amal kassa registri qulfini BIRINCHI
 * oladi (Q33) — ta'sir naqdmi yoki yo'qmi, qator o'qilgandan keyin ma'lum.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly register: CashRegisterService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ExpenseQueryDto): Promise<Paged<ExpenseDto>> {
    const where = expenseWhere(query)
    const [rows, total] = await Promise.all([
      this.prisma.scoped.expense.findMany({
        where,
        select: EXPENSE_SELECT,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.scoped.expense.count({ where }),
    ])
    return toPaged(rows.map(toExpenseDto), total, query)
  }

  /**
   * Sahifa kartalari: bugun/oy/jami — filtrsiz (bitta agregat), kategoriya
   * taqsimoti — ro'yxat filtri bilan (`(tenant_id, category, date)` indeksi).
   */
  async summary(query: ExpenseQueryDto): Promise<ExpenseSummaryDto> {
    const { tenantId } = requireTenantTx()
    const today = businessDate()
    const [[totals], byCategory] = await Promise.all([
      this.prisma.scoped.$queryRaw<{ today: Prisma.Decimal; month: Prisma.Decimal; total: Prisma.Decimal }[]>`
        SELECT COALESCE(SUM(amount) FILTER (WHERE date = ${today}::date), 0) AS today,
               COALESCE(SUM(amount) FILTER (WHERE date >= ${`${today.slice(0, 7)}-01`}::date), 0) AS month,
               COALESCE(SUM(amount), 0) AS total
          FROM expenses
         WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL`,
      this.prisma.scoped.expense.groupBy({
        by: ['category'],
        where: expenseWhere({ ...query, withDeleted: false }),
        _sum: { amount: true },
      }),
    ])
    return {
      today: totals!.today.toNumber(),
      month: totals!.month.toNumber(),
      total: totals!.total.toNumber(),
      byCategory: byCategory
        .map((c) => ({ category: c.category, amount: moneyFromDb(c._sum.amount ?? 0n) }))
        .sort((x, y) => y.amount - x.amount),
    }
  }

  async get(id: string): Promise<ExpenseDto> {
    const row = await this.prisma.scoped.expense.findFirst({ where: { id, deletedAt: null }, select: EXPENSE_SELECT })
    if (!row) throw new NotFoundError(RESOURCE, id)
    return toExpenseDto(row)
  }

  async create(dto: CreateExpenseDto): Promise<ExpenseDto> {
    const { tenantId } = requireTenantTx()
    const amount = BigInt(dto.amount)
    const delta = cashEffect(dto.method, amount)
    // Bank xarajati kassani (registrni) kutmaydi
    const shiftId = delta === 0n ? null : this.shiftFor(await this.register.lock(), delta)
    // id ilovada: `@default(uuid(7))` Prisma mijozida yaratiladi, bazada sukut yo'q
    const id = uuidv7()
    await this.prisma.scoped.$executeRaw(
      withCtes(
        [
          Prisma.sql`expense AS (
            INSERT INTO expenses (id, tenant_id, category, amount, method, date, note, user_id, shift_id)
            VALUES (${id}::uuid, ${tenantId}::uuid, ${dto.category}::"ExpenseCategory", ${amount},
                    ${dto.method}::"PayMethod", ${dto.date ?? businessDate()}::date, ${dto.note ?? null},
                    ${currentContext().userId ?? null}::uuid, ${shiftId}::uuid)
            RETURNING 1)`,
          ...this.cash(shiftId, delta),
        ],
        Prisma.sql`SELECT 1`,
      ),
    )
    await this.audit.log({
      action: 'expense.create',
      entityType: 'expense',
      entityId: id,
      diff: { category: dto.category, amount: dto.amount, method: dto.method },
    })
    return this.get(id)
  }

  /** Eski naqd ta'siri qaytariladi, yangisi qo'llanadi — farqi joriy smenaga */
  async update(id: string, dto: UpdateExpenseDto): Promise<ExpenseDto> {
    const register = await this.register.lock()
    const before = await this.lockExpense(id)
    if (before.deletedAt) throw new NotFoundError(RESOURCE, id)
    const method = dto.method ?? before.method
    const amount = dto.amount === undefined ? before.amount : BigInt(dto.amount)
    const delta = cashEffect(method, amount) - cashEffect(before.method, before.amount)
    const shiftId = this.shiftFor(register, delta)

    await this.write(id, delta, shiftId, Prisma.sql`
      category = ${dto.category ?? before.category}::"ExpenseCategory", amount = ${amount},
      method = ${method}::"PayMethod", date = ${dto.date ?? dateFromDb(before.date)}::date,
      note = ${dto.note === undefined ? before.note : dto.note},
      shift_id = ${method === 'cash' ? (shiftId ?? before.shiftId) : null}::uuid`)
    await this.audit.log({
      action: 'expense.update',
      entityType: 'expense',
      entityId: id,
      diff: {
        before: { amount: moneyFromDb(before.amount), method: before.method },
        after: { amount: moneyFromDb(amount), method },
      },
    })
    return this.get(id)
  }

  /** Yumshoq o'chirish: naqd xarajat puli kassaga qaytadi */
  async remove(id: string): Promise<void> {
    const register = await this.register.lock()
    const before = await this.lockExpense(id)
    if (before.deletedAt) throw new NotFoundError(RESOURCE, id)
    const delta = -cashEffect(before.method, before.amount)
    await this.write(id, delta, this.shiftFor(register, delta), Prisma.sql`deleted_at = now()`)
    await this.audit.log({
      action: 'expense.delete',
      entityType: 'expense',
      entityId: id,
      diff: { amount: moneyFromDb(before.amount), method: before.method },
    })
  }

  /** Tiklash (undo): naqd xarajat yana kassadan chiqadi */
  async restore(id: string): Promise<ExpenseDto> {
    const register = await this.register.lock()
    const before = await this.lockExpense(id)
    if (!before.deletedAt) return toExpenseDto(before)
    const delta = cashEffect(before.method, before.amount)
    const shiftId = this.shiftFor(register, delta)
    await this.write(id, delta, shiftId, Prisma.sql`deleted_at = NULL, shift_id = COALESCE(${shiftId}::uuid, shift_id)`)
    await this.audit.log({ action: 'expense.restore', entityType: 'expense', entityId: id })
    return this.get(id)
  }

  /** Naqd ta'siri bo'lsa — ochiq smena shart (I8); bo'lmasa smena kerak emas */
  private shiftFor(register: RegisterState, delta: bigint): string | null {
    return delta === 0n ? null : this.register.requireOpenShift(register)
  }

  private cash(shiftId: string | null, delta: bigint): Prisma.Sql[] {
    return shiftId ? this.register.cashCtes(shiftId, delta) : []
  }

  /** Xarajat qatori va kassa ta'siri — bitta so'rov */
  private async write(id: string, delta: bigint, shiftId: string | null, set: Prisma.Sql): Promise<void> {
    const { tenantId } = requireTenantTx()
    await this.prisma.scoped
      .$executeRaw(
        withCtes(
          [
            Prisma.sql`expense AS (
              UPDATE expenses SET ${set}
               WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
              RETURNING 1)`,
            ...this.cash(shiftId, delta),
          ],
          Prisma.sql`SELECT 1`,
        ),
      )
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE, id }))
  }

  /**
   * Xarajat qulfi (registrdan KEYIN — Q33 tartibi): parallel tahrir kassa
   * ta'sirini ikki marta qaytarmasin
   */
  private async lockExpense(id: string): Promise<ExpenseRecord> {
    const { tenantId } = requireTenantTx()
    const [row] = await this.prisma.scoped.$queryRaw<ExpenseRecord[]>`
      SELECT id, category, amount, method, date, note, user_id AS "userId", shift_id AS "shiftId",
             template_id AS "templateId", created_at AS "createdAt", deleted_at AS "deletedAt"
        FROM expenses
       WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
         FOR UPDATE`
    if (!row) throw new NotFoundError(RESOURCE, id)
    return row
  }
}

export function toExpenseDto(r: ExpenseRecord): ExpenseDto {
  return {
    id: r.id,
    category: r.category,
    amount: moneyFromDb(r.amount),
    method: r.method,
    date: dateFromDb(r.date),
    note: r.note,
    userId: r.userId,
    shiftId: r.shiftId,
    templateId: r.templateId,
    createdAt: r.createdAt,
    deletedAt: r.deletedAt,
  }
}
