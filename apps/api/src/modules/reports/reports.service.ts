import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { DomainError } from '@/common/errors/domain.error'
import { addDays, BUSINESS_TIME_ZONE, businessDate, daysInclusive } from '@/common/time'
import { PrismaService } from '@/prisma/prisma.service'
import { requireTenantTx } from '@/prisma/tenant-tx'
import type {
  AnalyticsDto, DashboardDto, DashboardQueryDto, PeriodQueryDto, PnlChangeDto, PnlDto, PnlQueryDto, PnlTotalsDto,
} from './dto/report.dto'
import { ReportCache } from './report-cache.service'

/** 62 kundan uzun davr trendi oy bo'yicha (frontend Hisobotlar qoidasi) */
const MONTHLY_TREND_AFTER_DAYS = 62
/** Bir so'rovda ko'riladigan eng uzun davr — undan uzuni ma'nosiz va og'ir */
const MAX_PERIOD_DAYS = 3 * 366

const DASHBOARD_LIST = 5
const LOW_STOCK_LIST = 6
const RECENT_SALES = 6

/** Ko'rinish va jonli qismning umumiy ustunlari (UNION uchun) */
const DAILY_COLUMNS = Prisma.sql`date, revenue, returns, cogs, returns_cogs, sale_count, paid_cash, paid_card, paid_transfer`
const PRODUCT_COLUMNS = Prisma.sql`date, product_id, base_qty, revenue, profit`

/**
 * Materiallashgan ko'rinish chegarasi: undan OLDINGI kunlar ko'rinishdan,
 * shu kundan boshlab — jonli (10 §10.6). Chegara — oxirgi yangilanish kuni
 * yoki tenantning eskirgan kuni (orqa sanali chek, kechagi chekni bekor
 * qilish — trigger belgilaydi), qaysi biri oldin bo'lsa. Yangilash
 * yiqilsa ham raqam yo'qolmaydi — jonli qism uzayadi (sekinroq, to'g'ri).
 */
function cutoff(tenantId: string): Prisma.Sql {
  return Prisma.sql`LEAST(
    COALESCE((SELECT (refreshed_at AT TIME ZONE ${BUSINESS_TIME_ZONE})::date FROM report_refresh_state), '-infinity'::date),
    COALESCE((SELECT report_dirty_from FROM tenant_state WHERE tenant_id = ${tenantId}::uuid), 'infinity'::date))`
}

/** Kunlik savdo `[from, to]` — I4 qoidasi bitta ta'rifda (`daily_sales_live`) */
function dailySales(tenantId: string, from: string, to: string): Prisma.Sql {
  return Prisma.sql`(
    SELECT ${DAILY_COLUMNS} FROM tenant_daily_sales
     WHERE date BETWEEN ${from}::date AND ${to}::date AND date < ${cutoff(tenantId)}
    UNION ALL
    SELECT ${DAILY_COLUMNS} FROM daily_sales_live
     WHERE tenant_id = ${tenantId}::uuid AND date BETWEEN ${from}::date AND ${to}::date AND date >= ${cutoff(tenantId)})`
}

/** Kunlik mahsulot savdosi `[from, to]` */
function dailyProducts(tenantId: string, from: string, to: string): Prisma.Sql {
  return Prisma.sql`(
    SELECT ${PRODUCT_COLUMNS} FROM tenant_daily_products
     WHERE date BETWEEN ${from}::date AND ${to}::date AND date < ${cutoff(tenantId)}
    UNION ALL
    SELECT ${PRODUCT_COLUMNS} FROM daily_product_sales_live
     WHERE tenant_id = ${tenantId}::uuid AND date BETWEEN ${from}::date AND ${to}::date AND date >= ${cutoff(tenantId)})`
}

/** Davr jami (sotuv − qaytarish) — JSON obyekt */
const totalsJson = Prisma.sql`json_build_object(
  'revenue', COALESCE(SUM(revenue - returns), 0),
  'cogs', COALESCE(ROUND(SUM(cogs - returns_cogs)), 0),
  'salesCount', COALESCE(SUM(sale_count), 0))`

interface PeriodTotals {
  revenue: number
  cogs: number
  salesCount: number
}

