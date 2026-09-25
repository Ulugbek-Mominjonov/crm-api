/**
 * Jarayon ichidagi kichik kesh: muddat (TTL) + hajm chegarasi (LRU).
 *
 * Kam o'zgaradigan, lekin tez-tez o'qiladigan ma'lumot uchun — masalan
 * sozlamalar (10 §10.7). Bir nechta instansiyada boshqa instansiyaning
 * keshi TTL tugaguncha eski qiymat berishi mumkin, shuning uchun TTL qisqa.
 * Pul bilan bog'liq ma'lumot (qoldiq, kassa, qarz) bu yerga TUSHMAYDI.
 */
export class TtlCache<K, V> {
  private readonly entries = new Map<K, { value: V; expiresAt: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** `CACHE_DRIVER=none`: hech narsa saqlamaydi (nosozlikni izlashda qulay) */
  static disabled<K, V>(): TtlCache<K, V> {
    return new TtlCache<K, V>(0, 0)
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    // Map qo'shilish tartibini saqlaydi: ishlatilgan yozuv oxiriga o'tadi,
    // shunda eng uzoq ishlatilmagani birinchi chiqariladi (LRU)
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs })
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next()
      if (oldest.done) break
      this.entries.delete(oldest.value)
    }
  }

  delete(key: K): void {
    this.entries.delete(key)
  }
}
