import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { alertCritical } from '@/common/monitoring/monitoring'
import { BUSINESS_TIME_ZONE } from '@/common/time'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'

/** Har tekshiruvdan ko'pi bilan shuncha misol — hisobot va log o'lchami chegaralansin */
const SAMPLE_LIMIT = 20

export interface Violation {
  tenantId: string
  check: string
  entityId: string | null
  cached: string
  actual: string
}

export interface InvariantReport {
  tenants: number
  violations: Violation[]
  /** Tekshirib bo'lmagan tenantlar (so'rov xatosi) */
  failed: string[]
}

type Row = Omit<Violation, 'tenantId'>

/**
 * Tunlik invariant tekshiruvi (T-123, 10 §10.2, 08 §8.6): har
 * denormalizatsiya noldan qayta hisoblanib, saqlangan qiymat bilan
 * solishtiriladi. Tuzatmaydi — farq `critical` log (Sentry) va hisobotga
 * tushadi, sababi topilishi kerak. Har tenant o'z tranzaksiyasida (RLS),
 * bitta so'rov bilan.
 */
@Injectable()
export class InvariantsService {
  private readonly logger = new Logger(InvariantsService.name)

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 4 * * *', { name: 'invariant-check', timeZone: BUSINESS_TIME_ZONE })
  async nightly(): Promise<void> {
    await this.checkAll()
  }

  async checkAll(): Promise<InvariantReport> {
    const violations: Violation[] = []
    let tenants = 0
    const failures = await this.prisma.forEachTenant(async (tx, tenantId) => {
      tenants += 1
      const rows = await this.check(tx, tenantId)
      violations.push(...rows.map((r) => ({ tenantId, ...r })))
    })
    const failed = failures.map((f) => f.tenantId)
    for (const f of failures) this.logger.error({ err: f.error, tenantId: f.tenantId }, 'Invariant tekshiruvi bajarilmadi')
    if (violations.length > 0) {
      this.logger.error({ severity: 'critical', count: violations.length, violations }, 'Invariantlar buzilgan')
      alertCritical('Invariantlar buzilgan', { count: violations.length, violations: violations.slice(0, 50) })
    } else {
      this.logger.log(`Invariantlar joyida: ${tenants} ta do‘kon`)
    }
    return { tenants, violations, failed }
  }

