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
  /** Sozlama (brend rangi, logotip, nom …) o'zgardi — boshqa kassalar `GET /settings` ni qayta so'raydi */
  'settings.updated': Record<string, never>
  /**
   * Rol ruxsatlari yoki kimningdir roli o'zgardi (T-134) — ochiq ilovalar
   * `GET /auth/me` ni qayta so'raydi (menyu va tugmalar yangi ruxsatlar bilan)
   */
  'access.changed': Record<string, never>
  /**
   * Do'kon holati yoki tarifi platforma tomonidan o'zgardi (T-135): blok,
   * blokdan chiqarish, qo'lda to'lov — ochiq ilovalar `GET /auth/me` yoki
   * `GET /tenants/current` ni qayta so'raydi (banner, tarif)
   */
  'tenant.status': { status: string; plan: string }
  /**
   * Platforma egasi do'kon murojaatiga javob berdi yoki uni yopdi (T-140) —
   * administrator ilovasi `GET /tenants/current/requests` ni qayta so'raydi (banner, murojaat oynasi)
   */
  'tenant.request': { requestId: string; status: string }
}

export type DomainEventType = keyof DomainEventMap

/** WebSocket nomlar fazosi: `wss://…/events` */
export const EVENTS_NAMESPACE = '/events'

/** Tenant xonasi — ulanish faqat token'dagi tenantnikiga qo'shiladi */
export const tenantRoom = (tenantId: string): string => `tenant:${tenantId}`
