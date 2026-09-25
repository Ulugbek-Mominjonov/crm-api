import { Prisma } from '@prisma/client'
import type { TenantTx } from '@/prisma/prisma.service'
import type { Row, TableName } from './snapshot-plan'

/**
 * Ustunlar va bazadagi turlari (`jsonb_to_recordset` uchun). `fallback` —
 * nusxada qiymat bo'lmasa (`NULL`) bazaning sukuti (`created_at`).
 */
interface Column {
  type: string
  fallback?: string
}

const uuid: Column = { type: 'uuid' }
const txt: Column = { type: 'text' }
const big: Column = { type: 'bigint' }
const int4: Column = { type: 'int' }
const num: Column = { type: 'numeric' }
const date: Column = { type: 'date' }
const flag: Column = { type: 'boolean' }
const stamp: Column = { type: 'timestamptz' }
const created: Column = { type: 'timestamptz', fallback: 'now()' }
const enumOf = (name: string): Column => ({ type: `"${name}"` })

export const TABLE_COLUMNS: Readonly<Record<TableName, Readonly<Record<string, Column>>>> = {
  warehouses: { id: uuid, tenant_id: uuid, name: txt, address: txt, is_default: flag, archived: flag },
  categories: { id: uuid, tenant_id: uuid, name: txt, sort_order: int4 },
  suppliers: {
    id: uuid, tenant_id: uuid, name: txt, phone: txt, contact_person: txt, address: txt, notes: txt, email: txt, tin: txt,
    payment_term_days: int4,
  },
  employees: {
    id: uuid, tenant_id: uuid, name: txt, position: txt, phone: txt, status: enumOf('EmployeeStatus'), salary: big,
    hired_at: date,
  },
  clients: {
    id: uuid, tenant_id: uuid, name: txt, type: enumOf('ClientType'), phone: txt, email: txt, status: enumOf('ClientStatus'),
    group: enumOf('CustomerGroup'), bonus_points: big, credit_limit: big, payment_term_days: int4, source: txt,
    company: txt, notes: txt, created_at: created,
  },
  products: {
    id: uuid, tenant_id: uuid, name: txt, sku: txt, barcode: txt, category_id: uuid, unit: enumOf('ProductUnit'),
    price: big, wholesale_price: big, cost: big, min_stock: num, supplier_id: uuid, archived: flag,
    alt_unit: enumOf('ProductUnit'), alt_factor: num,
  },
  product_stocks: { tenant_id: uuid, product_id: uuid, warehouse_id: uuid, qty: num },
  cash_shifts: {
    id: uuid, tenant_id: uuid, opened_at: stamp, opening_balance: big, cash_in: big, cash_out: big,
    status: enumOf('ShiftStatus'), closed_at: stamp, expected_balance: big, counted_balance: big, difference: big, note: txt,
  },
  cash_movements: {
    id: uuid, tenant_id: uuid, shift_id: uuid, direction: enumOf('CashDirection'), amount: big, reason: txt,
    created_at: created,
  },
  expense_templates: {
    id: uuid, tenant_id: uuid, name: txt, category: enumOf('ExpenseCategory'), amount: big, method: enumOf('PayMethod'),
    period: enumOf('RecurrencePeriod'), day_of_period: int4, active: flag, last_run_key: txt, note: txt,
  },
  expenses: {
    id: uuid, tenant_id: uuid, category: enumOf('ExpenseCategory'), amount: big, method: enumOf('PayMethod'), date,
    note: txt, template_id: uuid,
  },
  purchase_orders: {
    id: uuid, tenant_id: uuid, number: txt, supplier_id: uuid, warehouse_id: uuid, total: big, paid: big,
    received_value: big, status: enumOf('POStatus'), date, received_date: date, due_date: date, note: txt,
  },
  po_items: { id: uuid, tenant_id: uuid, order_id: uuid, product_id: uuid, name: txt, qty: num, received_qty: num, cost: big },
  supplier_payments: {
    id: uuid, tenant_id: uuid, po_id: uuid, supplier_id: uuid, amount: big, method: enumOf('PayMethod'), date,
  },
  sales: {
    id: uuid, tenant_id: uuid, number: txt, type: enumOf('SaleType'), customer_id: uuid, seller_id: uuid,
    warehouse_id: uuid, price_tier: enumOf('PriceTier'), subtotal: big, discount: big, tax_rate: int4, tax: big,
    delivery_fee: big, total: big, paid_cash: big, paid_card: big, paid_transfer: big, debt_paid: big, change: big,
    status: enumOf('SaleStatus'), date, due_date: date, related_sale_id: uuid,
  },
  sale_items: {
    id: uuid, tenant_id: uuid, sale_id: uuid, product_id: uuid, name: txt, unit: enumOf('ProductUnit'), qty: num,
    base_qty: num, price: big, cost: big, discount: big, line_no: int4,
  },
  debt_payments: {
    id: uuid, tenant_id: uuid, sale_id: uuid, customer_id: uuid, amount: big, method: enumOf('PayMethod'), date,
  },
  quotes: {
    id: uuid, tenant_id: uuid, number: txt, customer_id: uuid, seller_id: uuid, subtotal: big, discount: big,
    tax_rate: int4, tax: big, total: big, status: enumOf('QuoteStatus'), date, valid_until: date, note: txt, sale_id: uuid,
  },
  quote_items: {
    id: uuid, tenant_id: uuid, quote_id: uuid, product_id: uuid, name: txt, unit: enumOf('ProductUnit'), qty: num,
    base_qty: num, price: big, cost: big, discount: big, line_no: int4,
  },
  deliveries: {
    id: uuid, tenant_id: uuid, sale_id: uuid, customer_id: uuid, address: txt, phone: txt, standalone_fee: big,
    driver_id: uuid, status: enumOf('DeliveryStatus'), scheduled_date: date, note: txt, lat: { type: 'float8' },
    lng: { type: 'float8' }, created_at: created,
  },
  messages: {
    id: uuid, tenant_id: uuid, target: enumOf('MessageTarget'), recipient_label: txt, recipients: int4, text: txt,
    template: txt, delivery_status: txt, created_at: created,
  },
  stock_movements: {
    id: uuid, tenant_id: uuid, product_id: uuid, product_name: txt, type: enumOf('MovementType'), qty: num,
    balance_after: num, warehouse_id: uuid, counter_warehouse_id: uuid, date, note: txt, supplier_id: uuid,
    unit_cost: big, ref_id: uuid,
  },
  audit_log: { id: uuid, tenant_id: uuid, action: txt, detail: txt, created_at: created },
}

