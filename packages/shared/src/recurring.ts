import type { ExpenseTemplate } from './types'

/**
 * Takrorlanuvchi xarajatlar (ijara, maosh, internet...).
 *
 * Har oy qo'lda kiritish o'rniga shablon sozlanadi. Ilova ochilganda
 * muddati kelgan shablonlar bo'yicha xarajat avtomatik yaratiladi.
 *
 * Takroriy yaratishning oldini olish uchun har bir shablonda `lastRunKey`
 * saqlanadi — bu shablon oxirgi marta qaysi DAVR uchun ishlaganini bildiradi
 * ('2026-08' yoki '2026-W32'). Ilova kuniga o'n marta ochilsa ham xarajat
 * bir marta yaratiladi.
 */

/** Yilning ISO hafta raqami (dushanbadan boshlanadi) */
export function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  )
  // Payshanbaga siljitamiz — ISO haftasi shu kun bo'yicha aniqlanadi
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Shablon uchun joriy davr kaliti */
export function periodKey(tpl: ExpenseTemplate, now: Date): string {
  if (tpl.period === 'weekly') return isoWeekKey(now)
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Joriy davrda shablon kuni allaqachon kelganmi? */
function dayReached(tpl: ExpenseTemplate, now: Date): boolean {
  if (tpl.period === 'weekly') {
    const dow = now.getDay() || 7 // dushanba=1 ... yakshanba=7
    return dow >= Math.min(7, Math.max(1, tpl.dayOfPeriod))
  }
  return now.getDate() >= Math.min(28, Math.max(1, tpl.dayOfPeriod))
}

/** Shu shablon bo'yicha hozir xarajat yaratish kerakmi? */
export function isTemplateDue(tpl: ExpenseTemplate, now: Date): boolean {
  if (!tpl.active) return false
  if (!dayReached(tpl, now)) return false
  return tpl.lastRunKey !== periodKey(tpl, now)
}

/** Muddati kelgan shablonlarni ajratadi */
export function dueTemplates(
  templates: ExpenseTemplate[],
  now: Date,
): ExpenseTemplate[] {
  return templates.filter((t) => isTemplateDue(t, now))
}
