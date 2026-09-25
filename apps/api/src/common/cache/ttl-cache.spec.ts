import { TtlCache } from './ttl-cache'

describe('TtlCache', () => {
  let now = 0
  const clock = (): number => now

  beforeEach(() => {
    now = 1_000
  })

  it('muddat ichida qiymatni qaytaradi, keyin unutadi', () => {
    const cache = new TtlCache<string, number>(60_000, 10, clock)
    cache.set('a', 1)
    now += 59_999
    expect(cache.get('a')).toBe(1)
    now += 1
    expect(cache.get('a')).toBeUndefined()
  })

  it('`delete` keshni darhol bekor qiladi', () => {
    const cache = new TtlCache<string, number>(60_000, 10, clock)
    cache.set('a', 1)
    cache.delete('a')
    expect(cache.get('a')).toBeUndefined()
  })

  it('hajm oshsa eng uzoq ishlatilmagani chiqariladi (LRU)', () => {
    const cache = new TtlCache<string, number>(60_000, 2, clock)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.get('a') // `a` endi yangi ishlatilgan
    cache.set('c', 3)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe(1)
    expect(cache.get('c')).toBe(3)
  })

  it('o‘chirilgan kesh hech narsa saqlamaydi', () => {
    const cache = TtlCache.disabled<string, number>()
    cache.set('a', 1)
    expect(cache.get('a')).toBeUndefined()
  })
})
