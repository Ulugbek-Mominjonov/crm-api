import { uuidv5, uuidv7 } from './ids'
import { businessDate, businessDay, businessDayStart } from './time'

describe('uuidv7', () => {
  it('UUID v7 formati va versiya/variant bitlari', () => {
    const id = uuidv7()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('vaqt bo‘yicha o‘sib boradi — indeksda yangi yozuv oxirida', () => {
    const earlier = uuidv7(Date.UTC(2026, 0, 1))
    const later = uuidv7(Date.UTC(2026, 0, 2))
    expect(earlier < later).toBe(true)
  })

  it('bir millisekundda ham noyob va YARATILISH tartibida o‘sadi', () => {
    const now = Date.now()
    const ids = Array.from({ length: 5000 }, () => uuidv7(now))
    expect(new Set(ids).size).toBe(5000)
    expect([...ids].sort()).toEqual(ids)
  })

  it('soat orqaga ketsa ham id kamaymaydi', () => {
    const first = uuidv7(Date.UTC(2026, 5, 1))
    const second = uuidv7(Date.UTC(2026, 4, 1))
    expect(first < second).toBe(true)
  })
})

describe('uuidv5', () => {
  // RFC 9562 A.4 misoli: DNS nomlar fazosida "www.example.com"
  const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

  it('standart misol bilan mos (SHA-1, versiya 5)', () => {
    expect(uuidv5('www.example.com', DNS)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2')
  })

  it('deterministik: bir nom — bir id; boshqa nomlar fazosi — boshqa id', () => {
    const tenant = uuidv7()
    expect(uuidv5('product:pr_1', tenant)).toBe(uuidv5('product:pr_1', tenant))
    expect(uuidv5('product:pr_1', tenant)).not.toBe(uuidv5('product:pr_1', uuidv7()))
    expect(uuidv5('product:pr_1', tenant)).not.toBe(uuidv5('client:pr_1', tenant))
  })
})

describe('biznes sanasi (Asia/Tashkent)', () => {
  it('Toshkentda tun — UTC bo‘yicha kechagi kun emas', () => {
    // 2026-09-23 01:00 Toshkent = 2026-09-22 20:00 UTC
    expect(businessDate(new Date('2026-09-22T20:00:00Z'))).toBe('2026-09-23')
    expect(businessDate(new Date('2026-09-22T18:59:59Z'))).toBe('2026-09-22')
  })

  it('`@db.Date` uchun UTC yarim tun', () => {
    expect(businessDay(new Date('2026-09-22T20:00:00Z')).toISOString()).toBe('2026-09-23T00:00:00.000Z')
  })

  it('kun boshlanishi (jurnal filtri) — Toshkentdagi 00:00', () => {
    expect(businessDayStart('2026-09-23').toISOString()).toBe('2026-09-22T19:00:00.000Z')
    expect(businessDate(businessDayStart('2026-09-23'))).toBe('2026-09-23')
    expect(businessDate(new Date(businessDayStart('2026-09-23').getTime() - 1))).toBe('2026-09-22')
  })
})
