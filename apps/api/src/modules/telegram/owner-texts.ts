import type { RequestType } from '@/modules/account/dto/tenant-request.dto'
import { escapeHtml } from './telegram-texts'

const REQUEST_TYPE_LABEL: Record<RequestType, string> = { unblock: 'blokdan chiqarish', billing: 'to‘lov', other: 'boshqa' }

/** Egasiga ketadigan xabarlar (T-137, T-140) — HTML; do'kon, odam nomlari va matnlar ekranlanadi */
export const OWNER_TEXT = {
  linked: (name: string) =>
    `✅ <b>${escapeHtml(name)}</b>, egasi paneli xabarlari endi shu yerga keladi: yangi do‘kon, onlayn to‘lov, o‘chirish so‘rovi, do‘kon murojaati.`,
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
} as const

/** 1250000 → "1 250 000" */
function formatSum(amount: number): string {
  return Math.round(amount).toLocaleString('ru-RU').replaceAll(' ', ' ')
}
