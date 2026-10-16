import { Injectable } from '@nestjs/common'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { PasswordService } from '@/modules/auth/password.service'
import { PrismaService } from '@/prisma/prisma.service'
import type { PlatformAdminDto } from './dto/platform-auth.dto'
import type { CreatePlatformAdminDto, UpdatePlatformAdminDto } from './dto/platform-admin.dto'
import { PlatformAuditService } from './platform-audit.service'
import { ADMIN_SELECT, toAdminDto } from './platform-auth.service'
import { PlatformSessionService } from './platform-session.service'

/**
 * Egasi hisoblari (T-139): egasi o'ziga yordamchi — operator — ochadi.
 * Faqat `owner` roli (controller'da). O'z hisobini o'zgartirish yo'li
 * bu yerda emas: rolini pasaytirish yoki faolsizlantirish — 422, shuning
 * uchun faol egasi doim kamida bitta qoladi (amal qilayotganning o'zi).
 */
@Injectable()
export class PlatformAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: PlatformSessionService,
    private readonly audit: PlatformAuditService,
  ) {}

  async list(): Promise<PlatformAdminDto[]> {
    const rows = await this.prisma.platformAdmin.findMany({ orderBy: { createdAt: 'asc' }, select: ADMIN_SELECT })
    return rows.map(toAdminDto)
  }

  async create(dto: CreatePlatformAdminDto): Promise<PlatformAdminDto> {
    const taken = await this.prisma.platformAdmin.findUnique({ where: { email: dto.email }, select: { id: true } })
    if (taken) throw new DomainError('ALREADY_EXISTS', 'Bu email bilan hisob bor')
    // Parol siyosati xeshlashda tekshiriladi (400 VALIDATION_FAILED)
    const passwordHash = await this.passwords.hash(dto.password)
    const row = await this.prisma.platformAdmin.create({
      data: { email: dto.email, name: dto.name, role: dto.role, passwordHash },
      select: ADMIN_SELECT,
    })
    await this.audit.log({ action: 'platform.admin.create', entityType: 'admin', entityId: row.id, diff: { email: row.email, name: row.name, role: row.role } })
    return toAdminDto(row)
  }

  async update(id: string, dto: UpdatePlatformAdminDto, actorId: string): Promise<PlatformAdminDto> {
    const before = await this.require(id)
    if (id === actorId) {
      if (dto.role !== undefined && dto.role !== before.role) throw new DomainError('SELF_ROLE_CHANGE')
      if (dto.isActive === false) throw new DomainError('SELF_DELETE', 'O‘z hisobingizni faolsizlantirib bo‘lmaydi')
    }
    const row = await this.prisma.platformAdmin.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: ADMIN_SELECT,
    })
    // Faolsizlantirilgan hisob token muddatini kutmaydi: refresh ham yopiladi (guard access'ni darhol rad etadi)
    if (before.isActive && dto.isActive === false) await this.sessions.revokeAll(id)
    await this.audit.log({
      action: 'platform.admin.update', entityType: 'admin', entityId: id,
      diff: {
        before: { name: before.name, role: before.role, isActive: before.isActive },
        after: { name: row.name, role: row.role, isActive: row.isActive },
      },
    })
    return toAdminDto(row)
  }

  /** Yangi parol — barcha sessiyalari yopiladi (o'ziniki ham mumkin: unda joriy sessiya ham yopiladi) */
  async resetPassword(id: string, password: string): Promise<void> {
    await this.require(id)
    const passwordHash = await this.passwords.hash(password)
    await this.prisma.platformAdmin.update({ where: { id }, data: { passwordHash } })
    await this.sessions.revokeAll(id)
    await this.audit.log({ action: 'platform.admin.resetPassword', entityType: 'admin', entityId: id })
  }

  /** Qurilma yo'qolganda: boshqa egasi TOTP'ni o'chiradi, hisob parol bilan kiradi va qayta sozlaydi */
  async resetTotp(id: string): Promise<void> {
    const admin = await this.require(id)
    if (!admin.totpEnabledAt) throw new DomainError('INVALID_STATUS_TRANSITION', 'Bu hisobda ikki bosqichli kirish yoqilmagan')
    await this.prisma.platformAdmin.update({ where: { id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null } })
    await this.audit.log({ action: 'platform.admin.totpReset', entityType: 'admin', entityId: id })
  }

  private async require(id: string) {
    const row = await this.prisma.platformAdmin.findUnique({ where: { id }, select: ADMIN_SELECT })
    if (!row) throw new NotFoundError('Hisob', id)
    return row
  }
}
