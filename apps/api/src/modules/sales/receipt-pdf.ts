import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lineTotal } from '@crm/shared'
import type { ProductUnit, SaleType } from '@prisma/client'
import PDFDocument from 'pdfkit'
import qrcode from 'qrcode-generator'
import type { ReceiptDto, SalePaidDto } from './dto/sale.dto'

/**
 * Chek PDF (09 §9.13) — brauzerdagi termal chek (`Receipt.tsx`, 80 mm)
 * ko'rinishida: bir xil bo'limlar, yozuvlar va raqam formati.
 *
 * Chromium (`puppeteer-core`) o'rniga `pdfkit`: bepul instansiyada ham
 * ishlaydi (xotira ~MB, bir chek — millisekundlar). Shrift — DejaVu Sans
 * Mono: lotin (o‘, g‘), kirill (ў, қ, ғ, ҳ) va `m²` bir shriftda.
 */

const PT_PER_MM = 72 / 25.4
/** Lenta kengligi — brauzerdagi `w-[80mm]` */
const PAGE_WIDTH = 80 * PT_PER_MM
/** `p-3` */
const PADDING = 9
const CONTENT_WIDTH = PAGE_WIDTH - 2 * PADDING
/** `text-[11px]` va `text-sm` (pt) */
const TEXT_SIZE = 8.25
const TITLE_SIZE = 10.5
/** `leading-tight` — qatorlar orasidagi qo'shimcha bo'shliq */
const LINE_GAP = 1.5
/** `my-2` — ajratuvchi chiziq atrofida */
const DIVIDER_GAP = 6
/** Nom va qiymat orasidagi eng kam masofa (qiymat o'ngga tekislanadi) */
const COLUMN_GAP = 6
/** Kasr o'lchov xatosida so'z keyingi qatorga tushib qolmasin */
const WIDTH_SLACK = 1
const QR_SIZE = 30 * PT_PER_MM
/** QR atrofidagi bo'sh joy (modullarda) — skaner kodni topishi uchun */
const QR_QUIET_MODULES = 4
/** O'lchov o'tishidagi sahifa — PDF chegarasi (200 dyuym); chek undan uzun bo'lmaydi */
const MEASURE_HEIGHT = 14_400

const FONTS_DIR = join(__dirname, '../../assets/fonts')
const REGULAR_FONT = readFileSync(join(FONTS_DIR, 'DejaVuSansMono.ttf'))
const BOLD_FONT = readFileSync(join(FONTS_DIR, 'DejaVuSansMono-Bold.ttf'))

/** Frontend `uz` lokali bilan bir xil yozuvlar */
const UNIT_LABEL: Record<ProductUnit, string> = {
  dona: 'dona', kg: 'kg', metr: 'metr', m2: 'm²', m3: 'm³', litr: 'litr', qop: 'qop', rulon: 'rulon',
}
const PAYMENT_LABEL: Record<keyof SalePaidDto, string> = { cash: 'Naqd', card: 'Karta', transfer: 'O‘tkazma' }
const SALE_TYPE_LABEL: Record<SaleType, string> = { sale: 'Sotuv', return: 'Qaytarish' }
const MIXED_PAYMENT = 'Aralash'
const WALK_IN_CUSTOMER = 'Naqd xaridor'

const moneyFormat = new Intl.NumberFormat('uz-UZ')
/** Chekdagi summa ko'rinishi — Telegram izohi ham shu (`receipt-telegram.ts`) */
export const money = (n: number): string => moneyFormat.format(n)
/** `YYYY-MM-DD` → `DD.MM.YYYY` (frontend `formatDate`) */
export const day = (date: string): string => date.split('-').reverse().join('.')

interface TextStyle {
  bold?: boolean
  size?: number
}

/**
 * Yuqoridan pastga yozuvchi: har chaqiruv o'lchangan balandlikka suriladi.
 * Sahifa balandligi oldindan noma'lum — shuning uchun avval o'lchanadi.
 */
class ReceiptWriter {
  private y = PADDING

  constructor(private readonly doc: PDFKit.PDFDocument) {}

  get bottom(): number {
    return this.y + PADDING
  }

  center(text: string, style: TextStyle = {}): void {
    this.write(text, PADDING, CONTENT_WIDTH, 'center', style)
  }

  left(text: string, style: TextStyle = {}): void {
    this.write(text, PADDING, CONTENT_WIDTH, 'left', style)
  }

  /**
   * `flex justify-between`: nom chapda, qiymat o'ngda. Nom qiymatga joy
   * qoldirib o'z kengligini oladi; ikkalasi ham uzun bo'lsa — yarmidan, har
   * biri o'z ustunida o'raladi.
   */
  row(label: string, value: string, style: TextStyle = {}): void {
    this.use(style)
    const room = Math.max(CONTENT_WIDTH / 2, CONTENT_WIDTH - COLUMN_GAP - this.doc.widthOfString(value))
    const labelWidth = Math.min(this.doc.widthOfString(label) + WIDTH_SLACK, room)
    const valueWidth = CONTENT_WIDTH - labelWidth - COLUMN_GAP
    const top = this.y
    const labelHeight = this.measure(label, labelWidth)
    const valueHeight = this.measure(value, valueWidth)
    this.doc.text(label, PADDING, top, { width: labelWidth, lineGap: LINE_GAP })
    this.doc.text(value, PADDING + labelWidth + COLUMN_GAP, top, { width: valueWidth, align: 'right', lineGap: LINE_GAP })
    this.y = top + Math.max(labelHeight, valueHeight)
  }

