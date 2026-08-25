import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { DomainError } from '@/common/errors/domain.error'
import { PasswordService } from './password.service'
import { RefreshTokenService, type TokenMeta } from './refresh-token.service'
import { TokenService } from './token.service'
import type { AuthUserDto, LoginResponseDto } from './dto/auth-response.dto'

/**
 * Noma'lum email uchun ishlatiladigan soxta xesh.
 *
 * Foydalanuvchi topilmasa ham parol tekshiruvi BAJARILADI — aks holda
 * javob vaqtidagi farq "bu email ro'yxatda bormi?" degan savolga javob
 * berib qo'yardi (foydalanuvchi sanash / enumeration).
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$JZ0z6l8N0y6t0YkTqZ0xQ1uJ0mFqZ0xQ1uJ0mFqZ0xQ'

/** Bir email bir nechta do'konda bo'lishi mumkin — nechtasini tekshiramiz */
const MAX_TENANT_CANDIDATES = 5

const userInclude = {
  employee: { select: { id: true, name: true, position: true, status: true } },
  tenant: { select: { id: true, name: true, status: true } },
} satisfies Prisma.UserInclude

type UserWithRelations = Prisma.UserGetPayload<{ include: typeof userInclude }>

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refresh: RefreshTokenService,
  ) {}

  async login(
    email: string,
    password: string,
    meta: TokenMeta & { tenantId?: string } = {},
  ): Promise<{ response: LoginResponseDto; refreshToken: string }> {
    const candidates = await this.prisma.user.findMany({
      where: {
        email: email.trim().toLowerCase(),
        deletedAt: null,
        isActive: true,
        ...(meta.tenantId ? { tenantId: meta.tenantId } : {}),
      },
      include: userInclude,
      take: MAX_TENANT_CANDIDATES,
    })

    if (candidates.length === 0) {
      // Vaqtni tenglashtirish uchun baribir tekshiramiz
      await this.passwords.verify(DUMMY_HASH, password)
      throw new DomainError('AUTH_INVALID_CREDENTIALS')
    }

    const matched: UserWithRelations[] = []
    for (const user of candidates) {
      if (await this.passwords.verify(user.passwordHash, password)) matched.push(user)
    }

    if (matched.length === 0) throw new DomainError('AUTH_INVALID_CREDENTIALS')

    if (matched.length > 1) {
      // Bir xil email+parol bir nechta do'konda — qaysi biri ekanini so'raymiz
      throw new DomainError(
        'AUTH_TENANT_REQUIRED',
        'Bu email bir nechta do‘konda mavjud — birini tanlang',
        matched.map((u) => ({
          code: 'AUTH_TENANT_REQUIRED' as const,
          meta: { tenantId: u.tenant.id, tenantName: u.tenant.name },
        })),
      )
    }

    const user = matched[0]!
    this.assertUsable(user)

    // Xesh eski parametrlar bilan bo'lsa — jimgina yangilaymiz
    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(password) },
      })
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    return this.issue(user, meta)
  }

  /** Refresh cookie bo'yicha yangi access token */
  async refreshTokens(
    rawToken: string,
    meta: TokenMeta = {},
  ): Promise<{ response: LoginResponseDto; refreshToken: string }> {
    const { userId, token } = await this.refresh.rotate(rawToken, meta)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userInclude,
    })
    if (!user || user.deletedAt || !user.isActive) {
      throw new DomainError('AUTH_INVALID_REFRESH')
    }
    this.assertUsable(user)

    const access = await this.tokens.signAccess({
      sub: user.id,
      tid: user.tenantId,
      role: user.role,
      eid: user.employeeId,
    })
    return {
      response: {
        accessToken: access.token,
        expiresIn: access.expiresIn,
        user: toAuthUser(user),
      },
      refreshToken: token,
    }
  }

  async logout(rawToken?: string): Promise<void> {
    if (rawToken) await this.refresh.revoke(rawToken)
  }

  async logoutAll(userId: string): Promise<number> {
    return this.refresh.revokeAllForUser(userId)
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userInclude,
    })
    if (!user || user.deletedAt) throw new DomainError('AUTH_INVALID_CREDENTIALS')
    return toAuthUser(user)
  }

  /**
   * Parolni o'zgartiradi va BARCHA sessiyalarni yopadi.
   * Parol o'g'irlangan bo'lsa, o'g'ri sessiyasi ham yopilishi kerak.
   */
  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })
    if (!(await this.passwords.verify(user.passwordHash, current))) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Joriy parol noto‘g‘ri')
    }
    const passwordHash = await this.passwords.hash(next)
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } })
    await this.refresh.revokeAllForUser(userId)
    this.logger.log({ userId }, 'Parol o‘zgartirildi, barcha sessiyalar yopildi')
  }

  private assertUsable(user: UserWithRelations): void {
    if (user.tenant.status !== 'active') {
      throw new DomainError('AUTH_ACCOUNT_LOCKED', 'Do‘kon vaqtincha to‘xtatilgan')
    }
    if (user.employee.status === 'fired') {
      throw new DomainError('AUTH_ACCOUNT_LOCKED', 'Xodim ishdan bo‘shatilgan')
    }
  }

  private async issue(
    user: UserWithRelations,
    meta: TokenMeta,
  ): Promise<{ response: LoginResponseDto; refreshToken: string }> {
    const access = await this.tokens.signAccess({
      sub: user.id,
      tid: user.tenantId,
      role: user.role,
      eid: user.employeeId,
    })
    const refreshToken = await this.refresh.issue(user.id, meta)
    return {
      response: {
        accessToken: access.token,
        expiresIn: access.expiresIn,
        user: toAuthUser(user),
      },
      refreshToken,
    }
  }
}

/** Javob DTO'si — `passwordHash` shu yerda UMUMAN yo'q */
export function toAuthUser(user: UserWithRelations): AuthUserDto {
  return {
    id: user.id,
    name: user.employee.name,
    email: user.email,
    role: user.role,
    position: user.employee.position,
    employeeId: user.employeeId,
    tenant: { id: user.tenant.id, name: user.tenant.name },
  }
}
