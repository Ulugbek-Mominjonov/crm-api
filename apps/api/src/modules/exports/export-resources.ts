import { Prisma } from '@prisma/client'
import type { Resource } from '@crm/shared'
import { BUSINESS_TIME_ZONE } from '@/common/time'

export interface ExportColumn {
  /** JSON kaliti va SQL taxallusi */
  key: string
  /** CSV sarlavhasi (o'zbekcha) */
  label: string
  /** Rolga qarab yashiriladigan maydon nomi (03 §3.6): tannarx, ulgurji narx */
  visibility?: string
}

export interface ExportFilter {
  tenantId: string
  dateFrom?: string
  dateTo?: string
}

export interface ExportResource {
  /** Ko'rish huquqi (`view`) — eksport ham ko'rish */
  permission: Resource
  /** Fayl nomi boshi: `sotuvlar-2026-09-23.csv` */
  filename: string
  /** `dateFrom`/`dateTo` qo'llanadi */
  dated: boolean
  columns: readonly ExportColumn[]
  count(filter: ExportFilter): Prisma.Sql
  /** Kalitli sahifa: `id > after` (uuid v7 — yaratilish tartibida), har qatorda `id` */
  page(filter: ExportFilter, after: string, limit: number): Prisma.Sql
}

/** Sana oralig'i sharti; berilmagan chegara — cheklanmaydi */
function dateRange(column: Prisma.Sql, f: ExportFilter): Prisma.Sql {
  return Prisma.sql`${f.dateFrom ? Prisma.sql`AND ${column} >= ${f.dateFrom}::date` : Prisma.empty}
                    ${f.dateTo ? Prisma.sql`AND ${column} <= ${f.dateTo}::date` : Prisma.empty}`
}

/** Jurnal yozuvining do'kon kuni (`created_at` — timestamptz) */
const auditDay = Prisma.sql`(a.created_at AT TIME ZONE ${BUSINESS_TIME_ZONE})::date`

/** Birinchi sahifa kursori — har qanday uuid undan katta */
export const FIRST_CURSOR = '00000000-0000-0000-0000-000000000000'

/**
 * Eksport qilinadigan ro'yxatlar (T-084). Ustunlar frontenddagi CSV
 * eksporti bilan bir xil ma'noda; qiymatlar xom (so'm — butun, miqdor —
 * son), mijoz formatlamaydi.
 */
