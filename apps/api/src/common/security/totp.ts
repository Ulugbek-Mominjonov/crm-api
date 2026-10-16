import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * TOTP (RFC 6238) — Google Authenticator, Aegis, 1Password va boshqa
 * ilovalar bilan mos: SHA-1, 6 raqam, 30 soniya. Kutubxonasiz: algoritm
 * 30 qator, bog'liqlik esa yangilanish va ta'minot zanjiri xavfi.
 */
export const TOTP_DIGITS = 6
export const TOTP_PERIOD_SEC = 30
/** Soat farqi uchun: joriy qadamdan bittasi oldin va keyin ham qabul qilinadi (±30 s) */
export const TOTP_WINDOW = 1
/** Sir — 20 bayt (160 bit, SHA-1 blokiga mos; RFC 4226 tavsiyasi) */
const SECRET_BYTES = 20
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const CODE_PATTERN = /^\d{6}$/

/** Yangi sir — base32 (ilovaga qo'lda kiritish uchun ham shu) */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES))
}

/** Autentifikator ilovasi QR kodidan o'qiydigan manzil (`issuer` va `label` ekranlanadi) */
export function otpauthUrl(secret: string, label: string, issuer: string): string {
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SEC) })
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?${params.toString()}`
}

/** Vaqt qadami: Unix soniya / 30 */
export function totpStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SEC)
}

/** Berilgan qadam uchun kod (RFC 4226 HOTP dinamik kesish) */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary = ((digest[offset]! & 0x7f) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

/**
 * Kodni tekshiradi: mos kelgan qadamni qaytaradi, mos kelmasa `null`.
 * `afterStep` — oxirgi ishlatilgan qadam: undan katta bo'lmagan qadam
 * qabul qilinmaydi (kod bir martalik — ushlab olingan kod qayta o'tmaydi).
 */
export function verifyTotp(secret: string, code: string, afterStep: number | null = null, nowMs = Date.now()): number | null {
  const given = code.trim()
  if (!CODE_PATTERN.test(given)) return null
  const current = totpStep(nowMs)
  const givenBuf = Buffer.from(given)
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = current + delta
    if (afterStep !== null && step <= afterStep) continue
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), givenBuf)) return step
  }
  return null
}

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '')
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch)
    if (idx < 0) throw new Error('base32: noto‘g‘ri belgi')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}
