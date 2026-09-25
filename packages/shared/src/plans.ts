/**
 * Tariflar (T-125, 09 §9.11). Server chegarani tekshiradi, mijoz esa
 * "ishlatilgan / chegara" ni ko'rsatadi — bitta manbadan.
 */
export interface PlanLimits {
  /** Faol kirish hisoblari */
  users: number
  /** Arxivlanmagan omborlar */
  warehouses: number
  /** Fayl saqlash hajmi va bitta fayl (bayt) */
  storageBytes: number
  fileBytes: number
  /** Kunlik SMS (Toshkent kuni) */
  smsPerDay: number
}

const MB = 1024 * 1024

export const PLANS = {
  free: { users: 3, warehouses: 2, storageBytes: 200 * MB, fileBytes: 5 * MB, smsPerDay: 50 },
  basic: { users: 10, warehouses: 5, storageBytes: 2048 * MB, fileBytes: 10 * MB, smsPerDay: 500 },
  pro: { users: 50, warehouses: 20, storageBytes: 20_480 * MB, fileBytes: 50 * MB, smsPerDay: 5_000 },
} as const satisfies Record<string, PlanLimits>

export type PlanName = keyof typeof PLANS
export const PLAN_NAMES = Object.keys(PLANS) as PlanName[]

/** Noma'lum tarif — eng kichigi (bepul) */
export function planLimits(plan: string): PlanLimits {
  return (PLANS as Record<string, PlanLimits>)[plan] ?? PLANS.free
}

/** Oylik narx (so'm). Bepul tarif sotilmaydi */
export const PLAN_MONTHLY_PRICE: Readonly<Record<PlanName, number>> = { free: 0, basic: 99_000, pro: 249_000 }

/** Sotiladigan tariflar (hisob-faktura) */
export const PAID_PLANS = PLAN_NAMES.filter((p) => PLAN_MONTHLY_PRICE[p] > 0)
