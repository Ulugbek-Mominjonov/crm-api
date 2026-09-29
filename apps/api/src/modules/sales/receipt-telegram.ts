import { escapeHtml } from '@/modules/telegram/telegram-texts'
import type { ReceiptDto } from './dto/sale.dto'
import { day, money } from './receipt-pdf'

/**
 * Telegram'dagi chek izohi (HTML, Telegram chegarasi — 1024 belgi): PDF
 * ochilmasa ham asosiysi ko'rinadi. PDF — chop etiladigan chekning o'zi.
 *
 *   🧾 Chek CHEK-1042 · 29.09.2026
 *   🏪 Qurilish Mollari
 *
 *   💰 Jami: 188 600 so'm
 *   ⏳ Qarz: 50 000 so'm · muddat 20.10.2026
 *   🎁 Bonus: +1 886
 */
export function receiptCaption({ store, sale }: ReceiptDto): string {
  const sum = (n: number): string => `<b>${money(n)}</b> ${escapeHtml(store.currency)}`
  const head = [
    `${sale.type === 'return' ? '↩️ Qaytarish' : '🧾 Chek'} <b>${escapeHtml(sale.number)}</b> · ${day(sale.date)}`,
    `🏪 ${escapeHtml(store.name)}`,
    '',
  ]
  if (sale.status === 'cancelled') return [...head, `❌ Bekor qilingan (${sum(sale.total)})`].join('\n')
  if (sale.type === 'return') return [...head, `💰 Qaytarilgan: ${sum(sale.total)}`].join('\n')
  return [
    ...head,
    `💰 Jami: ${sum(sale.total)}`,
    sale.outstanding > 0
      ? `⏳ Qarz: ${sum(sale.outstanding)}${sale.dueDate ? ` · muddat ${day(sale.dueDate)}` : ''}`
      : '✅ To‘langan',
    ...(sale.bonusEarned > 0 ? [`🎁 Bonus: +${money(sale.bonusEarned)}`] : []),
  ].join('\n')
}
