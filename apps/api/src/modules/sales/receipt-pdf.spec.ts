import type { ReceiptDto, SaleItemDto } from './dto/sale.dto'
import { receiptPdf } from './receipt-pdf'

/** Chek PDF (09 §9.13) — 80 mm termal lenta, balandlik mazmunga teng */
const MM_80 = 226.77

const item = (i: number, over: Partial<SaleItemDto> = {}): SaleItemDto => ({
  id: `i${i}`, productId: `p${i}`, name: `Sement M400 ${i}`, unit: 'qop', qty: 3, baseQty: 150,
  price: 60_000, cost: 45_000, discount: 0, returnOfId: null, returnedQty: 0, ...over,
})

const receipt = (items: SaleItemDto[], over: Partial<ReceiptDto> = {}): ReceiptDto => ({
  store: { name: 'Qurilish Mollari', phone: '+998712000000', address: 'Toshkent', footer: 'Rahmat!', currency: 'so‘m' },
  sale: {
    id: 's1', number: 'CHEK-1042', type: 'sale', status: 'completed', customerId: null, sellerId: null, warehouseId: null,
    priceTier: 'retail', subtotal: 180_000, discount: 0, taxRate: 0, tax: 0, deliveryFee: 0, total: 180_000,
    paid: { cash: 200_000, card: 0, transfer: 0 }, change: 20_000, debtPaid: 0, outstanding: 0, dueDate: null,
    date: '2026-09-27', relatedSaleId: null, bonusUsed: 0, bonusEarned: 0, createdAt: new Date(), cancelledAt: null,
    items, delivery: null,
  },
  customer: null,
  seller: { id: 'e1', name: 'Bobur' },
  fiscal: null,
  ...over,
})

/** `/MediaBox [0 0 w h]` — sahifa o'lchami */
const pageSize = (pdf: Buffer): { width: number; height: number } => {
  const match = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf.toString('latin1'))
  if (!match) throw new Error('MediaBox topilmadi')
  return { width: Number(match[1]), height: Number(match[2]) }
}

describe('receiptPdf', () => {
  it('bitta sahifali PDF: 80 mm kenglik, shrift ichiga joylangan', async () => {
    const pdf = await receiptPdf(receipt([item(1)]))
    const text = pdf.toString('latin1')
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1)
    expect(pageSize(pdf).width).toBeCloseTo(MM_80, 1)
    // O‘zbek (o‘, g‘) va kirill harflari uchun — standart Helvetica emas, TTF
    expect(text).toContain('/FontFile2')
  })

  it('lenta balandligi mazmunga teng: qator qo‘shilsa uzayadi, bo‘sh qog‘oz qolmaydi', async () => {
    const short = pageSize(await receiptPdf(receipt([item(1)]))).height
    const long = pageSize(await receiptPdf(receipt(Array.from({ length: 20 }, (_, i) => item(i))))).height
    expect(long).toBeGreaterThan(short + 19 * 15)
    expect(short).toBeLessThan(400)
  })

  it('fiskal belgi va QR chekka qo‘shiladi', async () => {
    const plain = pageSize(await receiptPdf(receipt([item(1)]))).height
    const fiscal = await receiptPdf(
      receipt([item(1)], {
        fiscal: { status: 'confirmed', fiscalId: 'FP-42', qrPayload: 'https://ofd.uz/check?FP-42', fiscalizedAt: new Date() },
      }),
    )
    expect(pageSize(fiscal).height).toBeGreaterThan(plain + 80)
  })
})
