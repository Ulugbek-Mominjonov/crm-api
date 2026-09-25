import { Injectable } from '@nestjs/common'
import { Prisma, type SaleStatus, type SaleType } from '@prisma/client'
import { currentContext } from '@/common/context/request-context'
import { dateFromDb, moneyFromDb } from '@/common/crud/convert'
import { pageArgs, toPaged, type Paged } from '@/common/crud/paging'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { containsPattern, withCtes } from '@/common/db/sql'
import { DomainError } from '@/common/errors/domain.error'
import { uuidv7 } from '@/common/ids'
import { businessDate } from '@/common/time'
import { AuditService } from '@/modules/audit/audit.service'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { CashRegisterService } from '@/modules/cash/cash-register.service'
import { debtPaidCtes } from '@/modules/sales/sale.sql'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import type {
  AgingBucket, CustomerDebtDto, DebtPageDto, DebtPaymentDto, DebtPaymentInputDto, DebtPaymentQueryDto,
  DebtPaymentResultDto, DebtQueryDto, DebtReceiptDto,
} from './dto/debt.dto'

/** Eskirish chegaralari (kun) */
const AGING_DAYS = { d30: 30, d60: 60 } as const

interface LockedDebtSale {
  id: string
  number: string
  type: SaleType
  status: SaleStatus
  customerId: string | null
  debtPaid: bigint
  outstanding: bigint
}

interface CustomerDebtRow {
  customerId: string
  name: string
  phone: string
  creditLimit: bigint | null
  debt: Prisma.Decimal
  receipts: bigint
  oldestDate: Date
  oldestDue: Date | null
  totalRows: bigint
}

interface ReceiptRow {
  saleId: string
  number: string
  date: Date
  dueDate: Date | null
  total: bigint
  outstanding: bigint
  ageDays: number
  customerId: string | null
  name: string | null
  phone: string | null
  totalRows: bigint
}

const PAYMENT_SELECT = {
  id: true, saleId: true, customerId: true, amount: true, method: true, date: true, shiftId: true, userId: true,
  createdAt: true,
} satisfies Prisma.DebtPaymentSelect

/**
 * Qarzlar (T-064, T-065): nasiya chek to'lovi va qarzdorlar ro'yxati.
 * Qolgan qarz — bazaning `sales.outstanding` ustuni (I13), mijoz bo'yicha
 * — `client_balances` ko'rinishi (10 §10.6).
 */
