import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { DomainError } from '@/common/errors/domain.error'
import { generateTotpSecret, otpauthUrl, verifyTotp } from '@/common/security/totp'
import { DUMMY_HASH } from '@/modules/auth/auth.service'
import type { PlatformRole } from '@/modules/auth/decorators/platform.decorator'
import { PasswordService } from '@/modules/auth/password.service'
import type { TokenMeta } from '@/modules/auth/refresh-token.service'
import { TokenService } from '@/modules/auth/token.service'
import { PrismaService } from '@/prisma/prisma.service'
import type { PlatformAdminDto, PlatformLoginResponseDto, TotpSetupDto } from './dto/platform-auth.dto'
import { PlatformAuditService } from './platform-audit.service'
import { PlatformSessionService } from './platform-session.service'

/** Autentifikator ilovasida ko'rinadigan nom */
const TOTP_ISSUER = 'CRM egasi'

export const ADMIN_SELECT = {
  id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true,
  totpEnabledAt: true, telegramChatId: true,
} satisfies Prisma.PlatformAdminSelect
type AdminRow = Prisma.PlatformAdminGetPayload<{ select: typeof ADMIN_SELECT }>

export function toAdminDto(row: AdminRow): PlatformAdminDto {
  return {
    id: row.id, email: row.email, name: row.name, role: row.role as PlatformRole, isActive: row.isActive,
    totpEnabled: row.totpEnabledAt !== null, telegramLinked: row.telegramChatId !== null,
    lastLoginAt: row.lastLoginAt, createdAt: row.createdAt,
  }
}

export interface PlatformSession {
  response: PlatformLoginResponseDto
  refreshToken: string
}

/**
 * Egasi kirishi (T-135). Do'kon kirishi bilan bir xil shakl (access token
 * + httpOnly refresh cookie), lekin token tarkibi boshqa (`kind: platform`)
 * — do'kon yo'llarida o'tmaydi. Ikki bosqichli kirish (T-139): TOTP yoqilgan
 * hisobda parol to'g'ri bo'lsa ham kod talab qilinadi; kod bir martalik.
 */
