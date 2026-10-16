import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { DomainError } from '@/common/errors/domain.error'
import { DUMMY_HASH } from '@/modules/auth/auth.service'
import { PasswordService } from '@/modules/auth/password.service'
import type { TokenMeta } from '@/modules/auth/refresh-token.service'
import { TokenService } from '@/modules/auth/token.service'
import { PrismaService } from '@/prisma/prisma.service'
import type { PlatformAdminDto, PlatformLoginResponseDto } from './dto/platform-auth.dto'
import { PlatformAuditService } from './platform-audit.service'
import { PlatformSessionService } from './platform-session.service'

const ADMIN_SELECT = { id: true, email: true, name: true, lastLoginAt: true } satisfies Prisma.PlatformAdminSelect
type AdminRow = Prisma.PlatformAdminGetPayload<{ select: typeof ADMIN_SELECT }>

export interface PlatformSession {
  response: PlatformLoginResponseDto
  refreshToken: string
}

/**
 * Egasi kirishi (T-135). Do'kon kirishi bilan bir xil shakl (access token
 * + httpOnly refresh cookie), lekin token tarkibi boshqa (`kind: platform`)
 * — do'kon yo'llarida o'tmaydi.
 */
@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger(PlatformAuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: PlatformSessionService,
    private readonly audit: PlatformAuditService,
  ) {}

  async login(email: string, password: string, meta: TokenMeta = {}): Promise<PlatformSession> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email },
      select: { ...ADMIN_SELECT, passwordHash: true, isActive: true },
    })
    // Topilmasa ham parol tekshiriladi — javob vaqti hisob bor-yo'qligini aytmasin
    const ok = await this.passwords.verify(admin?.passwordHash ?? DUMMY_HASH, password)
    if (!admin || !ok || !admin.isActive) throw new DomainError('AUTH_INVALID_CREDENTIALS')

    const rehash = this.passwords.needsRehash(admin.passwordHash) ? await this.passwords.hash(password) : undefined
    const fresh = await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date(), ...(rehash && { passwordHash: rehash }) },
      select: ADMIN_SELECT,
    })
    await this.audit.log({ action: 'platform.login', adminId: admin.id, ip: meta.ip })
    this.logger.log({ adminId: admin.id }, 'Egasi kirdi')
    return this.issue(fresh, meta)
  }

  async refresh(raw: string, meta: TokenMeta = {}): Promise<PlatformSession> {
    const { adminId, token } = await this.sessions.rotate(raw, meta)
    const admin = await this.forAdmin(adminId)
    if (!admin) throw new DomainError('AUTH_INVALID_REFRESH')
    const access = await this.tokens.signAccess({ sub: admin.id, kind: 'platform' })
    return { response: { accessToken: access.token, expiresIn: access.expiresIn, admin }, refreshToken: token }
  }

  async logout(raw?: string): Promise<void> {
    if (raw) await this.sessions.revoke(raw)
  }

  /** Faol hisob; aks holda `null` (kirish yopiq) — guard har so'rovda chaqiradi */
  async forAdmin(adminId: string): Promise<PlatformAdminDto | null> {
    return this.prisma.platformAdmin.findFirst({ where: { id: adminId, isActive: true }, select: ADMIN_SELECT })
  }

  private async issue(admin: AdminRow, meta: TokenMeta): Promise<PlatformSession> {
    const access = await this.tokens.signAccess({ sub: admin.id, kind: 'platform' })
    const refreshToken = await this.sessions.issue(admin.id, meta)
    return { response: { accessToken: access.token, expiresIn: access.expiresIn, admin }, refreshToken }
  }
}
