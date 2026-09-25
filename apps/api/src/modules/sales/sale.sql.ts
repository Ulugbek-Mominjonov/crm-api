import { Prisma, type PriceTier, type ProductUnit, type SaleStatus, type SaleType } from '@prisma/client'
import { milliToDb, toMilli } from '@/common/quantity'

/**
 * Chek yozuvchi so'rovning CTE bo'laklari. Chek, qatorlar, ombor, kassa,
 * bonus va yetkazish BITTA so'rovda yoziladi (`withCtes`) — so'rovlar soni
 * qatorlar soniga bog'liq emas (10 §10.1: `POST /sales` ≤ 8).
 *
 * Ma'lumot `jsonb_to_record(set)` orqali: bitta parametr, tiplar aniq.
 * Chek raqami shu so'rovning o'zidagi hisoblagich CTE'sidan (`doc`) olinadi.
 */

/** Hisoblagich CTE'sidagi raqam — SQL ifoda */
export const DOC_NUMBER = Prisma.sql`(SELECT number FROM doc)`

/** `sales` qatori. Pul — butun so'm, `paidCash` — kassada qolgan naqd */
export interface SaleRow {
  id: string
  type: SaleType
  customerId: string | null
  sellerId: string | null
  warehouseId: string | null
  priceTier: PriceTier
  subtotal: number
  /** Umumiy chegirma + ishlatilgan bonus (API ko'rinishi) */
  discount: number
  taxRate: number
  tax: number
  deliveryFee: number
  total: number
  paidCash: number
  paidCard: number
  paidTransfer: number
  debtPaid: number
  change: number
  bonusUsed: number
  bonusEarned: number
  status: SaleStatus
  date: string
  dueDate: string | null
  relatedSaleId: string | null
  /** Chek yozilgan kassa smenasi */
  shiftId: string | null
}

export interface SaleItemRow {
  id: string
  productId: string
  name: string
  unit: ProductUnit
  qty: number
  baseQty: number
  price: number
  cost: number
  discount: number
  lineNo: number
  returnOfId: string | null
}

/** Chek sarlavhasi (`sale_row`) va qatorlari (`sale_lines`) */
export function insertSaleCtes(tenantId: string, sale: SaleRow, items: readonly SaleItemRow[]): Prisma.Sql[] {
  const header = {
    id: sale.id,
    type: sale.type,
    customer_id: sale.customerId,
    seller_id: sale.sellerId,
    warehouse_id: sale.warehouseId,
    price_tier: sale.priceTier,
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax_rate: sale.taxRate,
    tax: sale.tax,
    delivery_fee: sale.deliveryFee,
    total: sale.total,
    paid_cash: sale.paidCash,
    paid_card: sale.paidCard,
    paid_transfer: sale.paidTransfer,
    debt_paid: sale.debtPaid,
    change: sale.change,
    bonus_used: sale.bonusUsed,
    bonus_earned: sale.bonusEarned,
    status: sale.status,
    date: sale.date,
    due_date: sale.dueDate,
    related_sale_id: sale.relatedSaleId,
    shift_id: sale.shiftId,
  }
  const lines = items.map((item) => ({
    id: item.id,
    product_id: item.productId,
    name: item.name,
    unit: item.unit,
    // Miqdor — aniq 3 kasrli satr (JSON raqami suzuvchi nuqta bilan kelardi)
    qty: milliToDb(toMilli(item.qty)),
    base_qty: milliToDb(toMilli(item.baseQty)),
    price: item.price,
    cost: item.cost,
    discount: item.discount,
    line_no: item.lineNo,
    return_of_id: item.returnOfId,
  }))
  return [
    Prisma.sql`sale_row AS (
      INSERT INTO sales (id, tenant_id, number, type, customer_id, seller_id, warehouse_id, price_tier,
                         subtotal, discount, tax_rate, tax, delivery_fee, total, paid_cash, paid_card,
                         paid_transfer, debt_paid, change, bonus_used, bonus_earned, status, date,
                         due_date, related_sale_id, shift_id)
      SELECT s.id, ${tenantId}::uuid, ${DOC_NUMBER}, s.type::"SaleType", s.customer_id, s.seller_id,
             s.warehouse_id, s.price_tier::"PriceTier", s.subtotal, s.discount, s.tax_rate, s.tax,
             s.delivery_fee, s.total, s.paid_cash, s.paid_card, s.paid_transfer, s.debt_paid, s.change,
             s.bonus_used, s.bonus_earned, s.status::"SaleStatus", s.date, s.due_date, s.related_sale_id,
             s.shift_id
        FROM jsonb_to_record(${JSON.stringify(header)}::jsonb)
          AS s(id uuid, type text, customer_id uuid, seller_id uuid, warehouse_id uuid, price_tier text,
               subtotal bigint, discount bigint, tax_rate int, tax bigint, delivery_fee bigint, total bigint,
               paid_cash bigint, paid_card bigint, paid_transfer bigint, debt_paid bigint, change bigint,
               bonus_used bigint, bonus_earned bigint, status text, date date, due_date date,
               related_sale_id uuid, shift_id uuid)
      RETURNING created_at)`,
    Prisma.sql`sale_lines AS (
      INSERT INTO sale_items (id, tenant_id, sale_id, product_id, name, unit, qty, base_qty, price, cost,
                              discount, line_no, return_of_id)
      SELECT i.id, ${tenantId}::uuid, ${sale.id}::uuid, i.product_id, i.name, i.unit::"ProductUnit", i.qty,
             i.base_qty, i.price, i.cost, i.discount, i.line_no, i.return_of_id
        FROM jsonb_to_recordset(${JSON.stringify(lines)}::jsonb)
          AS i(id uuid, product_id uuid, name text, unit text, qty numeric, base_qty numeric, price bigint,
               cost bigint, discount bigint, line_no int, return_of_id uuid)
      RETURNING 1)`,
  ]
}

