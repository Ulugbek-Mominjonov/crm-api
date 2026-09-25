import type { Client, PurchaseOrder, Sale, SaleItem } from './types'

/**
 * Moliyaviy hisob-kitobning YAGONA manbasi.
 *
 * Ilgari Dashboard `status === 'completed'` bo'yicha, Hisobotlar esa
 * `status !== 'cancelled'` bo'yicha hisoblagan edi. Nasiya sotuv `pending`
 * holatida yoziladi — natijada bitta kunning tushumi ikki sahifada ikki xil
 * chiqardi. Endi ikkalasi ham shu yerdagi qoidadan foydalanadi.
 *
 * Qoida: tushum tovar mijozga topshirilganda tan olinadi (accrual), ya'ni
 * nasiya sotuv ham tushumga kiradi; faqat bekor qilingan chek chiqariladi.
 */

/** Tushumga kiradigan sotuvmi? (bekor qilinmagan, qaytarish emas) */
export function isRevenueSale(s: Sale): boolean {
  return s.status !== 'cancelled' && s.type === 'sale'
}

/** Tushumdan chegiriladigan qaytarishmi? */
export function isRevenueReturn(s: Sale): boolean {
  return s.status !== 'cancelled' && s.type === 'return'
}

/** Qatorlar tannarxi (COGS) */
export function itemsCost(items: Pick<SaleItem, 'cost' | 'qty'>[]): number {
  return items.reduce((s, i) => s + i.cost * i.qty, 0)
}

/** Sotuvlar ro'yxatidan sof tushum (sotuvlar − qaytarishlar) */
export function revenueOf(sales: Sale[]): number {
  return sales.reduce((sum, s) => {
    if (isRevenueSale(s)) return sum + s.total
    if (isRevenueReturn(s)) return sum - s.total
    return sum
  }, 0)
}

/** Sotuvlar ro'yxatidan sof tannarx (sotuvlar − qaytarishlar) */
export function cogsOf(sales: Sale[]): number {
  return sales.reduce((sum, s) => {
    if (isRevenueSale(s)) return sum + itemsCost(s.items)
    if (isRevenueReturn(s)) return sum - itemsCost(s.items)
    return sum
  }, 0)
}

/** Yalpi foyda = tushum − tannarx */
export function grossProfitOf(sales: Sale[]): number {
  return revenueOf(sales) - cogsOf(sales)
}

/** Berilgan sanadagi (yoki oraliqdagi) sotuvlarni ajratadi */
export function salesInRange(sales: Sale[], from: string, to: string): Sale[] {
  return sales.filter((s) => s.date >= from && s.date <= to)
}

// ------------------------------------------------- Ta'minotchiga qarz

/** Buyurtmadan haqiqatda kelib tushgan tovarlar qiymati */
export function poReceivedValue(po: PurchaseOrder): number {
  if (po.status === 'cancelled') return 0
  if (po.status === 'received') return po.total
  if (po.status !== 'partial') return 0
  return po.items.reduce((sum, it) => sum + Math.round((it.receivedQty ?? 0) * it.cost), 0)
}

/**
 * Ta'minotchiga qarz — faqat KELGAN tovar uchun.
 * Qisman qabulda ham to'g'ri ishlaydi: 10 tadan 7 tasi kelgan bo'lsa,
 * qarz 7 tasining qiymatidan hisoblanadi.
 */
export function poOutstanding(po: PurchaseOrder): number {
  return Math.max(0, poReceivedValue(po) - po.paid)
}

/** Ta'minotchiga umumiy kreditorlik */
export function totalPayables(orders: PurchaseOrder[]): number {
  return orders.reduce((sum, o) => sum + poOutstanding(o), 0)
}

// ---------------------------------------------------------------- Nasiya

/** Sotuv bo'yicha qolgan qarz. `useStore`dagi bilan bir xil qoida. */
function outstanding(sale: Sale): number {
  if (sale.status === 'cancelled' || sale.type === 'return') return 0
  const paid =
    sale.paid.cash + sale.paid.card + sale.paid.transfer + sale.debtPaid
  return Math.max(0, sale.total - paid)
}

/** Mijozning barcha cheklari bo'yicha umumiy qarzi */
export function clientDebt(sales: Sale[], clientId: string): number {
  return sales
    .filter((s) => s.customerId === clientId)
    .reduce((sum, s) => sum + outstanding(s), 0)
}

/**
 * Nasiya to'lov muddati o'tganmi?
 * `dueDate` bo'lmasa muddat belgilanmagan — o'tgan hisoblanmaydi.
 */
export function isOverdue(sale: Sale, todayIso: string): boolean {
  if (outstanding(sale) <= 0) return false
  return !!sale.dueDate && sale.dueDate < todayIso
}

/** Mijozning muddati o'tgan qarzi */
export function overdueDebt(
  sales: Sale[],
  clientId: string,
  todayIso: string,
): number {
  return sales
    .filter((s) => s.customerId === clientId && isOverdue(s, todayIso))
    .reduce((sum, s) => sum + outstanding(s), 0)
}

export type CreditCheck =
  | { ok: true }
  | { ok: false; reason: 'limit'; limit: number; current: number; extra: number }
  | { ok: false; reason: 'overdue'; overdue: number }

/** Mijozning nasiya holati: limit (0 — cheklanmagan), joriy va muddati o'tgan qarz */
export interface CreditPosition {
  limit: number
  current: number
  overdue: number
}

/**
 * Nasiya qoidasi (I16) — qarz yig'indilari tayyor bo'lganda (server ularni
 * SQL'da hisoblaydi). Ikki to'siq: (1) muddati o'tgan qarzi bor,
 * (2) limitdan oshadi. Limit 0 — cheklanmagan.
 */
export function evaluateCredit(pos: CreditPosition, extra: number): CreditCheck {
  if (extra <= 0) return { ok: true }
  if (pos.overdue > 0) return { ok: false, reason: 'overdue', overdue: pos.overdue }
  if (pos.limit <= 0) return { ok: true }
  if (pos.current + extra > pos.limit) {
    return { ok: false, reason: 'limit', limit: pos.limit, current: pos.current, extra }
  }
  return { ok: true }
}

/**
 * Mijozga yangi nasiya berish mumkinmi? (cheklar ro'yxatidan)
 * `creditLimit` bo'lmasa yoki 0 bo'lsa — limit cheklanmagan.
 */
export function checkCredit(
  client: Client | undefined,
  sales: Sale[],
  extra: number,
  todayIso: string,
): CreditCheck {
  if (!client) return { ok: true }
  return evaluateCredit(
    {
      limit: client.creditLimit ?? 0,
      current: clientDebt(sales, client.id),
      overdue: overdueDebt(sales, client.id, todayIso),
    },
    extra,
  )
}

/** Mijoz sozlamasiga ko'ra nasiya to'lov muddati (ISO sana) */
export function dueDateFor(
  client: Pick<Client, 'paymentTermDays'> | undefined,
  fromIso: string,
): string | undefined {
  const days = client?.paymentTermDays
  if (!days || days <= 0) return undefined
  const d = new Date(`${fromIso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return undefined
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
