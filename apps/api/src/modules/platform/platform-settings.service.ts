import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import type { PlatformSettingsDto, RegistrationMode, UpdatePlatformSettingsDto } from './dto/platform-settings.dto'
import { PlatformAuditService } from './platform-audit.service'

/** Yagona qator — migratsiya yaratadi, CHECK (id = 1) boshqasini kiritmaydi */
const ROW_ID = 1
const DEFAULT_MODE: RegistrationMode = 'open'
const SELECT = {
  registrationMode: true, updatedAt: true,
  updatedBy: { select: { name: true } },
} satisfies Prisma.PlatformSettingsSelect

/**
 * Platforma sozlamasi (T-138): ro'yxatdan o'tish ochiq yoki yopiq. Env emas,
 * baza — egasi panelidan serverga kirmasdan o'zgartiriladi, qayta ishga
 * tushirish shart emas. Ochiq yo'l (`POST /tenants/register`) har safar
 * bitta kichik so'rov bilan tekshiradi — ro'yxatdan o'tish kam va rate limit
 * ostida. Qator yo'q bo'lsa (bo'sh baza) — sukut: ochiq.
 */
@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async get(): Promise<PlatformSettingsDto> {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: ROW_ID }, select: SELECT })
    if (!row) return { registrationMode: DEFAULT_MODE, updatedAt: new Date(0), updatedBy: null }
    return { registrationMode: row.registrationMode as RegistrationMode, updatedAt: row.updatedAt, updatedBy: row.updatedBy?.name ?? null }
  }

  async registrationMode(): Promise<RegistrationMode> {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: ROW_ID }, select: { registrationMode: true } })
    return (row?.registrationMode as RegistrationMode | undefined) ?? DEFAULT_MODE
  }

  async update(dto: UpdatePlatformSettingsDto, adminId: string): Promise<PlatformSettingsDto> {
    const before = await this.registrationMode()
    if (before !== dto.registrationMode) {
      const data = { registrationMode: dto.registrationMode, updatedAt: new Date(), updatedById: adminId }
      await this.prisma.platformSettings.upsert({ where: { id: ROW_ID }, create: { id: ROW_ID, ...data }, update: data })
      await this.audit.log({ action: 'platform.settings.update', diff: { before: { registrationMode: before }, after: { registrationMode: dto.registrationMode } } })
    }
    return this.get()
  }
}
