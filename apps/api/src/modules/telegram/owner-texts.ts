import { BUSINESS_TIME_ZONE } from '@/common/time'
import type { RequestType } from '@/modules/account/dto/tenant-request.dto'
import { escapeHtml } from './telegram-texts'

const REQUEST_TYPE_LABEL: Record<RequestType, string> = { unblock: 'blokdan chiqarish', billing: 'to‘lov', other: 'boshqa' }

/** Egasiga ketadigan xabarlar (T-137, T-140) — HTML; do'kon, odam nomlari va matnlar ekranlanadi */
export const OWNER_TEXT = {
  linked: (name: string) =>
    `✅ <b>${escapeHtml(name)}</b>, egasi paneli xabarlari endi shu yerga keladi: yangi do‘kon, to‘lovlar (karta to‘lovini shu yerda tasdiqlaysiz), o‘chirish so‘rovi, do‘kon murojaati.`,
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
  /** Do'kon murojaati (T-140): nima haqida, blok sababi (bo'lsa), kim va telefoni, matn */
  requestCreated: (input: { store: string; blockedReason: string | null; type: RequestType; authorName: string; phone: string | null; message: string }) =>
    `📨 <b>Murojaat:</b> ${escapeHtml(input.store)} — ${REQUEST_TYPE_LABEL[input.type]}\n` +
    (input.blockedReason ? `🔒 Blok sababi: ${escapeHtml(input.blockedReason)}\n` : '') +
    `👤 ${escapeHtml(input.authorName)}${input.phone ? `, ${escapeHtml(input.phone)}` : ''}\n\n` +
    `${escapeHtml(input.message)}\n\n` +
    `Javob — egasi panelida, «Murojaatlar».`,
  requestMessage: (input: { store: string; type: RequestType; authorName: string; message: string }) =>
    `💬 <b>Murojaatga xabar:</b> ${escapeHtml(input.store)} — ${REQUEST_TYPE_LABEL[input.type]}\n` +
    `👤 ${escapeHtml(input.authorName)}\n\n` +
    escapeHtml(input.message),
  /** Karta to'lovi da'vosi (T-149): nimani bankdagi tushum bilan solishtirish kerak — summa, karta, vaqt */
  cardClaimed: (input: { store: string; amount: number; plan: string; months: number; payerCard: string; transferredAt: Date; note: string | null }) =>
    `💳 <b>Karta to‘lovi — tekshiring:</b> ${escapeHtml(input.store)}\n` +
    `${formatSum(input.amount)} so‘m — <b>${escapeHtml(input.plan)}</b>, ${input.months} oy\n` +
    `Karta •••• ${escapeHtml(input.payerCard)}, ${formatTime(input.transferredAt)}\n` +
    (input.note ? `💬 ${escapeHtml(input.note)}\n` : '') +
    `\nBankdagi tushum bilan solishtirib tasdiqlang.`,
} as const

/** Egasi tugmasi natijasi (T-149) — ODDIY matn (HTML emas): bildirish va chatdagi javob */
export const OWNER_ACTION_TEXT = {
  confirmed: (store: string, plan: string, until: Date) => `✅ Tasdiqlandi: ${store} — ${plan}, ${formatDate(until)} gacha`,
  rejected: (store: string) => `❌ Rad etildi: ${store}. Do‘kon sababni ko‘radi va qayta yuborishi mumkin`,
  alreadyPaid: (store: string) => `Allaqachon tasdiqlangan: ${store}`,
  alreadyClosed: (store: string) => `Bu to‘lov endi tekshiruvda emas: ${store}`,
  notFound: 'Hisob-faktura topilmadi',
} as const

const DATE = new Intl.DateTimeFormat('ru-RU', { timeZone: BUSINESS_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' })
const TIME = new Intl.DateTimeFormat('ru-RU', { timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', minute: '2-digit' })

/** Toshkent vaqti: `20.10.2026` */
function formatDate(at: Date): string {
  return DATE.format(at)
}

/** Toshkent vaqti: `20.10.2026 14:32` */
function formatTime(at: Date): string {
  return `${DATE.format(at)} ${TIME.format(at)}`
}

/** 1250000 → "1 250 000" */
function formatSum(amount: number): string {
  return Math.round(amount).toLocaleString('ru-RU').replaceAll(' ', ' ')
}
