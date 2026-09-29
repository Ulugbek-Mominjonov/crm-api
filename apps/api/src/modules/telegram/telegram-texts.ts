/**
 * Bot javoblari (mijoz o'qiydi) — bir joyda. Telegram HTML: xodim kiritgan
 * matn (do'kon nomi, mijoz ismi) har doim ekranlanadi.
 */
export const BOT_TEXT = {
  noLink:
    '👋 Assalomu alaykum!\n\nDo‘kon xabarlarini shu yerda olish uchun sotuvchidan <b>shaxsiy QR kodingizni</b> ' +
    'so‘rang va uni telefon kamerasi bilan skanerlang.',
  badLink: '⚠️ Havola eskirgan yoki allaqachon ishlatilgan.\nSotuvchidan yangi QR kod so‘rang.',
  linked: (store: string, name: string) =>
    `✅ <b>Tayyor, ${escapeHtml(name)}!</b>\n\n<b>${escapeHtml(store)}</b> xabarlari — qarz eslatmalari, cheklar, ` +
    'aksiyalar va bonuslar — endi shu yerga keladi.',
  alreadyLinked: '✅ Siz ulangansiz — do‘kon xabarlari va cheklar shu yerga keladi.',
  help: '🤖 Bu bot do‘kon xabarlari va cheklarini yetkazadi. Ulanish — sotuvchi bergan shaxsiy QR kod orqali.',
} as const

/** Xabar kartasi uchun do'kon ma'lumoti (sozlamadan — chekdagi bilan bir xil) */
export interface StoreCard {
  storeName: string
  receiptPhone: string
  receiptAddress: string
}

/**
 * Do'kon xabari (HTML): bot hamma do'konlar uchun bitta — tepada do'kon
 * nomi, pastda aloqa (chekdagi telefon va manzil, bo'lsa). `bodyHtml` —
 * tayyor HTML (`renderTelegram`).
 *
 *   🏪 Qurilish Mollari
 *
 *   Hurmatli Ali, qarzingiz 1 250 000 so‘m.
 *
 *   📞 +998 90 123 45 67
 *   📍 Chilonzor 5
 */
export function storeMessage(store: StoreCard, bodyHtml: string): string {
  const contacts = [
    store.receiptPhone && `📞 ${escapeHtml(store.receiptPhone)}`,
    store.receiptAddress && `📍 ${escapeHtml(store.receiptAddress)}`,
  ].filter(Boolean)
  return [`🏪 <b>${escapeHtml(store.storeName)}</b>`, bodyHtml, contacts.join('\n')].filter(Boolean).join('\n\n')
}

/** Telegram HTML'ida maxsus belgilar: `<`, `>`, `&` */
export function escapeHtml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
