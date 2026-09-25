/**
 * Do'kon ishlaydigan vaqt mintaqasi. Hujjat sanasi (`date` ustunlari) shu
 * bo'yicha: Toshkentda tunda 01:00 dagi sotuv UTC bo'yicha KECHAGI kunga
 * tushib qolmasin — kunlik hisobotlar kassadagi kun bilan mos bo'lsin.
 * O'zbekistonda yozgi vaqt yo'q (UTC+5). Ko'p mintaqali SaaS'da bu tenant
 * sozlamasiga ko'chadi.
 */
export const BUSINESS_TIME_ZONE = 'Asia/Tashkent'

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Joriy biznes sanasi: `YYYY-MM-DD` (en-CA formati aynan shunday) */
export function businessDate(now: Date = new Date()): string {
  return formatter.format(now)
}

const offsetFormatter = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, timeZoneName: 'longOffset' })

/**
 * Biznes kuni (`YYYY-MM-DD`) boshlanadigan vaqt nuqtasi — `timestamptz`
 * ustunlarni (jurnal) kun bo'yicha filtrlash uchun: Toshkentdagi 00:00.
 */
export function businessDayStart(date: string): Date {
  const zone = offsetFormatter.formatToParts(new Date(`${date}T12:00:00Z`)).find((p) => p.type === 'timeZoneName')?.value
  // `GMT+05:00` → `+05:00`; UTC mintaqasida faqat `GMT`
  const offset = zone && zone !== 'GMT' ? zone.slice(3) : 'Z'
  return new Date(`${date}T00:00:00${offset}`)
}

/** `@db.Date` ustuni uchun: biznes sanasi UTC yarim tunda */
export function businessDay(now: Date = new Date()): Date {
  return new Date(`${businessDate(now)}T00:00:00.000Z`)
}

/**
 * Biznes sanasi — `Date` ning MAHALLIY maydonlari (`getDate`, `getDay`…)
 * bilan o'qiladigan ko'rinishda. Frontenddan olingan sof funksiyalar
 * (`isTemplateDue`, `periodKey`) mahalliy vaqt bilan ishlaydi, server
 * jarayoni esa UTC da bo'lishi mumkin. Tush payti — kun chegarasidan uzoq.
 */
export function businessCalendarDate(now: Date = new Date()): Date {
  return new Date(`${businessDate(now)}T12:00:00`)
}

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` ± kun (kalendar arifmetikasi, vaqt zonasiz) */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Oraliqdagi kunlar soni — ikki chegara ham kiradi */
export function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1
}