export const EXPORT_RESOURCES = {
  products: {
    permission: 'products',
    filename: 'mahsulotlar',
    dated: false,
    columns: [
      { key: 'name', label: 'Nomi' },
      { key: 'sku', label: 'Artikul' },
      { key: 'barcode', label: 'Shtrix-kod' },
      { key: 'category', label: 'Kategoriya' },
      { key: 'unit', label: 'Birlik' },
      { key: 'price', label: 'Chakana narx' },
      { key: 'wholesalePrice', label: 'Ulgurji narx', visibility: 'wholesalePrice' },
      { key: 'cost', label: 'Tannarx', visibility: 'cost' },
      { key: 'stock', label: 'Qoldiq' },
      { key: 'minStock', label: 'Minimal qoldiq' },
      { key: 'archived', label: 'Arxivda' },
    ],
    count: (f) => Prisma.sql`SELECT COUNT(*)::int AS n FROM products WHERE tenant_id = ${f.tenantId}::uuid AND deleted_at IS NULL`,
    page: (f, after, limit) => Prisma.sql`
      SELECT p.id, p.name, p.sku, p.barcode, c.name AS category, p.unit::text AS unit, p.price,
             p.wholesale_price AS "wholesalePrice", p.cost, p.stock, p.min_stock AS "minStock", p.archived
        FROM products p
        LEFT JOIN categories c ON c.tenant_id = p.tenant_id AND c.id = p.category_id
       WHERE p.tenant_id = ${f.tenantId}::uuid AND p.deleted_at IS NULL AND p.id > ${after}::uuid
       ORDER BY p.id
       LIMIT ${limit}`,
  },
  clients: {
    permission: 'customers',
    filename: 'mijozlar',
    dated: false,
    columns: [
      { key: 'name', label: 'Ism' },
      { key: 'phone', label: 'Telefon' },
      { key: 'group', label: 'Guruh' },
      { key: 'bonusPoints', label: 'Bonus ball' },
      { key: 'creditLimit', label: 'Nasiya limiti' },
      { key: 'debt', label: 'Qarz' },
      { key: 'createdAt', label: 'Qo‘shilgan sana' },
    ],
    count: (f) => Prisma.sql`SELECT COUNT(*)::int AS n FROM clients WHERE tenant_id = ${f.tenantId}::uuid AND deleted_at IS NULL`,
    page: (f, after, limit) => Prisma.sql`
      SELECT c.id, c.name, c.phone, c."group"::text AS "group", c.bonus_points AS "bonusPoints",
             c.credit_limit AS "creditLimit", COALESCE(b.debt, 0) AS debt,
             to_char(c.created_at AT TIME ZONE ${BUSINESS_TIME_ZONE}, 'YYYY-MM-DD') AS "createdAt"
        FROM clients c
        LEFT JOIN client_balances b ON b.tenant_id = c.tenant_id AND b.customer_id = c.id
       WHERE c.tenant_id = ${f.tenantId}::uuid AND c.deleted_at IS NULL AND c.id > ${after}::uuid
       ORDER BY c.id
       LIMIT ${limit}`,
  },
  sales: {
    permission: 'sales',
    filename: 'sotuvlar',
    dated: true,
    columns: [
      { key: 'number', label: 'Chek' },
      { key: 'date', label: 'Sana' },
      { key: 'type', label: 'Turi' },
      { key: 'status', label: 'Holati' },
      { key: 'customer', label: 'Mijoz' },
      { key: 'seller', label: 'Sotuvchi' },
      { key: 'total', label: 'Summa' },
      { key: 'paidCash', label: 'Naqd (kassada)' },
      { key: 'paidCard', label: 'Karta' },
      { key: 'paidTransfer', label: 'O‘tkazma' },
      { key: 'outstanding', label: 'Qarz' },
    ],
    count: (f) => Prisma.sql`
      SELECT COUNT(*)::int AS n FROM sales s
       WHERE s.tenant_id = ${f.tenantId}::uuid AND s.deleted_at IS NULL ${dateRange(Prisma.sql`s.date`, f)}`,
    page: (f, after, limit) => Prisma.sql`
      SELECT s.id, s.number, to_char(s.date, 'YYYY-MM-DD') AS date, s.type::text AS type, s.status::text AS status,
             c.name AS customer, e.name AS seller, s.total, s.paid_cash AS "paidCash", s.paid_card AS "paidCard",
             s.paid_transfer AS "paidTransfer", s.outstanding
        FROM sales s
        LEFT JOIN clients c ON c.tenant_id = s.tenant_id AND c.id = s.customer_id
        LEFT JOIN employees e ON e.tenant_id = s.tenant_id AND e.id = s.seller_id
       WHERE s.tenant_id = ${f.tenantId}::uuid AND s.deleted_at IS NULL ${dateRange(Prisma.sql`s.date`, f)}
         AND s.id > ${after}::uuid
       ORDER BY s.id
       LIMIT ${limit}`,
  },
  'stock-movements': {
    permission: 'products',
    filename: 'ombor-harakatlari',
    dated: true,
    columns: [
      { key: 'date', label: 'Sana' },
      { key: 'product', label: 'Mahsulot' },
      { key: 'type', label: 'Turi' },
      { key: 'qty', label: 'Miqdor' },
      { key: 'balanceAfter', label: 'Qoldiq (keyin)' },
      { key: 'warehouse', label: 'Ombor' },
      { key: 'unitCost', label: 'Kirim narxi', visibility: 'unitCost' },
      { key: 'note', label: 'Izoh' },
    ],
    count: (f) => Prisma.sql`
      SELECT COUNT(*)::int AS n FROM stock_movements m
       WHERE m.tenant_id = ${f.tenantId}::uuid ${dateRange(Prisma.sql`m.date`, f)}`,
    page: (f, after, limit) => Prisma.sql`
      SELECT m.id, to_char(m.date, 'YYYY-MM-DD') AS date, m.product_name AS product, m.type::text AS type, m.qty,
             m.balance_after AS "balanceAfter", w.name AS warehouse, m.unit_cost AS "unitCost", m.note
        FROM stock_movements m
        LEFT JOIN warehouses w ON w.tenant_id = m.tenant_id AND w.id = m.warehouse_id
       WHERE m.tenant_id = ${f.tenantId}::uuid ${dateRange(Prisma.sql`m.date`, f)} AND m.id > ${after}::uuid
       ORDER BY m.id
       LIMIT ${limit}`,
  },
  expenses: {
    permission: 'expenses',
    filename: 'xarajatlar',
    dated: true,
    columns: [
      { key: 'date', label: 'Sana' },
      { key: 'category', label: 'Turkum' },
      { key: 'amount', label: 'Summa' },
      { key: 'method', label: 'To‘lov turi' },
      { key: 'note', label: 'Izoh' },
    ],
    count: (f) => Prisma.sql`
      SELECT COUNT(*)::int AS n FROM expenses x
       WHERE x.tenant_id = ${f.tenantId}::uuid AND x.deleted_at IS NULL ${dateRange(Prisma.sql`x.date`, f)}`,
    page: (f, after, limit) => Prisma.sql`
      SELECT x.id, to_char(x.date, 'YYYY-MM-DD') AS date, x.category::text AS category, x.amount,
             x.method::text AS method, x.note
        FROM expenses x
       WHERE x.tenant_id = ${f.tenantId}::uuid AND x.deleted_at IS NULL ${dateRange(Prisma.sql`x.date`, f)}
         AND x.id > ${after}::uuid
       ORDER BY x.id
       LIMIT ${limit}`,
  },
  // Jurnal cheksiz o'sadi — faqat server eksporti (brauzerda yig'ilmaydi); kun — Toshkent vaqti
  audit: {
    permission: 'users',
    filename: 'audit-jurnali',
    dated: true,
    columns: [
      { key: 'createdAt', label: 'Vaqt' },
      { key: 'user', label: 'Foydalanuvchi' },
      { key: 'action', label: 'Amal' },
      { key: 'detail', label: 'Tafsilot' },
    ],
    count: (f) => Prisma.sql`
      SELECT COUNT(*)::int AS n FROM audit_log a
       WHERE a.tenant_id = ${f.tenantId}::uuid ${dateRange(auditDay, f)}`,
    page: (f, after, limit) => Prisma.sql`
      SELECT a.id, to_char(a.created_at AT TIME ZONE ${BUSINESS_TIME_ZONE}, 'YYYY-MM-DD HH24:MI') AS "createdAt",
             COALESCE(e.name, 'Tizim') AS user, a.action, a.detail
        FROM audit_log a
        LEFT JOIN users u ON u.tenant_id = a.tenant_id AND u.id = a.user_id
        LEFT JOIN employees e ON e.tenant_id = u.tenant_id AND e.id = u.employee_id
       WHERE a.tenant_id = ${f.tenantId}::uuid ${dateRange(auditDay, f)} AND a.id > ${after}::uuid
       ORDER BY a.id
       LIMIT ${limit}`,
  },
} satisfies Record<string, ExportResource>

export type ExportResourceName = keyof typeof EXPORT_RESOURCES
export const EXPORT_RESOURCE_NAMES = Object.keys(EXPORT_RESOURCES) as ExportResourceName[]