/** Bitta so'rovdagi qatorlar — JSON parametri o'lchami chegarada qolsin */
const CHUNK = 2_000

/**
 * Ommaviy yozish: jadval uchun bitta `INSERT … SELECT FROM
 * jsonb_to_recordset` (qatorlar soniga bog'liq bo'lmagan so'rovlar soni).
 * `ON CONFLICT DO NOTHING` — qayta import (deterministik id) ikkilanmaydi.
 * Nomlar (jadval, ustun) — shu fayldagi o'zgarmaslar, mijozdan emas.
 */
export async function insertRows(tx: TenantTx, table: TableName, rows: readonly Row[]): Promise<number> {
  const columns = Object.entries(TABLE_COLUMNS[table])
  const names = Prisma.raw(columns.map(([name]) => `"${name}"`).join(', '))
  const values = Prisma.raw(
    columns.map(([name, c]) => (c.fallback ? `COALESCE(r."${name}", ${c.fallback})` : `r."${name}"`)).join(', '),
  )
  const shape = Prisma.raw(columns.map(([name, c]) => `"${name}" ${c.type}`).join(', '))
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    // Ketma-ket ATAYLAB: bo'laklar bitta tranzaksiya ulanishida (parallel so'rov yo'q)
    inserted += await tx.$executeRaw`
      INSERT INTO ${Prisma.raw(`"${table}"`)} (${names})
      SELECT ${values} FROM jsonb_to_recordset(${JSON.stringify(rows.slice(i, i + CHUNK))}::jsonb) AS r(${shape})
      ON CONFLICT DO NOTHING`
  }
  return inserted
}
