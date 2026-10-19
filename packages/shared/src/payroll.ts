/**
 * Maosh hisobi (T-142): har xodim uchun bitta varaq — hisoblangan maosh,
 * savdodan bonus, mukofot/jarima (ishlab topilgani) va to'lovlar (avans,
 * maosh). Qoldiq = ishlab topilgani − to'langani: musbat — do'kon xodimga
 * qarz, manfiy — xodim oldindan (avans) olgan.
 *
 * Hisoblash davri — O'TGAN OY: xodimning «hisoblash kuni» (sukut — oyning
 * 1-si) kelganda o'tgan oy uchun maosh va bonus yoziladi; yozuv sanasi —
 * o'sha oyning oxirgi kuni, shuning uchun oy foydasiga o'sha oy xarajati
 * sifatida tushadi. Server (tungi ish) va brauzer (oldindan ko'rish) bir
 * xil hisobni ishlatadi — funksiyalar sof.
 */

export const PAYROLL_ACCRUAL_TYPES = ['salary', 'bonus', 'award', 'penalty'] as const
export const PAYROLL_PAYMENT_TYPES = ['advance', 'payment'] as const
export type PayrollAccrualType = (typeof PAYROLL_ACCRUAL_TYPES)[number]
export type PayrollPaymentType = (typeof PAYROLL_PAYMENT_TYPES)[number]
export type PayrollEntryType = PayrollAccrualType | PayrollPaymentType

/** Hisoblash kuni: oyning 1–28 kuni (fevral ham bor) */
export const MIN_SALARY_DAY = 1
export const MAX_SALARY_DAY = 28

const MS_PER_DAY = 86_400_000

export function isPayrollPayment(type: PayrollEntryType): type is PayrollPaymentType {
  return (PAYROLL_PAYMENT_TYPES as readonly string[]).includes(type)
}

/** Yozuvning ishlab topilgan summaga ta'siri: +1 (maosh, bonus, mukofot), −1 (jarima), 0 (to'lov) */
export function earnedSign(type: PayrollEntryType): -1 | 0 | 1 {
  if (type === 'penalty') return -1
  return isPayrollPayment(type) ? 0 : 1
}

/** Oy: `key` — `YYYY-MM`, `start`/`end` — `YYYY-MM-DD`, `days` — oydagi kunlar */
export interface PayrollPeriod {
  key: string
  start: string
  end: string
  days: number
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `YYYY-MM` → davr */
export function monthPeriod(key: string): PayrollPeriod {
  const [y, m] = key.split('-').map(Number) as [number, number]
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { key, start: `${key}-01`, end: `${key}-${pad(days)}`, days }
}

/** `YYYY-MM-DD` → o'tgan oy kaliti */
export function previousMonth(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
}

/** Bugun hisoblanadigan davr — o'tgan oy */
export function accrualPeriod(today: string): PayrollPeriod {
  return monthPeriod(previousMonth(today))
}

/**
 * Davrda hisoblanadigan kunlar: `from` (ishga kirgan kun yoki hisob
 * boshlanishi `payrollFrom` — qaysi kech bo'lsa) dan oy oxirigacha;
 * to'liq oy — oydagi kunlar
 */
export function workedDays(from: string, period: PayrollPeriod): number {
  if (from <= period.start) return period.days
  if (from > period.end) return 0
  return Math.round((Date.parse(period.end) - Date.parse(from)) / MS_PER_DAY) + 1
}

/** Oylik maosh davr uchun: qisman oy — kunlarga mutanosib, butun so'mgacha */
export function proratedSalary(salary: number, from: string, period: PayrollPeriod): number {
  const days = workedDays(from, period)
  if (days >= period.days) return Math.round(salary)
  return Math.round((salary * days) / period.days)
}

/** Savdodan bonus: asos (sotuvlar − qaytarishlar) × foiz; manfiy asos — bonus yo'q */
export function salesBonus(base: number, pct: number): number {
  if (base <= 0 || pct <= 0) return 0
  return Math.round((base * pct) / 100)
}

export interface PayrollTotals {
  /** Ishlab topilgani: maosh + bonus + mukofot − jarima */
  earned: number
  /** To'langani: avans + maosh to'lovi */
  paid: number
  /** Qoldiq: do'kon xodimga qarz (musbat) yoki xodim oldindan olgan (manfiy) */
  balance: number
}

/** Yozuvlar yig'indisi — varaq qatori va xodim kartasi uchun */
export function payrollTotals(entries: ReadonlyArray<{ type: PayrollEntryType; amount: number }>): PayrollTotals {
  let earned = 0
  let paid = 0
  for (const { type, amount } of entries) {
    if (isPayrollPayment(type)) paid += amount
    else earned += earnedSign(type) * amount
  }
  return { earned, paid, balance: earned - paid }
}
