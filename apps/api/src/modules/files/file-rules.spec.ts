import { FILE_RULES, matchesMagic } from './file-rules'

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values)
const text = (s: string): Uint8Array => new TextEncoder().encode(s)

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00)
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0)
// RIFF <hajm> WEBP
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50)

describe('matchesMagic — tarkib e’lon qilingan MIME ga mosmi', () => {
  it('rasm, PDF, gzip — imzo bo‘yicha', () => {
    expect(matchesMagic(PNG, 'image/png')).toBe(true)
    expect(matchesMagic(JPEG, 'image/jpeg')).toBe(true)
    expect(matchesMagic(WEBP, 'image/webp')).toBe(true)
    expect(matchesMagic(text('%PDF-1.7'), 'application/pdf')).toBe(true)
    expect(matchesMagic(bytes(0x1f, 0x8b, 0x08), 'application/gzip')).toBe(true)
  })

  it('boshqa tarkib — rad: PNG deb JPEG, WEBP deb oddiy RIFF (WAV), rasm deb HTML', () => {
    expect(matchesMagic(JPEG, 'image/png')).toBe(false)
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45)
    expect(matchesMagic(wav, 'image/webp')).toBe(false)
    expect(matchesMagic(text('<html><script>alert(1)</script>'), 'image/png')).toBe(false)
    expect(matchesMagic(new Uint8Array(), 'image/png')).toBe(false)
  })

  it('CSV — matn, lekin HTML/XML emas (BOM va bo‘shliqdan keyin ham)', () => {
    expect(matchesMagic(text('﻿nom;narx\nSement;60000'), 'text/csv')).toBe(true)
    expect(matchesMagic(text('  \n<!doctype html>'), 'text/csv')).toBe(false)
    expect(matchesMagic(text('﻿<svg onload=alert(1)>'), 'text/csv')).toBe(false)
    expect(matchesMagic(bytes(0x61, 0x00, 0x62), 'text/csv')).toBe(false)
  })

  it('JSON — obyekt yoki massiv bilan boshlanadi', () => {
    expect(matchesMagic(text('﻿ [{"a":1}]'), 'application/json')).toBe(true)
    expect(matchesMagic(text('{"a":1}'), 'application/json')).toBe(true)
    expect(matchesMagic(text('alert(1)'), 'application/json')).toBe(false)
  })

  it('oq ro‘yxatdan tashqari MIME (SVG, HTML) — hech qachon mos emas', () => {
    expect(matchesMagic(text('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml')).toBe(false)
    expect(matchesMagic(text('<html></html>'), 'text/html')).toBe(false)
  })
})

describe('FILE_RULES', () => {
  it('SVG va HTML hech bir turda ruxsat etilmagan', () => {
    const all = Object.values(FILE_RULES).flatMap((r) => r.mimes)
    expect(all).not.toContain('image/svg+xml')
    expect(all).not.toContain('text/html')
  })

  it('yuklab olinadigan turlar — attachment; rasmlar — yo‘q', () => {
    expect(FILE_RULES.document.attachment).toBe(true)
    expect(FILE_RULES.export.attachment).toBe(true)
    expect(FILE_RULES.import.attachment).toBe(true)
    expect(FILE_RULES.product_image.attachment).toBe(false)
  })
})
