import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import type { PlatformSettingsDto, PlatformSupportDto, RegistrationMode, UpdatePlatformSettingsDto } from './dto/platform-settings.dto'
import { PlatformAuditService } from './platform-audit.service'

/** Yagona qator — migratsiya yaratadi, CHECK (id = 1) boshqasini kiritmaydi */
const ROW_ID = 1
const ROW_SELECT = {
  registrationMode: true, supportPhone: true, supportTelegram: true, supportHours: true,
} satisfies Prisma.PlatformSettingsSelect

type Row = Prisma.PlatformSettingsGetPayload<{ select: typeof ROW_SELECT }>

/** Qator yo'q (bo'sh baza) — sukut: ro'yxatdan o'tish ochiq, aloqa yo'q */
const DEFAULTS: Row = { registrationMode: 'open', supportPhone: null, supportTelegram: null, supportHours: null }

/** Ochiq yo'l (`GET /tenants/registration`) ko'radigan qismi */
export interface PlatformPublicInfo {
  mode: RegistrationMode
  support: PlatformSupportDto
}

/**
 * Platforma sozlamasi (T-138, T-140): ro'yxatdan o'tish ochiq yoki yopiq,
 * egasining aloqa ma'lumoti. Env emas, baza — egasi panelidan serverga
 * kirmasdan o'zgartiriladi, qayta ishga tushirish shart emas. Ochiq yo'l
 * (`POST /tenants/register`) har safar bitta kichik so'rov bilan tekshiradi
 * — ro'yxatdan o'tish kam va rate limit ostida.
 */
@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async get(): Promise<PlatformSettingsDto> {
    const row = await this.prisma.platformSettings.findUnique({
      where: { id: ROW_ID },
      select: { ...ROW_SELECT, updatedAt: true, updatedBy: { select: { name: true } } },
    })
    if (!row) return { registrationMode: DEFAULTS.registrationMode as RegistrationMode, support: supportOf(DEFAULTS), updatedAt: new Date(0), updatedBy: null }
    return { registrationMode: row.registrationMode as RegistrationMode, support: supportOf(row), updatedAt: row.updatedAt, updatedBy: row.updatedBy?.name ?? null }
  }

  async registrationMode(): Promise<RegistrationMode> {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: ROW_ID }, select: { registrationMode: true } })
    return (row?.registrationMode as RegistrationMode | undefined) ?? (DEFAULTS.registrationMode as RegistrationMode)
  }

  async support(): Promise<PlatformSupportDto> {
    return supportOf(await this.row())
  }

  async publicInfo(): Promise<PlatformPublicInfo> {
    const row = await this.row()
    return { mode: row.registrationMode as RegistrationMode, support: supportOf(row) }
  }

  /** Faqat yuborilgan va haqiqatan o'zgargan maydonlar yoziladi va jurnalga tushadi */
  async update(dto: UpdatePlatformSettingsDto, adminId: string): Promise<PlatformSettingsDto> {
    const before = await this.row()
    const next = changes(dto, before)
    const keys = Object.keys(next) as (keyof Row)[]
    if (keys.length > 0) {
      const data = { ...next, updatedAt: new Date(), updatedById: adminId }
      await this.prisma.platformSettings.upsert({ where: { id: ROW_ID }, create: { id: ROW_ID, ...data }, update: data })
      await this.audit.log({
        action: 'platform.settings.update',
        diff: { before: Object.fromEntries(keys.map((k) => [k, before[k]])), after: next },
      })
    }
    return this.get()
  }

  private async row(): Promise<Row> {
    return (await this.prisma.platformSettings.findUnique({ where: { id: ROW_ID }, select: ROW_SELECT })) ?? DEFAULTS
  }
}

function supportOf(row: Row): PlatformSupportDto {
  return { phone: row.supportPhone, telegram: row.supportTelegram, hours: row.supportHours }
}

/** DTO → o'zgargan ustunlar; `""` — tozalash (`null`) */
function changes(dto: UpdatePlatformSettingsDto, before: Row): Partial<Row> {
  const next: Partial<Row> = {}
  const set = <K extends keyof Row>(key: K, value: Row[K] | undefined): void => {
    if (value !== undefined && value !== before[key]) next[key] = value
  }
  set('registrationMode', dto.registrationMode)
  set('supportPhone', emptyToNull(dto.support?.phone))
  set('supportTelegram', emptyToNull(dto.support?.telegram))
  set('supportHours', emptyToNull(dto.support?.hours))
  return next
}

const emptyToNull = (value: string | undefined): string | null | undefined => (value === undefined ? undefined : value || null)
