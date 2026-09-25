import { Global, Injectable, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TtlCache } from '@/common/cache/ttl-cache'
import type { Env } from '@/config/env.schema'

/** Hisobot natijasi keshda (10 §10.7: "Redis — hisobot natijalari, 5 daq") */
const REPORT_TTL_MS = 5 * 60_000
const MAX_ENTRIES = 2_000

/**
 * Hisobot keshi (T-085) — tenant versiya kaliti bilan (10 §10.7).
 *
 * Kalit: `tenant : davr : versiya : so'rov`. Tenantda pulga oid biror narsa
 * o'zgarsa versiya oshadi — eski kalitlar o'z-o'zidan yaroqsiz (TTL bilan
 * yo'qoladi). Kunlik ko'rinishlar yangilanganda (T-080) — umumiy "davr"
 * oshadi. FAQAT tugallangan davrlar keshlanadi — chaqiruvchi hal qiladi.
 *
 * Jarayon ichida: ko'p instansiyada versiya Redis'da bo'ladi (T-096).
 */
@Injectable()
export class ReportCache {
  private epoch = 0
  private readonly versions = new Map<string, number>()
  private readonly cache: TtlCache<string, unknown>

  constructor(config: ConfigService<Env, true>) {
    this.cache =
      config.get('CACHE_DRIVER', { infer: true }) === 'none'
        ? TtlCache.disabled()
        : new TtlCache(REPORT_TTL_MS, MAX_ENTRIES)
  }

  /** Tenant hisobotlariga ta'sir qiluvchi yozuvdan keyin */
  invalidate(tenantId: string): void {
    this.versions.set(tenantId, (this.versions.get(tenantId) ?? 0) + 1)
  }

  /** Kunlik ko'rinishlar yangilandi — barcha tenant keshlari eskirdi */
  bumpEpoch(): void {
    this.epoch++
  }

  async wrap<T>(tenantId: string, key: string, compute: () => Promise<T>): Promise<T> {
    const full = `${tenantId}:${this.epoch}:${this.versions.get(tenantId) ?? 0}:${key}`
    const hit = this.cache.get(full)
    if (hit !== undefined) return hit as T
    const value = await compute()
    this.cache.set(full, value)
    return value
  }
}

@Global()
@Module({
  providers: [ReportCache],
  exports: [ReportCache],
})
export class ReportCacheModule {}
