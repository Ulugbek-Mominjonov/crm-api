import type { ReceiptDto, SaleDto } from './dto/sale.dto'
import { receiptCaption } from './receipt-telegram'

/** Telegram'dagi chek izohi (Q116): turi, holati, qarz va bonusga qarab */
const receipt = (sale: Partial<SaleDto>, store: Partial<ReceiptDto['store']> = {}): ReceiptDto =>
  ({
    store: { name: 'Qurilish Mollari', phone: '', address: '', footer: '', currency: "so'm", ...store },
    sale: {
      number: 'CHEK-1042', type: 'sale', status: 'completed', date: '2026-09-29', total: 188_600, outstanding: 0,
      dueDate: null, bonusEarned: 0, ...sale,
    },
    customer: null,
    seller: null,
    fiscal: null,
  }) as ReceiptDto

const plain = (s: string): string => s.replace(/\s/g, ' ')

describe('receiptCaption', () => {
  it('to‘langan chek: raqam, sana, do‘kon, jami; bonus bo‘lsa — u ham', () => {
    expect(plain(receiptCaption(receipt({ bonusEarned: 1_886 })))).toBe(plain(
      "🧾 Chek <b>CHEK-1042</b> · 29.09.2026\n🏪 Qurilish Mollari\n\n💰 Jami: <b>188 600</b> so'm\n✅ To‘langan\n🎁 Bonus: +1 886",
    ))
  })

  it('nasiya: qolgan qarz va muddat', () => {
    expect(plain(receiptCaption(receipt({ status: 'pending', outstanding: 50_000, dueDate: '2026-10-20' })))).toContain(
      plain("⏳ Qarz: <b>50 000</b> so'm · muddat 20.10.2026"),
    )
  })

  it('qaytarish va bekor qilingan chek; do‘kon nomi ekranlanadi', () => {
    expect(plain(receiptCaption(receipt({ type: 'return', number: 'QAYT-7' }, { name: 'A & B' })))).toBe(plain(
      "↩️ Qaytarish <b>QAYT-7</b> · 29.09.2026\n🏪 A &amp; B\n\n💰 Qaytarilgan: <b>188 600</b> so'm",
    ))
    expect(receiptCaption(receipt({ status: 'cancelled' }))).toContain('❌ Bekor qilingan')
  })
})
