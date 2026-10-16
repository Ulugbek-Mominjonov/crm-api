import { describe, expect, it } from 'vitest'
import { base32Decode, base32Encode, generateTotpSecret, otpauthUrl, totpCode, totpStep, verifyTotp } from './totp'

/** RFC 6238 ilovasi B: sir "12345678901234567890" (ASCII), SHA-1, 8 raqamli kodlarning oxirgi 6 tasi */
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))
const RFC_VECTORS: [sec: number, code8: string][] = [
  [59, '94287082'],
  [1_111_111_109, '07081804'],
  [1_111_111_111, '14050471'],
  [1_234_567_890, '89005924'],
  [2_000_000_000, '69279037'],
  [20_000_000_000, '65353130'],
]

describe('TOTP (RFC 6238)', () => {
  it('base32: aylantirish va qaytarish, kichik harf, bo‘shliq va `=` to‘ldirish qabul qilinadi', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255])
    const encoded = base32Encode(bytes)
    expect(base32Decode(encoded)).toEqual(bytes)
    expect(base32Decode(`${encoded.toLowerCase()} ==`)).toEqual(bytes)
    expect(() => base32Decode('ABC1')).toThrow()
  })

  it('RFC 6238 test vektorlari (SHA-1, 30 s) — 6 raqamli kod 8 raqamlining oxiri', () => {
    for (const [sec, code8] of RFC_VECTORS) {
      expect(totpCode(RFC_SECRET, totpStep(sec * 1000))).toBe(code8.slice(-6))
    }
  })

  it('tekshirish: joriy qadam va ±1 qadam o‘tadi, ±2 o‘tmaydi; qaytgan qiymat — mos qadam', () => {
    const now = 1_234_567_890_000
    const step = totpStep(now)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step), null, now)).toBe(step)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), null, now)).toBe(step - 1)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), null, now)).toBe(step + 1)
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), null, now)).toBeNull()
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), null, now)).toBeNull()
  })

  it('bir martalik: ishlatilgan qadamdan kichik yoki teng kod qayta o‘tmaydi', () => {
    const now = 1_234_567_890_000
    const step = totpStep(now)
    const code = totpCode(RFC_SECRET, step)
    expect(verifyTotp(RFC_SECRET, code, step, now)).toBeNull()
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), step, now)).toBeNull()
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), step, now)).toBe(step + 1)
  })

  it('shakli noto‘g‘ri kod (harf, 5 raqam, bo‘sh) — darhol rad', () => {
    expect(verifyTotp(RFC_SECRET, '12345')).toBeNull()
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBeNull()
    expect(verifyTotp(RFC_SECRET, '')).toBeNull()
  })

  it('yangi sir — 32 belgi base32 (20 bayt), har safar boshqa; otpauth manzili ilova formatida', () => {
    const a = generateTotpSecret()
    const b = generateTotpSecret()
    expect(a).toMatch(/^[A-Z2-7]{32}$/)
    expect(a).not.toBe(b)
    const url = otpauthUrl(a, 'owner@workspaces.uz', 'CRM egasi')
    expect(url).toBe(`otpauth://totp/CRM%20egasi:owner%40workspaces.uz?secret=${a}&issuer=CRM+egasi&algorithm=SHA1&digits=6&period=30`)
  })
})
