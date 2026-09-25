/**
 * Realtime hodisalar (04-api §9). Yukda FAQAT identifikatorlar: to'liq
 * obyekt yuborilsa maydon darajasidagi huquq (tannarx, ulgurji narx)
 * chetlab o'tilardi. Mijoz keshni bekor qiladi va qayta so'raydi (06 §6.7).
 */
export interface DomainEventMap {
  /** Sotuv, qaytarish yoki taklifdan aylantirilgan chek */
  'sale.created': { saleId: string; warehouseId: string; productIds: string[] }
  'sale.cancelled': { saleId: string }
  /** OFD fiskal raqam berdi — chek QR bilan qayta chop etiladi (08 §8.9) */
  'sale.fiscalized': { saleId: string }
  'stock.changed': { productIds: string[]; warehouseId: string }
  'shift.opened': { shiftId: string }
  'shift.closed': { shiftId: string }
  'debt.paid': { saleId: string; customerId: string | null }
  'delivery.status': { deliveryId: string; status: string }
  'po.received': { orderId: string; productIds: string[] }
}

export type DomainEventType = keyof DomainEventMap

/** WebSocket nomlar fazosi: `wss://…/events` */
export const EVENTS_NAMESPACE = '/events'

/** Tenant xonasi — ulanish faqat token'dagi tenantnikiga qo'shiladi */
export const tenantRoom = (tenantId: string): string => `tenant:${tenantId}`