  /** Bitta tenant — bitta so'rov; har tekshiruv o'z misollarini beradi */
  private check(tx: TenantTx, tenantId: string): Promise<Row[]> {
    return tx.$queryRaw<Row[]>`
      (
        -- I1: jami qoldiq = omborlar bo'yicha taqsimot yig'indisi
        SELECT 'products.stock' AS "check", p.id::text AS "entityId", p.stock::text AS cached,
               COALESCE(SUM(ps.qty), 0)::text AS actual
          FROM products p
          LEFT JOIN product_stocks ps ON ps.tenant_id = p.tenant_id AND ps.product_id = p.id
         WHERE p.tenant_id = ${tenantId}::uuid
         GROUP BY p.id, p.stock
        HAVING p.stock <> COALESCE(SUM(ps.qty), 0)
         LIMIT ${SAMPLE_LIMIT}
      ) UNION ALL (
        -- Harakatlar jurnali: oxirgi balance_after = shu ombordagi joriy qoldiq
        SELECT 'stock_movements.balance_after', last.product_id::text || '/' || last.warehouse_id::text,
               last.balance_after::text, COALESCE(ps.qty, 0)::text
          FROM (SELECT DISTINCT ON (product_id, warehouse_id) product_id, warehouse_id, balance_after
                  FROM stock_movements
                 WHERE tenant_id = ${tenantId}::uuid
                 ORDER BY product_id, warehouse_id, date DESC, id DESC) last
          LEFT JOIN product_stocks ps
            ON ps.tenant_id = ${tenantId}::uuid AND ps.product_id = last.product_id AND ps.warehouse_id = last.warehouse_id
         WHERE last.balance_after <> COALESCE(ps.qty, 0)
         LIMIT ${SAMPLE_LIMIT}
      ) UNION ALL (
        -- Nasiya: to'langan = qarz to'lovlari + qaytarish bilan yopilgan qism (Q38)
        SELECT 'sales.debt_paid', s.id::text, s.debt_paid::text,
               (COALESCE(dp.sum, 0) + COALESCE(r.sum, 0))::text
          FROM sales s
          LEFT JOIN LATERAL (SELECT SUM(amount) AS sum FROM debt_payments
                              WHERE tenant_id = s.tenant_id AND sale_id = s.id) dp ON true
          LEFT JOIN LATERAL (SELECT SUM(debt_paid) AS sum FROM sales
                              WHERE tenant_id = s.tenant_id AND related_sale_id = s.id
                                AND type = 'return' AND status <> 'cancelled') r ON true
         WHERE s.tenant_id = ${tenantId}::uuid AND s.type = 'sale' AND s.status <> 'cancelled'
           AND s.debt_paid <> COALESCE(dp.sum, 0) + COALESCE(r.sum, 0)
         LIMIT ${SAMPLE_LIMIT}
      ) UNION ALL (
        -- Kreditorlik: to'langan = ta'minotchiga to'lovlar
        SELECT 'purchase_orders.paid', o.id::text, o.paid::text, COALESCE(SUM(sp.amount), 0)::text
          FROM purchase_orders o
          LEFT JOIN supplier_payments sp ON sp.tenant_id = o.tenant_id AND sp.po_id = o.id
         WHERE o.tenant_id = ${tenantId}::uuid
         GROUP BY o.id, o.paid
        HAVING o.paid <> COALESCE(SUM(sp.amount), 0)
         LIMIT ${SAMPLE_LIMIT}
      ) UNION ALL (
        -- Kassa (I9/I10): ochiq smenada balans = boshlang'ich + kirim − chiqim
        SELECT 'tenant_state.cash_balance', sh.id::text, ts.cash_balance::text,
               (sh.opening_balance + sh.cash_in - sh.cash_out)::text
          FROM tenant_state ts
          JOIN cash_shifts sh ON sh.tenant_id = ts.tenant_id AND sh.id = ts.active_shift_id
         WHERE ts.tenant_id = ${tenantId}::uuid
           AND ts.cash_balance <> sh.opening_balance + sh.cash_in - sh.cash_out
      ) UNION ALL (
        -- Fayllar: band hajm = tayyor fayllar yig'indisi (Q71)
        SELECT 'tenant_state.storage_used_bytes', NULL, ts.storage_used_bytes::text, COALESCE(f.sum, 0)::text
          FROM tenant_state ts
          LEFT JOIN LATERAL (SELECT SUM(size_bytes) AS sum FROM files
                              WHERE tenant_id = ts.tenant_id AND status = 'ready') f ON true
         WHERE ts.tenant_id = ${tenantId}::uuid AND ts.storage_used_bytes <> COALESCE(f.sum, 0)
      ) UNION ALL (
        -- I12: hisoblagich berilgan eng katta raqamdan kichik emas (keyingi raqam band bo'lmasin)
        SELECT 'doc_counters.last_no', c.prefix, c.last_no::text, MAX(n.no)::text
          FROM doc_counters c
          JOIN LATERAL (
            SELECT substring(number FROM '(\\d+)$')::bigint AS no FROM sales
             WHERE tenant_id = c.tenant_id
               AND ((c.prefix = 'CHEK' AND type = 'sale') OR (c.prefix = 'QAYT' AND type = 'return'))
            UNION ALL SELECT substring(number FROM '(\\d+)$')::bigint FROM quotes
             WHERE tenant_id = c.tenant_id AND c.prefix = 'TKLF'
            UNION ALL SELECT substring(number FROM '(\\d+)$')::bigint FROM purchase_orders
             WHERE tenant_id = c.tenant_id AND c.prefix = 'BUY'
          ) n ON true
         WHERE c.tenant_id = ${tenantId}::uuid
         GROUP BY c.prefix, c.last_no
        HAVING c.last_no < MAX(n.no)
      )`
  }
}