/** Bloklash qoidasi (03 §3.2) — do'kon hisobi bilan bir xil */
const MAX_FAILED_LOGINS = 5
const LOCK_MINUTES = 15

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

  async login(email: string, password: string, totpCode: string | undefined, meta: TokenMeta = {}): Promise<PlatformSession> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email },
      select: { ...ADMIN_SELECT, passwordHash: true, totpSecret: true, totpLastStep: true, failedLogins: true, lockedUntil: true },
    })
    // Topilmasa ham parol tekshiriladi — javob vaqti hisob bor-yo'qligini aytmasin
    const ok = await this.passwords.verify(admin?.passwordHash ?? DUMMY_HASH, password)
    if (!admin || !admin.isActive) throw new DomainError('AUTH_INVALID_CREDENTIALS')
    // Bloklangan hisob (ketma-ket noto'g'ri parol/kod) — parol to'g'ri bo'lsa ham (03 §3.2)
    if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
      throw new DomainError(
        'AUTH_ACCOUNT_LOCKED',
        `Ketma-ket ${MAX_FAILED_LOGINS} marta noto‘g‘ri — ${LOCK_MINUTES} daqiqadan keyin urinib ko‘ring`,
        [{ code: 'AUTH_ACCOUNT_LOCKED', meta: { until: admin.lockedUntil.toISOString() } }],
      )
    }
    if (!ok) throw await this.loginFailed(admin, 'AUTH_INVALID_CREDENTIALS')

    // Parol to'g'ri, lekin TOTP yoqilgan: kodsiz — frontend kod maydonini ko'rsatadi
    let usedStep: number | undefined
    if (admin.totpEnabledAt && admin.totpSecret) {
      if (!totpCode) throw new DomainError('AUTH_TOTP_REQUIRED')
      const step = verifyTotp(admin.totpSecret, totpCode, admin.totpLastStep === null ? null : Number(admin.totpLastStep))
      // Noto'g'ri kod ham urinish — 6 raqamni saralab bo'lmasin
      if (step === null) throw await this.loginFailed(admin, 'AUTH_TOTP_INVALID')
      usedStep = step
    }

    const rehash = this.passwords.needsRehash(admin.passwordHash) ? await this.passwords.hash(password) : undefined
    const fresh = await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: {
        lastLoginAt: new Date(),
        failedLogins: 0,
        lockedUntil: null,
        ...(rehash && { passwordHash: rehash }),
        ...(usedStep !== undefined && { totpLastStep: BigInt(usedStep) }),
      },
      select: ADMIN_SELECT,
    })
    await this.audit.log({ action: 'platform.login', adminId: admin.id, ip: meta.ip })
    this.logger.log({ adminId: admin.id }, 'Egasi kirdi')
    return this.issue(fresh, meta)
  }

  /**
   * Noto'g'ri parol yoki kod: hisoblagich +1, 5-chisida 15 daqiqa blok; muddati
   * o'tgan blokdan keyin hisob yangidan boshlanadi. Mijozga — o'sha 401.
   */
  private async loginFailed(
    admin: { id: string; failedLogins: number; lockedUntil: Date | null },
    code: 'AUTH_INVALID_CREDENTIALS' | 'AUTH_TOTP_INVALID',
  ): Promise<DomainError> {
    const expired = admin.lockedUntil !== null && admin.lockedUntil.getTime() <= Date.now()
    const failed = expired ? 1 : admin.failedLogins + 1
    const locked = failed >= MAX_FAILED_LOGINS
    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { failedLogins: failed, lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      select: { id: true },
    })
    if (locked) this.logger.warn({ adminId: admin.id }, 'Egasi hisobi vaqtincha bloklandi — ketma-ket noto‘g‘ri urinishlar')
    return new DomainError(code)
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
  /** Faol egasi hisobi; `issuedAt` (token `iat`) sessiyalar yopilgan vaqtdan oldin bo'lsa — `null` (T-147) */
  async forAdmin(adminId: string, issuedAt?: number): Promise<PlatformAdminDto | null> {
    const row = await this.prisma.platformAdmin.findFirst({
      where: { id: adminId, isActive: true },
      select: { ...ADMIN_SELECT, tokensInvalidBefore: true },
    })
    if (!row) return null
    if (issuedAt !== undefined && row.tokensInvalidBefore && issuedAt < Math.floor(row.tokensInvalidBefore.getTime() / 1000)) return null
    return toAdminDto(row)
  }

  /**
   * TOTP sozlashni boshlash: yangi sir saqlanadi, lekin `enable` da kod bilan
   * tasdiqlanmaguncha kirishga ta'sir qilmaydi (ilova noto'g'ri sozlansa
   * hisob yopilib qolmasin). Qayta chaqirish — yangi sir, eskisi bekor.
   */
  async totpSetup(adminId: string): Promise<TotpSetupDto> {
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: adminId }, select: { email: true, totpEnabledAt: true } })
    if (admin.totpEnabledAt) throw new DomainError('INVALID_STATUS_TRANSITION', 'Ikki bosqichli kirish allaqachon yoqilgan — avval o‘chiring')
    const secret = generateTotpSecret()
    await this.prisma.platformAdmin.update({ where: { id: adminId }, data: { totpSecret: secret, totpLastStep: null } })
    return { secret, otpauthUrl: otpauthUrl(secret, admin.email, TOTP_ISSUER) }
  }

  async totpEnable(adminId: string, code: string): Promise<PlatformAdminDto> {
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({ where: { id: adminId }, select: { totpSecret: true, totpEnabledAt: true } })
    if (admin.totpEnabledAt) throw new DomainError('INVALID_STATUS_TRANSITION', 'Ikki bosqichli kirish allaqachon yoqilgan')
    if (!admin.totpSecret) throw new DomainError('INVALID_STATUS_TRANSITION', 'Avval sozlashni boshlang (`totp/setup`)')
    const step = verifyTotp(admin.totpSecret, code)
    if (step === null) throw new DomainError('AUTH_TOTP_INVALID')
    const fresh = await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: { totpEnabledAt: new Date(), totpLastStep: BigInt(step) },
      select: ADMIN_SELECT,
    })
    await this.audit.log({ action: 'platform.totp.enable', entityType: 'admin', entityId: adminId })
    return toAdminDto(fresh)
  }

  /** O'chirish ham kod bilan: o'g'irlangan sessiya himoyani olib tashlay olmasin */
  async totpDisable(adminId: string, code: string): Promise<PlatformAdminDto> {
    const admin = await this.prisma.platformAdmin.findUniqueOrThrow({
      where: { id: adminId }, select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true },
    })
    if (!admin.totpEnabledAt || !admin.totpSecret) throw new DomainError('INVALID_STATUS_TRANSITION', 'Ikki bosqichli kirish yoqilmagan')
    const step = verifyTotp(admin.totpSecret, code, admin.totpLastStep === null ? null : Number(admin.totpLastStep))
    if (step === null) throw new DomainError('AUTH_TOTP_INVALID')
    const fresh = await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null },
      select: ADMIN_SELECT,
    })
    await this.audit.log({ action: 'platform.totp.disable', entityType: 'admin', entityId: adminId })
    return toAdminDto(fresh)
  }

  private async issue(admin: AdminRow, meta: TokenMeta): Promise<PlatformSession> {
    const access = await this.tokens.signAccess({ sub: admin.id, kind: 'platform' })
    const refreshToken = await this.sessions.issue(admin.id, meta)
    return { response: { accessToken: access.token, expiresIn: access.expiresIn, admin: toAdminDto(admin) }, refreshToken }
  }
}
