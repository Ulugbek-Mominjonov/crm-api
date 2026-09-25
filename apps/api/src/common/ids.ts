import { createHash, randomBytes } from 'node:crypto'

/** `rand_a` maydoni (12 bit) — bir millisekund ichidagi hisoblagich */
const MAX_SEQ = 0xfff
/** Yangi millisekundda hisoblagich tasodifiy, lekin yuqori yarmi bo'sh — o'sishga joy */
const SEQ_SEED_MASK = 0x7ff

let lastMs = 0
let seq = 0

/**
 * UUID v7 — sxemadagi `@default(uuid(7))` bilan bir xil ko'rinish.
 *
 * Ommaviy yozishda id oldindan kerak: `createMany` qaytargan qatorlar
 * tartibiga tayanmasdan har bir harakatni o'z id'si bilan bog'lash uchun.
 * Boshidagi 48 bit — millisekund vaqt: indeksda yangi yozuvlar oxiriga
 * tushadi (v4 kabi tasodifiy sochilmaydi).
 *
 * Jarayon ichida MONOTON (RFC 9562 §6.2, 1-usul): bir millisekundda
 * yaratilganlar `rand_a` hisoblagichi bilan o'sib boradi — bitta amalning
 * harakatlari (`transfer_out`, keyin `transfer_in`) id bo'yicha ham shu
 * tartibda. Soat orqaga ketsa ham id kamaymaydi.
 */
export function uuidv7(now: number = Date.now()): string {
  if (now > lastMs) {
    lastMs = now
    seq = randomBytes(2).readUInt16BE() & SEQ_SEED_MASK
  } else if (seq < MAX_SEQ) {
    seq++
  } else {
    // Bir millisekundda 2048+ id — keyingi millisekundni "qarzga" olamiz
    lastMs++
    seq = 0
  }

  const bytes = randomBytes(16)
  let ts = BigInt(lastMs)
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(ts & 0xffn)
    ts >>= 8n
  }
  bytes[6] = 0x70 | (seq >> 8) // versiya 7 + hisoblagichning yuqori 4 biti
  bytes[7] = seq & 0xff
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 varianti
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * UUID v5 (RFC 9562 §5.5) — nom va nomlar fazosidan DETERMINISTIK id.
 *
 * Migratsiya importi (T-108): brauzerdagi `pr_lx9f2a3` → har doim o'sha
 * UUID (nomlar fazosi — tenant). Havolalar xaritasiz tiklanadi, qayta
 * import esa `ON CONFLICT DO NOTHING` bilan ikkilanmaydi.
 */
export function uuidv5(name: string, namespace: string): string {
  const bytes = createHash('sha1')
    .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
    .update(name, 'utf8')
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x50 // versiya 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 varianti
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