  divider(): void {
    const y = this.y + DIVIDER_GAP
    this.doc
      .moveTo(PADDING, y)
      .lineTo(PADDING + CONTENT_WIDTH, y)
      .lineWidth(0.5)
      .dash(2, { space: 2 })
      .stroke()
      .undash()
    this.y = y + DIVIDER_GAP
  }

  /** Fiskal chek QR'i (08 §8.9) — vektor kvadratlar, markazda, tepa-pastida bo'sh joy bilan */
  qr(payload: string): void {
    const code = qrcode(0, 'M')
    code.addData(payload)
    code.make()
    const count = code.getModuleCount()
    const cell = QR_SIZE / count
    const quiet = QR_QUIET_MODULES * cell
    const left = PADDING + (CONTENT_WIDTH - QR_SIZE) / 2
    const top = this.y + quiet
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (code.isDark(row, col)) this.doc.rect(left + col * cell, top + row * cell, cell, cell)
      }
    }
    this.doc.fill('black')
    this.y = top + QR_SIZE + quiet
  }

  private write(text: string, x: number, width: number, align: 'left' | 'center', style: TextStyle): void {
    this.use(style)
    const height = this.measure(text, width)
    this.doc.text(text, x, this.y, { width, align, lineGap: LINE_GAP })
    this.y += height
  }

  private measure(text: string, width: number): number {
    return this.doc.heightOfString(text, { width, lineGap: LINE_GAP })
  }

  private use({ bold = false, size = TEXT_SIZE }: TextStyle): void {
    this.doc.font(bold ? 'bold' : 'regular').fontSize(size)
  }
}

/** Chek mazmuni — brauzerdagi chek tartibida (+ nasiya qarzi va fiskal QR) */
function drawReceipt(w: ReceiptWriter, { store, sale, customer, seller, fiscal }: ReceiptDto): void {
  w.center(store.name.toUpperCase(), { bold: true, size: TITLE_SIZE })
  if (store.address) w.center(store.address)
  if (store.phone) w.center(`Tel: ${store.phone}`)
  if (sale.status === 'cancelled') w.center('BEKOR QILINGAN', { bold: true })
  w.divider()

  w.row(sale.type === 'return' ? 'QAYTARISH:' : 'Chek:', sale.number, { bold: true })
  w.row('Sana:', day(sale.date))
  if (seller) w.row('Sotuvchi:', seller.name)
  w.row('Mijoz:', customer?.name ?? WALK_IN_CUSTOMER)
  w.divider()

  for (const item of sale.items) {
    w.left(item.name)
    const discount = item.discount > 0 ? ` −${money(item.discount)}` : ''
    w.row(`${item.qty} ${UNIT_LABEL[item.unit]} × ${money(item.price)}${discount}`, money(lineTotal(item.price, item.qty) - item.discount))
  }
  w.divider()

  w.row('Oraliq:', money(sale.subtotal))
  if (sale.discount > 0) w.row('Chegirma:', `−${money(sale.discount)}`)
  if (sale.tax > 0) w.row(`QQS (${sale.taxRate}%):`, money(sale.tax))
  if (sale.deliveryFee > 0) w.row('Yetkazish:', money(sale.deliveryFee))
  w.row('JAMI:', `${money(sale.total)} ${store.currency}`, { bold: true, size: TITLE_SIZE })
  w.divider()

  const paid = (Object.entries(sale.paid) as [keyof SalePaidDto, number][]).filter(([, amount]) => amount > 0)
  for (const [method, amount] of paid) w.row(`${PAYMENT_LABEL[method]}:`, money(amount))
  if (sale.change > 0) w.row('Qaytim:', money(sale.change))
  if (paid.length > 1) w.center(`(${MIXED_PAYMENT} to‘lov)`)
  if (sale.outstanding > 0) w.row('Qarz (nasiya):', money(sale.outstanding))
  if (sale.outstanding > 0 && sale.dueDate) w.row('To‘lov muddati:', day(sale.dueDate))
  w.divider()

  if (fiscal?.fiscalId) {
    w.center(`Fiskal belgi: ${fiscal.fiscalId}`)
    if (fiscal.qrPayload) w.qr(fiscal.qrPayload)
  }
  w.center(SALE_TYPE_LABEL[sale.type])
  if (store.footer) w.center(store.footer)
}

function newDocument(height: number, receipt: ReceiptDto): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: [PAGE_WIDTH, height],
    margin: 0,
    info: { Title: receipt.sale.number, Author: receipt.store.name },
  })
  doc.registerFont('regular', REGULAR_FONT)
  doc.registerFont('bold', BOLD_FONT)
  return doc
}

/**
 * Chek PDF'i. Lenta balandligi mazmunga teng: avval uzun sahifada o'lchanadi
 * (natija tashlanadi), keyin aniq balandlikda chiziladi — termal printer
 * ortiqcha bo'sh qog'oz chiqarmaydi.
 */
export async function receiptPdf(receipt: ReceiptDto): Promise<Buffer> {
  const measured = new ReceiptWriter(newDocument(MEASURE_HEIGHT, receipt))
  drawReceipt(measured, receipt)

  const doc = newDocument(Math.ceil(measured.bottom), receipt)
  const chunks: Buffer[] = []
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
  drawReceipt(new ReceiptWriter(doc), receipt)
  doc.end()
  return done
}