/**
 * Mijoz bonusi: `delta` > 0 — beriladi, < 0 — olinadi. Ball manfiy
 * bo'lmaydi (I17): olib qo'yilgan ball allaqachon sarflangan bo'lsa — 0.
 */
export function bonusCtes(tenantId: string, customerId: string | null, delta: number): Prisma.Sql[] {
  if (!customerId || delta === 0) return []
  return [
    Prisma.sql`bonus AS (
      UPDATE clients SET bonus_points = GREATEST(0, bonus_points + ${delta}::bigint)
       WHERE tenant_id = ${tenantId}::uuid AND id = ${customerId}::uuid
      RETURNING 1)`,
  ]
}

export interface DeliveryRow {
  id: string
  address: string
  phone: string
  scheduledDate: string
  note: string | null
  lat: number | null
  lng: number | null
}

/**
 * Chekka bog'langan yetkazish. Narxi `sales.delivery_fee` da — chek summasi
 * ichida (I5, D3); `standalone_fee` bo'sh qoladi.
 */
export function deliveryCtes(
  tenantId: string,
  saleId: string,
  customerId: string | null,
  delivery: DeliveryRow | null,
): Prisma.Sql[] {
  if (!delivery) return []
  return [
    Prisma.sql`delivery_row AS (
      INSERT INTO deliveries (id, tenant_id, sale_id, customer_id, address, phone, scheduled_date, note, lat, lng)
      VALUES (${delivery.id}::uuid, ${tenantId}::uuid, ${saleId}::uuid, ${customerId}::uuid, ${delivery.address},
              ${delivery.phone}, ${delivery.scheduledDate}::date, ${delivery.note}, ${delivery.lat}::float8,
              ${delivery.lng}::float8)
      RETURNING 1)`,
  ]
}

/**
 * Chekning qarz to'lovi (`amount` > 0: qarz to'lovi yoki qaytarish hisobi)
 * yoki uning bekor qilinishi (< 0). Qarz 0 ga tushsa chek `completed`, yana
 * paydo bo'lsa — `pending` (I13, I14). O'ng tomonda ustunlarning ESKI qiymati.
 */
export function debtPaidCtes(tenantId: string, saleId: string, amount: number): Prisma.Sql[] {
  if (amount === 0) return []
  return [
    Prisma.sql`debt_paid AS (
      UPDATE sales
         SET debt_paid = debt_paid + ${amount}::bigint,
             status = CASE WHEN outstanding - ${amount}::bigint > 0 THEN 'pending'::"SaleStatus"
                           ELSE 'completed'::"SaleStatus" END
       WHERE tenant_id = ${tenantId}::uuid AND id = ${saleId}::uuid
      RETURNING 1)`,
  ]
}
