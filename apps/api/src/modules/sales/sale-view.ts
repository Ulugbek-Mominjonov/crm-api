import type { Prisma } from '@prisma/client'
import { dateFromDb, moneyFromDb, qtyFromDb } from '@/common/crud/convert'
import type { SaleDto, SaleItemDto } from './dto/sale.dto'
import type { SaleItemRow, SaleRow } from './sale.sql'

/** Chek + qatorlar + yetkazish — BITTA so'rov (`relationJoins`, Q12) */
export const SALE_SELECT = {
  id: true,
  number: true,
  type: true,
  status: true,
  customerId: true,
  sellerId: true,
  warehouseId: true,
  priceTier: true,
  subtotal: true,
  discount: true,
  taxRate: true,
  tax: true,
  deliveryFee: true,
  total: true,
  paidCash: true,
  paidCard: true,
  paidTransfer: true,
  debtPaid: true,
  change: true,
  outstanding: true,
  bonusUsed: true,
  bonusEarned: true,
  dueDate: true,
  date: true,
  relatedSaleId: true,
  createdAt: true,
  cancelledAt: true,
  items: {
    select: {
      id: true, productId: true, name: true, unit: true, qty: true, baseQty: true,
      price: true, cost: true, discount: true, returnOfId: true,
    },
    orderBy: { lineNo: 'asc' },
  },
  delivery: { select: { id: true, status: true } },
} satisfies Prisma.SaleSelect

export type SaleRecord = Prisma.SaleGetPayload<{ select: typeof SALE_SELECT }>

/**
 * Bazadagi chek → API. `paid.cash` — BERILGAN naqd: bazada kassada qolgani
 * (`paid_cash`) saqlanadi, qaytim alohida — mijoz chekida "berildi /
 * qaytim" ko'rinishi (04-api §4) shundan tiklanadi.
 */
export function toSaleDto(r: SaleRecord): SaleDto {
  return {
    id: r.id,
    number: r.number,
    type: r.type,
    status: r.status,
    customerId: r.customerId,
    sellerId: r.sellerId,
    warehouseId: r.warehouseId,
    priceTier: r.priceTier,
    subtotal: moneyFromDb(r.subtotal),
    discount: moneyFromDb(r.discount),
    taxRate: r.taxRate,
    tax: moneyFromDb(r.tax),
    deliveryFee: moneyFromDb(r.deliveryFee),
    total: moneyFromDb(r.total),
    paid: {
      cash: moneyFromDb(r.paidCash + r.change),
      card: moneyFromDb(r.paidCard),
      transfer: moneyFromDb(r.paidTransfer),
    },
    change: moneyFromDb(r.change),
    debtPaid: moneyFromDb(r.debtPaid),
    outstanding: moneyFromDb(r.outstanding),
    dueDate: r.dueDate ? dateFromDb(r.dueDate) : null,
    date: dateFromDb(r.date),
    relatedSaleId: r.relatedSaleId,
    bonusUsed: moneyFromDb(r.bonusUsed),
    bonusEarned: moneyFromDb(r.bonusEarned),
    createdAt: r.createdAt,
    cancelledAt: r.cancelledAt,
    items: r.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.name,
      unit: item.unit,
      qty: qtyFromDb(item.qty),
      baseQty: qtyFromDb(item.baseQty),
      price: moneyFromDb(item.price),
      cost: moneyFromDb(item.cost),
      discount: moneyFromDb(item.discount),
      returnOfId: item.returnOfId,
    })),
    delivery: r.delivery,
  }
}

/**
 * Hozirgina yozilgan chek → API: qayta o'qimasdan (so'rov byudjeti),
 * `toSaleDto` bilan AYNI ko'rinishda (testda solishtiriladi).
 */
export function writtenSaleDto(
  row: SaleRow,
  items: readonly SaleItemRow[],
  written: { number: string; createdAt: Date; deliveryId: string | null },
): SaleDto {
  return {
    id: row.id,
    number: written.number,
    type: row.type,
    status: row.status,
    customerId: row.customerId,
    sellerId: row.sellerId,
    warehouseId: row.warehouseId,
    priceTier: row.priceTier,
    subtotal: row.subtotal,
    discount: row.discount,
    taxRate: row.taxRate,
    tax: row.tax,
    deliveryFee: row.deliveryFee,
    total: row.total,
    paid: { cash: row.paidCash + row.change, card: row.paidCard, transfer: row.paidTransfer },
    change: row.change,
    debtPaid: row.debtPaid,
    // Bazadagi `outstanding` ustuni bilan bir xil qoida (I13)
    outstanding:
      row.type === 'return' ? 0 : Math.max(0, row.total - row.paidCash - row.paidCard - row.paidTransfer - row.debtPaid),
    dueDate: row.dueDate,
    date: row.date,
    relatedSaleId: row.relatedSaleId,
    bonusUsed: row.bonusUsed,
    bonusEarned: row.bonusEarned,
    createdAt: written.createdAt,
    cancelledAt: null,
    items: items.map(
      (item): SaleItemDto => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        unit: item.unit,
        qty: item.qty,
        baseQty: item.baseQty,
        price: item.price,
        cost: item.cost,
        discount: item.discount,
        returnOfId: item.returnOfId,
      }),
    ),
    delivery: written.deliveryId ? { id: written.deliveryId, status: 'pending' } : null,
  }
}
