import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Prisma } from '@prisma/client'
import { TtlCache } from '@/common/cache/ttl-cache'
import { currentTenantId } from '@/common/context/request-context'
import { rethrowAsDomain } from '@/common/crud/prisma-errors'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import type { Env } from '@/config/env.schema'
import { AuditService } from '@/modules/audit/audit.service'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
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
  sellerWholesaleEnabled: true,
  loyaltyEnabled: true,
  loyaltyRate: true,
  maxDiscountPct: true,
  minMarginPct: true,
  receiptPhone: true,
  receiptAddress: true,
  receiptFooter: true,
  onboarded: true,
  brandColor: true,
  logoFileId: true,
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
    private readonly audit: AuditService,
    private readonly events: DomainEvents,
    config: ConfigService<Env, true>,
  ) {
    this.cache =
      config.get('CACHE_DRIVER', { infer: true }) === 'none'
        ? TtlCache.disabled()
        : new TtlCache(CACHE_TTL_MS, CACHE_MAX_TENANTS)
  }

  /** Joriy so'rov do'koni */
  get(): Promise<Readonly<SettingsDto>> {
    return this.forTenant(currentTenantId())
  }

  /**
   * Berilgan do'kon. So'rov tranzaksiyasi bo'lsa — unga qo'shiladi; bo'lmasa
   * (javobni tranzaksiya yopilgach ko'radigan global interceptor) — kesh bo'sh
   * bo'lganda o'z qisqa tranzaksiyasida o'qiydi.
   */
  async forTenant(tenantId: string): Promise<Readonly<SettingsDto>> {
    const cached = this.cache.get(tenantId)
    if (cached) return cached

    const row = await this.prisma.inTenantTransaction(tenantId, (tx) =>
      tx.settings.findUnique({ where: { tenantId }, select: SETTINGS_SELECT }),
    )
    if (!row) throw new NotFoundError(RESOURCE)

    // Muzlatilgan: keshdagi obyektni hech bir chaqiruvchi o'zgartira olmaydi
    const settings = Object.freeze({ ...row })
    this.cache.set(tenantId, settings)
    return settings
  }

  /**
   * Faqat yuborilgan maydonlar. Bitta tranzaksiyada: do'kon nomi `tenants` ga
   * ham (kirishdagi do'kon tanlovi, `/auth/me`), almashgan logotipning eski
   * fayli o'chirishga, jurnalga — o'zgargan maydonlar. COMMIT'dan keyin
   * boshqa kassalarga `settings.updated` (rang/logotip sahifa yangilanmasdan).
   */
  async update(dto: UpdateSettingsDto): Promise<SettingsDto> {
    const tenantId = currentTenantId()
    if (dto.logoFileId) await this.assertLogo(dto.logoFileId)
    const before = await this.prisma.scoped.settings.findUnique({ where: { tenantId }, select: SETTINGS_SELECT })
    if (!before) throw new NotFoundError(RESOURCE)
    const row = await this.prisma.scoped.settings
      .update({ where: { tenantId }, data: { ...dto }, select: SETTINGS_SELECT })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE }))

    const diff = changes(before, row)
    if (diff.storeName) await this.prisma.scoped.tenant.update({ where: { id: tenantId }, data: { name: row.storeName } })
    // Eski logotip — yumshoq o'chirish: kvota 30 kundan keyin bo'shaydi (GC), shu tarkib qayta yuklansa tiklanadi
    if (diff.logoFileId && before.logoFileId) {
      await this.prisma.scoped.file.updateMany({ where: { id: before.logoFileId, deletedAt: null }, data: { deletedAt: new Date() } })
    }
    await this.audit.log({ action: 'settings.update', entityType: 'settings', diff })
    this.changed(tenantId)
    return row
  }

  /** Logotip fayli o'chirildi (`DELETE /files/:id`) — sozlamadan uziladi */
  async detachLogo(fileId: string): Promise<void> {
    const { count } = await this.prisma.scoped.settings.updateMany({ where: { logoFileId: fileId }, data: { logoFileId: null } })
    if (count > 0) this.changed(currentTenantId())
  }

  /**
   * Kesh bekor va hodisa (COMMIT'dan keyin). Yangi qiymat keshga YOZILMAYDI,
   * faqat eskisi o'chiriladi: parallel ikki tahrirda kechroq tugagani eski
   * qiymatni keshga qo'yib qo'ymasin
   */
  private changed(tenantId: string): void {
    this.cache.delete(tenantId)
    this.events.publish('settings.updated', {})
  }

  /** Shu do'konning tasdiqlangan logotipi (boshqa tenant fayli RLS ostida ko'rinmaydi) */
  private async assertLogo(fileId: string): Promise<void> {
    const file = await this.prisma.scoped.file.findFirst({
      where: { id: fileId, kind: 'store_logo', status: 'ready', deletedAt: null },
      select: { id: true },
    })
    if (file) return
    throw new DomainError('VALIDATION_FAILED', 'Logotip topilmadi yoki hali tasdiqlanmagan', [
      { field: 'logoFileId', code: 'VALIDATION_FAILED' },
    ])
  }
}

type Value = SettingsDto[keyof SettingsDto]
type Change = { from: Value; to: Value }

/** Jurnal uchun: faqat o'zgargan maydonlar `{ maydon: { from, to } }` */
function changes(before: SettingsDto, after: SettingsDto): Partial<Record<keyof SettingsDto, Change>> {
  const diff: Partial<Record<keyof SettingsDto, Change>> = {}
  for (const key of Object.keys(after) as (keyof SettingsDto)[]) {
    if (before[key] !== after[key]) diff[key] = { from: before[key], to: after[key] }
  }
  return diff
}
