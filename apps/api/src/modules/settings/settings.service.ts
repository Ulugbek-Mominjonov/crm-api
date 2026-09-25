import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Prisma } from '@prisma/client'
import { TtlCache } from '@/common/cache/ttl-cache'
import { currentTenantId } from '@/common/context/request-context'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { NotFoundError } from '@/common/errors/domain.error'
import type { Env } from '@/config/env.schema'
import { PrismaService } from '@/prisma/prisma.service'
import type { SettingsDto, UpdateSettingsDto } from './dto/settings.dto'

const RESOURCE = 'Sozlamalar'

/**
 * Jarayon ichidagi kesh muddati (10 §10.7). Boshqa instansiya o'zgarishni
 * ko'pi bilan shuncha kechikib ko'radi — sozlama uchun bu maqbul.
 */
const CACHE_TTL_MS = 60_000
/** Bitta instansiya xizmat qiladigan faol do'konlar uchun yetarli */
const CACHE_MAX_TENANTS = 1_000

const SETTINGS_SELECT = {
  storeName: true,
  currency: true,
  taxEnabled: true,
  taxRate: true,
  wholesaleEnabled: true,
  loyaltyEnabled: true,
  loyaltyRate: true,
  maxDiscountPct: true,
  receiptPhone: true,
  receiptAddress: true,
  receiptFooter: true,
  onboarded: true,
} satisfies Prisma.SettingsSelect

/**
 * Do'kon sozlamalari.
 *
 * Har sotuvda o'qiladi (QQS, chegirma chegarasi), kamdan-kam o'zgaradi —
 * shuning uchun keshlanadi. Kesh FAQAT shu servis orqali yozilgan
 * o'zgarishda bekor qilinadi; boshqa yo'l bilan yozilsa TTL tugaguncha
 * eski qiymat qaytadi (shu sababli sozlamani boshqa joy yozmaydi).
 */
@Injectable()
export class SettingsService {
  private readonly cache: TtlCache<string, Readonly<SettingsDto>>

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.cache =
      config.get('CACHE_DRIVER', { infer: true }) === 'none'
        ? TtlCache.disabled()
        : new TtlCache(CACHE_TTL_MS, CACHE_MAX_TENANTS)
  }

  async get(): Promise<Readonly<SettingsDto>> {
    const tenantId = currentTenantId()
    const cached = this.cache.get(tenantId)
    if (cached) return cached

    const row = await this.prisma.scoped.settings.findUnique({
      where: { tenantId },
      select: SETTINGS_SELECT,
    })
    if (!row) throw new NotFoundError(RESOURCE)

    // Muzlatilgan: keshdagi obyektni hech bir chaqiruvchi o'zgartira olmaydi
    const settings = Object.freeze({ ...row })
    this.cache.set(tenantId, settings)
    return settings
  }

  async update(dto: UpdateSettingsDto): Promise<SettingsDto> {
    const tenantId = currentTenantId()
    const row = await this.prisma.scoped.settings
      .update({ where: { tenantId }, data: { ...dto }, select: SETTINGS_SELECT })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE }))

    // Yangi qiymat keshga YOZILMAYDI, faqat eskisi o'chiriladi: parallel
    // ikki tahrirda kechroq tugagani eski qiymatni keshga qo'yib qo'ymasin
    this.cache.delete(tenantId)
    return row
  }
}
