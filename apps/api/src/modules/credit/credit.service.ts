import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { evaluateCredit } from '@crm/shared'
import { moneyFromDb } from '@/common/crud/convert'
import { DomainError } from '@/common/errors/domain.error'
import { businessDate } from '@/common/time'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'

/** Mijozning bonus va nasiya holati */
export interface CustomerPosition {
  id: string
  bonusPoints: number
  /** Nasiya limiti; 0 — cheklanmagan (I16) */
  limit: number
  /** Joriy qarz — bekor qilinmagan nasiya cheklar bo'yicha */
  current: number
  /** Muddati o'tgan qarz */
  overdue: number
  paymentTermDays?: number
}

/**
 * Nasiya limiti servisi (T-066, I16). Qoida — `packages/shared` dagi
 * `evaluateCredit` (frontend bilan AYNI); qarz yig'indilari bazada.
 *
 * `position` kassa registri qulfidan KEYIN chaqiriladi (Q33): parallel
 * nasiyalar bir-birining qarzini ko'radi va limitni birga oshirmaydi.
 */
@Injectable()
export class CreditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bonus, limit va qarz — bitta so'rov (`sales_open_debt` indeksi). Yo'q mijoz — 422 */
  async position(customerId: string): Promise<CustomerPosition> {
    const { tenantId } = requireTenantTx()
    const [row] = await this.prisma.scoped.$queryRaw<
      {
        bonusPoints: bigint
        creditLimit: bigint | null
        paymentTermDays: number | null
        current: Prisma.Decimal
        overdue: Prisma.Decimal
      }[]
    >`
      SELECT c.bonus_points AS "bonusPoints", c.credit_limit AS "creditLimit",
             c.payment_term_days AS "paymentTermDays",
             COALESCE(SUM(s.outstanding), 0) AS current,
             COALESCE(SUM(s.outstanding) FILTER (WHERE s.due_date < ${businessDate()}::date), 0) AS overdue
        FROM clients c
        LEFT JOIN sales s ON s.tenant_id = c.tenant_id AND s.customer_id = c.id
                         AND s.status = 'pending' AND s.type = 'sale' AND s.deleted_at IS NULL
       WHERE c.tenant_id = ${tenantId}::uuid AND c.id = ${customerId}::uuid AND c.deleted_at IS NULL
       GROUP BY c.id`
    if (!row) {
      throw new DomainError('REFERENCE_NOT_FOUND', 'Mijoz topilmadi', [{ field: 'customerId', code: 'REFERENCE_NOT_FOUND' }])
    }
    return {
      id: customerId,
      bonusPoints: moneyFromDb(row.bonusPoints),
      limit: row.creditLimit === null ? 0 : moneyFromDb(row.creditLimit),
      current: row.current.toNumber(),
      overdue: row.overdue.toNumber(),
      paymentTermDays: row.paymentTermDays ?? undefined,
    }
  }
}

/**
 * Yangi nasiya (`extra`) mumkinmi: mijoz shart (I15), muddati o'tgan qarz
 * yo'q va limit oshmaydi (I16). Xato — aniq raqamlar bilan.
 */
export function assertCreditAllowed(customer: CustomerPosition | undefined, extra: number): void {
  if (extra <= 0) return
  if (!customer) {
    throw new DomainError('CREDIT_REQUIRES_CUSTOMER', 'Nasiya uchun mijozni tanlang', [
      { field: 'customerId', code: 'CREDIT_REQUIRES_CUSTOMER' },
    ])
  }
  const check = evaluateCredit(customer, extra)
  if (check.ok) return
  if (check.reason === 'overdue') {
    throw new DomainError('CREDIT_OVERDUE', `Mijozning muddati o‘tgan qarzi bor: ${check.overdue} so‘m`, [
      { field: 'customerId', code: 'CREDIT_OVERDUE', meta: { overdue: check.overdue } },
    ])
  }
  throw new DomainError('CREDIT_LIMIT_EXCEEDED', `Nasiya limiti ${check.limit} so‘m, joriy qarz ${check.current} so‘m`, [
    { field: 'customerId', code: 'CREDIT_LIMIT_EXCEEDED', meta: { limit: check.limit, current: check.current, extra: check.extra } },
  ])
}
