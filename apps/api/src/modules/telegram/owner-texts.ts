import { escapeHtml } from './telegram-texts'

/** Egasiga ketadigan xabarlar (T-137) — HTML; do'kon va odam nomlari ekranlanadi */
export const OWNER_TEXT = {
  linked: (name: string) =>
    `✅ <b>${escapeHtml(name)}</b>, egasi paneli xabarlari endi shu yerga keladi: yangi do‘kon, onlayn to‘lov, o‘chirish so‘rovi.`,
  registered: (input: { store: string; ownerName: string; phone: string; email: string }) =>
    `🆕 <b>Yangi do‘kon:</b> ${escapeHtml(input.store)}\n` +
    `👤 ${escapeHtml(input.ownerName)}, ${escapeHtml(input.phone)}\n` +
    `✉️ ${escapeHtml(input.email)}`,
  paid: (input: { store: string; amount: number; plan: string; months: number; provider: string }) =>
    `💳 <b>To‘lov:</b> ${escapeHtml(input.store)}\n` +
    `${formatSum(input.amount)} so‘m — <b>${escapeHtml(input.plan)}</b>, ${input.months} oy (${escapeHtml(input.provider)})`,
  deletionRequested: (input: { store: string; days: number }) =>
    `🗑 <b>O‘chirish so‘rovi:</b> ${escapeHtml(input.store)}\n` +
    `Do‘kon administratori o‘chirishni so‘radi — ${input.days} kundan keyin butunlay o‘chadi. Egasi panelida qaytarish mumkin.`,
} as const

/** 1250000 → "1 250 000" */
function formatSum(amount: number): string {
  return Math.round(amount).toLocaleString('ru-RU').replaceAll(' ', ' ')
}
