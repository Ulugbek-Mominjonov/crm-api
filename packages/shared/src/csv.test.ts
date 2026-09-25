import { describe, expect, it } from 'vitest'
import { CSV_BOM, csvCell, csvLine } from './csv'

describe('CSV', () => {
  it('oddiy qiymatlar o‘zgarmaydi; bo‘sh — bo‘sh katak', () => {
    expect(csvLine(['Sement M400', 60_000, 12.5, true, null, undefined])).toBe('Sement M400,60000,12.5,true,,\r\n')
  })

  it('vergul, nuqtali vergul, qo‘shtirnoq va yangi qator — qo‘shtirnoq ichida', () => {
    expect(csvCell('Kafel, 30×30')).toBe('"Kafel, 30×30"')
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('12" quvur')).toBe('"12"" quvur"')
    expect(csvCell('1-qator\n2-qator')).toBe('"1-qator\n2-qator"')
  })

  it('formula in’yeksiyasi — matn oldiga apostrof; manfiy son — tegilmaydi', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`)
    expect(csvCell('+998901234567')).toBe("'+998901234567")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell(-5_000)).toBe('-5000')
  })

  it('sana — ISO; obyekt — JSON; BOM — U+FEFF', () => {
    expect(csvCell(new Date('2026-09-23T10:00:00Z'))).toBe('2026-09-23T10:00:00.000Z')
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"')
    expect(CSV_BOM.charCodeAt(0)).toBe(0xfeff)
  })
})