type PnlRow = Omit<PnlDto, 'period' | 'previousPeriod' | 'current' | 'previous' | 'change' | 'granularity' | 'deadStock' | 'payments'> & {
  cur: PeriodTotals
  prev: PeriodTotals
  curExpenses: number
  prevExpenses: number
  payments: Omit<PnlDto['payments'], 'debt'>
  debt: number
  stockValue: number
  deadValue: number
  deadStock: PnlDto['deadStock']['items']
}

/**
 * Hisobotlar (E10). Tushum qoidasi I4 — `daily_sales_live` da yagona
 * ta'rif; o'tgan kunlar materiallashgan nusxadan, qolgani jonli.
 * Har hisobot — BITTA so'rov (10 §10.1: dashboard 1, P&L ≤ 2, ABC 1).
 * Tugallangan davr keshlanadi (T-085), bugun — hech qachon.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: ReportCache,
  ) {}

  /** Bosh sahifa (T-081): bugun/kecha, balanslar, trend, toplar — bitta so'rov, keshsiz */
  async dashboard(query: DashboardQueryDto): Promise<DashboardDto> {
    const { tenantId } = requireTenantTx()
    const today = businessDate()
    const yesterday = addDays(today, -1)
    const start = addDays(today, -(query.days - 1))
    const [row] = await this.prisma.scoped.$queryRaw<DashboardDto[]>`
      WITH days AS ${dailySales(tenantId, start, today)},
           exp AS (SELECT date, SUM(amount) AS amount FROM expenses
                    WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
                      AND date BETWEEN ${yesterday}::date AND ${today}::date
                    GROUP BY date),
           sold AS (SELECT product_id, SUM(revenue) AS revenue FROM ${dailyProducts(tenantId, start, today)} p
                     GROUP BY product_id)
      SELECT
        (SELECT json_build_object(
                  'revenue', COALESCE(SUM(revenue - returns), 0),
                  'profit', COALESCE(ROUND(SUM(revenue - returns - cogs + returns_cogs)), 0),
                  'salesCount', COALESCE(SUM(sale_count), 0),
                  'expenses', COALESCE((SELECT amount FROM exp WHERE date = ${today}::date), 0))
           FROM days WHERE date = ${today}::date) AS today,
        (SELECT json_build_object(
                  'revenue', COALESCE(SUM(revenue - returns), 0),
                  'profit', COALESCE(ROUND(SUM(revenue - returns - cogs + returns_cogs)), 0),
                  'salesCount', COALESCE(SUM(sale_count), 0),
                  'expenses', COALESCE((SELECT amount FROM exp WHERE date = ${yesterday}::date), 0))
           FROM days WHERE date = ${yesterday}::date) AS yesterday,
        (SELECT COALESCE(SUM(outstanding), 0)::float8 FROM sales
          WHERE tenant_id = ${tenantId}::uuid AND status = 'pending' AND type = 'sale' AND deleted_at IS NULL) AS receivables,
        (SELECT COUNT(DISTINCT COALESCE(customer_id, id))::int FROM sales
          WHERE tenant_id = ${tenantId}::uuid AND status = 'pending' AND type = 'sale' AND deleted_at IS NULL
            AND outstanding > 0) AS debtors,
        (SELECT COALESCE(SUM(outstanding), 0)::float8 FROM purchase_orders
          WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL) AS payables,
        (SELECT COUNT(*)::int FROM purchase_orders
          WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL AND outstanding > 0) AS "payableOrders",
        (SELECT COUNT(*)::int FROM products
          WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL AND NOT archived AND stock <= min_stock) AS "lowStockCount",
        (SELECT COALESCE(json_agg(l), '[]') FROM (
           SELECT id, name, unit, stock, min_stock AS "minStock" FROM products
            WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL AND NOT archived AND stock <= min_stock
            ORDER BY stock - min_stock, name LIMIT ${LOW_STOCK_LIST}) l) AS "lowStock",
        (SELECT COALESCE(json_agg(t ORDER BY t.bucket), '[]') FROM (
           SELECT to_char(g.d, 'YYYY-MM-DD') AS bucket,
                  COALESCE(SUM(days.revenue - days.returns), 0) AS revenue,
                  COALESCE(ROUND(SUM(days.revenue - days.returns - days.cogs + days.returns_cogs)), 0) AS profit
             FROM generate_series(${start}::date, ${today}::date, interval '1 day') AS g(d)
             LEFT JOIN days ON days.date = g.d::date
            GROUP BY g.d) t) AS trend,
        (SELECT COALESCE(json_agg(t), '[]') FROM (
           SELECT s.product_id AS id, p.name, s.revenue AS value
             FROM sold s JOIN products p ON p.tenant_id = ${tenantId}::uuid AND p.id = s.product_id
            ORDER BY s.revenue DESC, s.product_id LIMIT ${DASHBOARD_LIST}) t) AS "topProducts",
        (SELECT COALESCE(json_agg(t), '[]') FROM (
           SELECT c.id, c.name, b.debt AS value
             FROM client_balances b JOIN clients c ON c.tenant_id = b.tenant_id AND c.id = b.customer_id
            WHERE b.tenant_id = ${tenantId}::uuid
            ORDER BY b.debt DESC, c.id LIMIT ${DASHBOARD_LIST}) t) AS "topDebtors",
        (SELECT COALESCE(json_agg(t), '[]') FROM (
           SELECT s.id, s.number, to_char(s.date, 'YYYY-MM-DD') AS date, s.total, s.status, s.type, c.name AS customer
             FROM sales s LEFT JOIN clients c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
            WHERE s.tenant_id = ${tenantId}::uuid AND s.deleted_at IS NULL
            ORDER BY s.created_at DESC, s.id DESC LIMIT ${RECENT_SALES}) t) AS "recentSales"`
    return row!
  }

  /**
   * Foyda/zarar (T-082): tushum − tannarx − xarajat, oldingi (teng
   * uzunlikdagi) davr bilan solishtirish, trend, to'lov turlari, top
   * mahsulot/sotuvchi, sotilmayotgan tovar — frontend Hisobotlar sahifasi
   * hisobi bilan bir xil. Bitta so'rov.
   */
  async pnl(query: PnlQueryDto): Promise<PnlDto> {
    const { tenantId } = requireTenantTx()
    const { from, to } = assertPeriod(query)
    const length = daysInclusive(from, to)
    const prevTo = addDays(from, -1)
    const prevFrom = addDays(prevTo, -(length - 1))
    const monthly = length > MONTHLY_TREND_AFTER_DAYS

    return this.cached(tenantId, to, `pnl:${from}:${to}:${query.limit}`, async () => {
      const [row] = await this.prisma.scoped.$queryRaw<PnlRow[]>`
        WITH days AS ${dailySales(tenantId, prevFrom, to)},
             sold AS (SELECT product_id, SUM(base_qty) AS qty, SUM(revenue) AS revenue, SUM(profit) AS profit
                        FROM ${dailyProducts(tenantId, from, to)} x GROUP BY product_id),
             exp AS (SELECT date, category, amount FROM expenses
                      WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL
                        AND date BETWEEN ${prevFrom}::date AND ${to}::date),
             dead AS (SELECT p.id, p.name, p.unit, p.stock, p.stock * p.cost AS value FROM products p
                       WHERE p.tenant_id = ${tenantId}::uuid AND p.deleted_at IS NULL AND NOT p.archived AND p.stock > 0
                         AND NOT EXISTS (SELECT 1 FROM sold s WHERE s.product_id = p.id))
        SELECT
          (SELECT ${totalsJson} FROM days WHERE date BETWEEN ${from}::date AND ${to}::date) AS cur,
          (SELECT ${totalsJson} FROM days WHERE date BETWEEN ${prevFrom}::date AND ${prevTo}::date) AS prev,
          (SELECT COALESCE(SUM(amount), 0)::float8 FROM exp WHERE date BETWEEN ${from}::date AND ${to}::date) AS "curExpenses",
          (SELECT COALESCE(SUM(amount), 0)::float8 FROM exp WHERE date BETWEEN ${prevFrom}::date AND ${prevTo}::date) AS "prevExpenses",
          (SELECT COALESCE(json_agg(t ORDER BY t.amount DESC, t.category), '[]') FROM (
             SELECT category, SUM(amount) AS amount FROM exp WHERE date BETWEEN ${from}::date AND ${to}::date
              GROUP BY category) t) AS "expensesByCategory",
          (SELECT COALESCE(json_agg(t ORDER BY t.bucket), '[]') FROM (
             SELECT to_char(date, ${monthly ? 'YYYY-MM' : 'YYYY-MM-DD'}) AS bucket,
                    SUM(revenue) AS revenue, ROUND(SUM(revenue - cogs)) AS profit
               FROM days WHERE date BETWEEN ${from}::date AND ${to}::date AND sale_count > 0
              GROUP BY 1) t) AS trend,
          (SELECT json_build_object('cash', COALESCE(SUM(paid_cash), 0), 'card', COALESCE(SUM(paid_card), 0),
                                    'transfer', COALESCE(SUM(paid_transfer), 0))
             FROM days WHERE date BETWEEN ${from}::date AND ${to}::date) AS payments,
          (SELECT COALESCE(SUM(outstanding), 0)::float8 FROM sales
            WHERE tenant_id = ${tenantId}::uuid AND type = 'sale' AND status = 'pending' AND deleted_at IS NULL
              AND date BETWEEN ${from}::date AND ${to}::date) AS debt,
          (SELECT COALESCE(json_agg(t), '[]') FROM (
             SELECT s.product_id AS "productId", p.name, p.unit, s.qty, s.revenue, ROUND(s.profit) AS profit
               FROM sold s JOIN products p ON p.tenant_id = ${tenantId}::uuid AND p.id = s.product_id
              ORDER BY s.revenue DESC, s.product_id LIMIT ${query.limit}) t) AS "topProducts",
          (SELECT COALESCE(json_agg(t ORDER BY t.revenue DESC, t."sellerId"), '[]') FROM (
             SELECT s.seller_id AS "sellerId", e.name, COUNT(*) AS count, SUM(s.total) AS revenue
               FROM sales s LEFT JOIN employees e ON e.tenant_id = s.tenant_id AND e.id = s.seller_id
              WHERE s.tenant_id = ${tenantId}::uuid AND s.type = 'sale' AND s.status <> 'cancelled'
                AND s.deleted_at IS NULL AND s.date BETWEEN ${from}::date AND ${to}::date
              GROUP BY s.seller_id, e.name
              ORDER BY SUM(s.total) DESC, s.seller_id LIMIT ${query.limit}) t) AS sellers,
          (SELECT COALESCE(ROUND(SUM(stock * cost)), 0)::float8 FROM products
            WHERE tenant_id = ${tenantId}::uuid AND deleted_at IS NULL AND NOT archived) AS "stockValue",
          (SELECT COALESCE(ROUND(SUM(value)), 0)::float8 FROM dead) AS "deadValue",
          (SELECT COALESCE(json_agg(t), '[]') FROM (
             SELECT id AS "productId", name, unit, stock, ROUND(value) AS "stockValue" FROM dead
              ORDER BY value DESC, id LIMIT ${query.limit}) t) AS "deadStock"`
      const r = row!
      const current = withProfit(r.cur, r.curExpenses)
      const previous = withProfit(r.prev, r.prevExpenses)
      return {
        period: { from, to },
        previousPeriod: { from: prevFrom, to: prevTo },
        current,
        previous,
        change: changeOf(current, previous),
        granularity: monthly ? 'month' : 'day',
        trend: r.trend,
        payments: { ...r.payments, debt: r.debt },
        expensesByCategory: r.expensesByCategory,
        topProducts: r.topProducts,
        sellers: r.sellers,
        deadStock: { stockValue: r.stockValue, deadValue: r.deadValue, items: r.deadStock },
      }
    })
  }

  /**
   * Analitika (T-083): ABC (80/95 %) — SQL oyna funksiyasi bilan,
   * kategoriya va to'lov taqsimoti, kunlik trend. Bitta so'rov.
   */
  async analytics(query: PeriodQueryDto): Promise<AnalyticsDto> {
    const { tenantId } = requireTenantTx()
    const { from, to } = assertPeriod(query)
    return this.cached(tenantId, to, `analytics:${from}:${to}`, async () => {
      const [row] = await this.prisma.scoped.$queryRaw<Omit<AnalyticsDto, 'period'>[]>`
        WITH days AS ${dailySales(tenantId, from, to)},
             sold AS (SELECT product_id, SUM(revenue) AS revenue FROM ${dailyProducts(tenantId, from, to)} x
                       GROUP BY product_id),
             ranked AS (
               SELECT s.product_id, p.name, p.category_id, s.revenue,
                      s.revenue * 100.0 / NULLIF(SUM(s.revenue) OVER (), 0) AS share,
                      SUM(s.revenue) OVER (ORDER BY s.revenue DESC, s.product_id ROWS UNBOUNDED PRECEDING) * 100.0
                        / NULLIF(SUM(s.revenue) OVER (), 0) AS cum
                 FROM sold s JOIN products p ON p.tenant_id = ${tenantId}::uuid AND p.id = s.product_id)
        SELECT
          (SELECT COALESCE(SUM(revenue), 0)::float8 FROM sold) AS "totalRevenue",
          (SELECT COALESCE(json_agg(t ORDER BY t.bucket), '[]') FROM (
             SELECT to_char(date, 'YYYY-MM-DD') AS bucket, revenue, ROUND(revenue - cogs) AS profit
               FROM days WHERE sale_count > 0) t) AS trend,
          (SELECT COALESCE(json_agg(t ORDER BY t.revenue DESC, t.name), '[]') FROM (
             SELECT r.category_id AS "categoryId", COALESCE(c.name, 'Boshqa') AS name, SUM(r.revenue) AS revenue
               FROM ranked r LEFT JOIN categories c ON c.tenant_id = ${tenantId}::uuid AND c.id = r.category_id
              GROUP BY r.category_id, c.name) t) AS categories,
          (SELECT json_build_object(
                    'cash', COALESCE(SUM(paid_cash), 0), 'card', COALESCE(SUM(paid_card), 0),
                    'transfer', COALESCE(SUM(paid_transfer), 0),
                    'debt', (SELECT COALESCE(SUM(outstanding), 0) FROM sales
                              WHERE tenant_id = ${tenantId}::uuid AND type = 'sale' AND status = 'pending'
                                AND deleted_at IS NULL AND date BETWEEN ${from}::date AND ${to}::date))
             FROM days) AS payments,
          (SELECT COALESCE(json_agg(json_build_object(
                    'productId', product_id, 'name', name, 'revenue', revenue,
                    'share', ROUND(share, 2), 'cumulative', ROUND(cum, 2),
                    'class', CASE WHEN cum <= 80 THEN 'A' WHEN cum <= 95 THEN 'B' ELSE 'C' END)
                  ORDER BY revenue DESC, product_id), '[]')
             FROM ranked) AS abc`
      return { period: { from, to }, ...row! }
    })
  }

  /** Tugallangan davr (bugungacha) keshlanadi; bugun kiradigani — hech qachon */
  private cached<T>(tenantId: string, to: string, key: string, compute: () => Promise<T>): Promise<T> {
    return to < businessDate() ? this.cache.wrap(tenantId, key, compute) : compute()
  }
}

