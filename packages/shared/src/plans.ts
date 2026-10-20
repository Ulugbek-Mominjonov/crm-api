/**
 * Tariflar (T-125, T-148, 09 §9.11). Narx — DO'KON uchun, foydalanuvchi
 * uchun emas: kichik do'konda 1–2 xodim, bitta hisobni bir necha kishi
 * ishlatadi — kishi boshiga narx hisobni ulashishga undardi (Q126). Tariflar
 * hajm bilan farqlanadi (ombor, kirish hisobi, SMS, saqlash), imkoniyatlar
 * hammasida bir xil. Server chegarani tekshiradi, mijoz "ishlatilgan /
 * chegara" ni ko'rsatadi — bitta manbadan.
 */
export interface PlanLimits {
  /** Faol kirish hisoblari */
  users: number
  /** Arxivlanmagan omborlar */
  warehouses: number
  /** Fayl saqlash hajmi va bitta fayl (bayt) */
  storageBytes: number
  fileBytes: number
  /** Oylik SMS (Toshkent oyi): har SMS pul turadi; Telegram xabar cheklanmaydi */
  smsPerMonth: number
}

const MB = 1024 * 1024
const GB = 1024 * MB

export const PLANS = {
  /** Sotilmaydi: egasi beradi (hamkor, sinov loyihasi) va avval ochilgan do'konlar; muddatsiz */
  free: { users: 3, warehouses: 2, storageBytes: 200 * MB, fileBytes: 5 * MB, smsPerMonth: 50 },
  basic: { users: 3, warehouses: 2, storageBytes: 1 * GB, fileBytes: 10 * MB, smsPerMonth: 100 },
  business: { users: 10, warehouses: 5, storageBytes: 5 * GB, fileBytes: 20 * MB, smsPerMonth: 300 },
  pro: { users: 50, warehouses: 20, storageBytes: 20 * GB, fileBytes: 50 * MB, smsPerMonth: 1_000 },
} as const satisfies Record<string, PlanLimits>

export type PlanName = keyof typeof PLANS
export const PLAN_NAMES = Object.keys(PLANS) as PlanName[]

/** Noma'lum tarif — eng kichigi (bepul) */
export function planLimits(plan: string): PlanLimits {
  return (PLANS as Record<string, PlanLimits>)[plan] ?? PLANS.free
}

/** Mijozga ko'rinadigan nom va kimga mosligi (tarif kartasi) */
export const PLAN_INFO: Readonly<Record<PlanName, { label: string; audience: string }>> = {
  free: { label: 'Bepul', audience: 'Platforma egasi beradi' },
  basic: { label: 'Start', audience: '1–3 kishilik do‘kon: savdo joyi va ombor' },
  business: { label: 'Biznes', audience: 'O‘sayotgan do‘kon: bir necha ombor, 10 tagacha xodim' },
  pro: { label: 'Pro', audience: 'Ulgurji baza va filiallar' },
}

/** Oylik narx (so'm). Bepul tarif sotilmaydi */
export const PLAN_MONTHLY_PRICE: Readonly<Record<PlanName, number>> = { free: 0, basic: 99_000, business: 199_000, pro: 399_000 }

/** Sotiladigan tariflar (hisob-faktura) */
export const PAID_PLANS = PLAN_NAMES.filter((p) => PLAN_MONTHLY_PRICE[p] > 0)

/** To'lov oynasidagi muddatlar (oy) */
export const BILLING_PERIODS = [1, 3, 6, 12] as const

/**
 * Oldindan to'lov chegirmasi (%): shuncha oydan boshlab. Uzoq muddat —
 * kamroq qo'lda tasdiq va kamroq ketish; kattasidan boshlab tekshiriladi.
 */
export const PREPAY_DISCOUNTS: readonly { months: number; pct: number }[] = [
  { months: 12, pct: 20 },
  { months: 6, pct: 10 },
  { months: 3, pct: 5 },
]

/** Chegirmali summa shu qadamga pastga yaxlitlanadi — mijoz foydasiga, yumaloq raqam */
const PRICE_STEP = 1_000

export function prepayDiscountPct(months: number): number {
  return PREPAY_DISCOUNTS.find((d) => months >= d.months)?.pct ?? 0
}

/** Hisob-faktura summasi: oylik narx × oy, oldindan to'lov chegirmasi bilan (so'm) */
export function planPrice(plan: PlanName, months: number): number {
  const full = PLAN_MONTHLY_PRICE[plan] * months
  return Math.floor((full * (100 - prepayDiscountPct(months))) / 100 / PRICE_STEP) * PRICE_STEP
}

/**
 * Yangi do'kon shu tarifda shuncha kun bepul ishlaydi (karta so'ralmaydi);
 * keyin to'lov, aks holda imtiyozdan so'ng faqat o'qish.
 */
export const TRIAL_PLAN: PlanName = 'business'
export const TRIAL_DAYS = 14