@Injectable()
export class DebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly register: CashRegisterService,
    private readonly audit: AuditService,
    private readonly events: DomainEvents,
  ) {}

  /**
   * Qarz to'lovi: qarzdan oshmaydi (I14), to'liq to'langanda chek
   * `completed`, naqd — kassaga (ochiq smena, I8). Parallel ikki to'lov
   * registr qulfida ketma-ket — ikkinchisi yangilangan qarzni ko'radi.
   */
  async pay(dto: DebtPaymentInputDto): Promise<DebtPaymentResultDto> {
    const { tenantId } = requireTenantTx()
    const register = await this.register.lock()
    const sale = await this.lockSale(dto.saleId)
    const outstanding = moneyFromDb(sale.outstanding)
    if (dto.amount > outstanding) {
      throw new DomainError('PAYMENT_EXCEEDS_DEBT', `${sale.number}: qarz ${outstanding} so‘m, to‘lov ${dto.amount} so‘m`, [
        { field: 'amount', code: 'PAYMENT_EXCEEDS_DEBT', meta: { outstanding, requested: dto.amount } },
      ])
    }
    // Naqd — smena shart (I8); bank to'lovi ochiq smenaga faqat hisobot uchun bog'lanadi
    const shiftId = dto.method === 'cash' ? this.register.requireOpenShift(register) : register.activeShiftId
    const id = uuidv7()
    const date = businessDate()
    const userId = currentContext().userId ?? null

    const [row] = await this.prisma.scoped
      .$queryRaw<{ createdAt: Date }[]>(
        withCtes(
          [
            Prisma.sql`payment AS (
              INSERT INTO debt_payments (id, tenant_id, sale_id, customer_id, amount, method, date, user_id, shift_id)
              VALUES (${id}::uuid, ${tenantId}::uuid, ${sale.id}::uuid, ${sale.customerId}::uuid, ${dto.amount}::bigint,
                      ${dto.method}::"PayMethod", ${date}::date, ${userId}::uuid, ${shiftId}::uuid)
              RETURNING created_at)`,
            ...debtPaidCtes(tenantId, sale.id, dto.amount),
            ...(dto.method === 'cash' ? this.register.cashCtes(shiftId!, BigInt(dto.amount)) : []),
          ],
          Prisma.sql`SELECT created_at AS "createdAt" FROM payment`,
        ),
      )
      .catch((err: unknown) => rethrowAsDomain(err, { resource: 'Qarz to‘lovi' }))

    const left = outstanding - dto.amount
    await this.audit.log({
      action: 'debt.pay',
      entityType: 'sale',
      entityId: sale.id,
      diff: { number: sale.number, amount: dto.amount, method: dto.method, outstanding: left },
    })
    this.events.publish('debt.paid', { saleId: sale.id, customerId: sale.customerId })
    return {
      payment: {
        id, saleId: sale.id, customerId: sale.customerId, amount: dto.amount, method: dto.method, date, shiftId, userId,
        createdAt: row!.createdAt,
      },
      sale: {
        id: sale.id,
        number: sale.number,
        status: left > 0 ? 'pending' : 'completed',
        debtPaid: moneyFromDb(sale.debtPaid) + dto.amount,
        outstanding: left,
      },
    }
  }

  /**
   * Qarzdorlar: `customers` — mijoz bo'yicha guruhlangan (`client_balances`),
   * `receipts` — qarzli cheklar. Ro'yxat + jami: 2 so'rov.
   */
  async list(query: DebtQueryDto): Promise<DebtPageDto> {
    const { tenantId } = requireTenantTx()
    const today = businessDate()
    const { skip, take } = pageArgs(query)
    const [items, total] = query.view === 'receipts'
      ? await this.receipts(tenantId, today, query, skip, take)
      : await this.customers(tenantId, today, query, skip, take)

    const [summary] = await this.prisma.scoped.$queryRaw<
      { debt: Prisma.Decimal; overdue: Prisma.Decimal; customers: bigint; oldest: Date | null }[]
    >`
      SELECT COALESCE(SUM(outstanding), 0) AS debt,
             COALESCE(SUM(outstanding) FILTER (WHERE due_date < ${today}::date), 0) AS overdue,
             COUNT(DISTINCT customer_id) AS customers,
             MIN(date) AS oldest
        FROM sales
       WHERE tenant_id = ${tenantId}::uuid AND status = 'pending' AND type = 'sale' AND deleted_at IS NULL
         ${query.customerId ? Prisma.sql`AND customer_id = ${query.customerId}::uuid` : Prisma.empty}`
    return {
      ...toPaged<CustomerDebtDto | DebtReceiptDto>(items, total, query),
      summary: {
        debt: summary!.debt.toNumber(),
        overdue: summary!.overdue.toNumber(),
        customers: Number(summary!.customers),
        oldestDate: summary!.oldest ? dateFromDb(summary!.oldest) : null,
      },
    }
  }

  async payments(query: DebtPaymentQueryDto): Promise<Paged<DebtPaymentDto>> {
    const where: Prisma.DebtPaymentWhereInput = {
      ...(query.saleId && { saleId: query.saleId }),
      ...(query.customerId && { customerId: query.customerId }),
    }
    const [rows, total] = await Promise.all([
      this.prisma.scoped.debtPayment.findMany({
        where,
        select: PAYMENT_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.prisma.scoped.debtPayment.count({ where }),
    ])
    return toPaged(
      rows.map((r) => ({ ...r, amount: moneyFromDb(r.amount), date: dateFromDb(r.date) })),
      total,
      query,
    )
  }

  private async customers(
    tenantId: string,
    today: string,
    query: DebtQueryDto,
    skip: number,
    take: number,
  ): Promise<[CustomerDebtDto[], number]> {
    const rows = await this.prisma.scoped.$queryRaw<CustomerDebtRow[]>`
      SELECT b.customer_id AS "customerId", c.name, c.phone, c.credit_limit AS "creditLimit", b.debt,
             b.receipts, b.oldest_date AS "oldestDate", b.oldest_due AS "oldestDue", COUNT(*) OVER () AS "totalRows"
        FROM client_balances b
        JOIN clients c ON c.tenant_id = b.tenant_id AND c.id = b.customer_id
       WHERE b.tenant_id = ${tenantId}::uuid
         ${query.customerId ? Prisma.sql`AND b.customer_id = ${query.customerId}::uuid` : Prisma.empty}
         ${query.overdue ? Prisma.sql`AND b.oldest_due < ${today}::date` : Prisma.empty}
         ${query.aging ? agingSql(Prisma.sql`b.oldest_date`, query.aging, today) : Prisma.empty}
         ${query.q ? Prisma.sql`AND (c.name ILIKE ${containsPattern(query.q)} OR c.phone LIKE ${containsPattern(query.q)})` : Prisma.empty}
       ORDER BY b.debt DESC, b.customer_id
       LIMIT ${take} OFFSET ${skip}`
    return [
      rows.map((r) => ({
        customer: { id: r.customerId, name: r.name, phone: r.phone },
        debt: r.debt.toNumber(),
        receipts: Number(r.receipts),
        oldestDate: dateFromDb(r.oldestDate),
        oldestDue: r.oldestDue ? dateFromDb(r.oldestDue) : null,
        overdue: r.oldestDue !== null && dateFromDb(r.oldestDue) < today,
        creditLimit: r.creditLimit === null ? null : moneyFromDb(r.creditLimit),
      })),
      rows.length > 0 ? Number(rows[0]!.totalRows) : 0,
    ]
  }

  private async receipts(
    tenantId: string,
    today: string,
    query: DebtQueryDto,
    skip: number,
    take: number,
  ): Promise<[DebtReceiptDto[], number]> {
    const rows = await this.prisma.scoped.$queryRaw<ReceiptRow[]>`
      SELECT s.id AS "saleId", s.number, s.date, s.due_date AS "dueDate", s.total, s.outstanding,
             (${today}::date - s.date) AS "ageDays", c.id AS "customerId", c.name, c.phone,
             COUNT(*) OVER () AS "totalRows"
        FROM sales s
        LEFT JOIN clients c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
       WHERE s.tenant_id = ${tenantId}::uuid AND s.status = 'pending' AND s.type = 'sale' AND s.deleted_at IS NULL
         ${query.customerId ? Prisma.sql`AND s.customer_id = ${query.customerId}::uuid` : Prisma.empty}
         ${query.overdue ? Prisma.sql`AND s.due_date < ${today}::date` : Prisma.empty}
         ${query.aging ? agingSql(Prisma.sql`s.date`, query.aging, today) : Prisma.empty}
         ${query.q ? Prisma.sql`AND (s.number ILIKE ${containsPattern(query.q)} OR c.name ILIKE ${containsPattern(query.q)})` : Prisma.empty}
       ORDER BY s.date ASC, s.id
       LIMIT ${take} OFFSET ${skip}`
    return [
      rows.map((r) => ({
        saleId: r.saleId,
        number: r.number,
        customer: r.customerId ? { id: r.customerId, name: r.name!, phone: r.phone! } : null,
        date: dateFromDb(r.date),
        dueDate: r.dueDate ? dateFromDb(r.dueDate) : null,
        total: moneyFromDb(r.total),
        outstanding: moneyFromDb(r.outstanding),
        ageDays: Number(r.ageDays),
        overdue: r.dueDate !== null && dateFromDb(r.dueDate) < today,
      })),
      rows.length > 0 ? Number(rows[0]!.totalRows) : 0,
    ]
  }

  /** Chek qulfi (registrdan keyin, Q33). Tanadagi havola — yo'q bo'lsa 422 */
  private async lockSale(saleId: string): Promise<LockedDebtSale> {
    const { tenantId } = requireTenantTx()
    const [sale] = await this.prisma.scoped.$queryRaw<LockedDebtSale[]>`
      SELECT id, number, type, status, customer_id AS "customerId", debt_paid AS "debtPaid", outstanding
        FROM sales
       WHERE tenant_id = ${tenantId}::uuid AND id = ${saleId}::uuid AND deleted_at IS NULL
         FOR UPDATE`
    if (!sale) {
      throw new DomainError('REFERENCE_NOT_FOUND', 'Chek topilmadi', [{ field: 'saleId', code: 'REFERENCE_NOT_FOUND' }])
    }
    return sale
  }
}

/** Eskirish oralig'i: sana ustuni `column` bugundan necha kun oldin */
function agingSql(column: Prisma.Sql, bucket: AgingBucket, today: string): Prisma.Sql {
  const t = Prisma.sql`${today}::date`
  switch (bucket) {
    case 'd30':
      return Prisma.sql`AND ${column} >= ${t} - ${AGING_DAYS.d30}::int`
    case 'd60':
      return Prisma.sql`AND ${column} < ${t} - ${AGING_DAYS.d30}::int AND ${column} >= ${t} - ${AGING_DAYS.d60}::int`
    case 'd60plus':
      return Prisma.sql`AND ${column} < ${t} - ${AGING_DAYS.d60}::int`
  }
}