function assertPeriod(query: PeriodQueryDto): { from: string; to: string } {
  if (query.from > query.to) {
    throw new DomainError('VALIDATION_FAILED', '`from` `to` dan keyin bo‘lmaydi', [{ field: 'from', code: 'VALIDATION_FAILED' }])
  }
  if (daysInclusive(query.from, query.to) > MAX_PERIOD_DAYS) {
    throw new DomainError('VALIDATION_FAILED', `Davr ${MAX_PERIOD_DAYS} kundan oshmasin`, [{ field: 'to', code: 'VALIDATION_FAILED' }])
  }
  return { from: query.from, to: query.to }
}

/** Serverdagi hisob — foyda doim bor (javobdan rolga qarab keyin olib tashlanadi) */
type ComputedTotals = PnlTotalsDto & Required<Pick<PnlTotalsDto, 'grossProfit' | 'netProfit'>>

function withProfit(t: PeriodTotals, expenses: number): ComputedTotals {
  const grossProfit = t.revenue - t.cogs
  return { ...t, grossProfit, expenses, netProfit: grossProfit - expenses }
}

/** Frontend `delta`: oldingi 0 bo'lsa — yo'q, aks holda butun foiz */
function pct(now: number, before: number): number | null {
  return before === 0 ? null : Math.round(((now - before) / Math.abs(before)) * 100)
}

function changeOf(cur: ComputedTotals, prev: ComputedTotals): PnlChangeDto {
  return {
    revenue: pct(cur.revenue, prev.revenue),
    grossProfit: pct(cur.grossProfit, prev.grossProfit),
    netProfit: pct(cur.netProfit, prev.netProfit),
    expenses: pct(cur.expenses, prev.expenses),
  }
}
