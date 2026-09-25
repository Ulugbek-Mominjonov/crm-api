import { Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { DomainError } from '@/common/errors/domain.error'
import { TenantProvisioningService } from '@/modules/tenants/tenant-provisioning.service'
import type { RegisterDto } from './dto/register.dto'
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

/** Parol tekshiruvi uchun minimal ma'lumot (tenant hali tanlanmagan) */
interface LoginCandidate {
  id: string
  tenantId: string
  passwordHash: string
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refresh: RefreshTokenService,
    private readonly provisioning: TenantProvisioningService,
  ) {}

  /**
   * Yangi do'kon (T-124, 07 §7.9): do'kon, sozlama, sukut ombor, egasi
   * (administrator) — bitta tranzaksiyada; javob — kirish bilan bir xil
   * (sessiya darhol). Parol siyosati xeshlashda tekshiriladi.
   */
  async register(
    dto: RegisterDto,
    meta: TokenMeta = {},
  ): Promise<{ response: LoginResponseDto; refreshToken: string }> {
    const passwordHash = await this.passwords.hash(dto.password)
    const { tenantId, userId } = await this.provisioning.provision({
      tenantName: dto.storeName,
      owner: { name: dto.ownerName, phone: dto.phone, email: dto.email, passwordHash },
    })
    const user = await this.prisma.inTenantTransaction(tenantId, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId }, include: userInclude }),
    )
    this.logger.log({ tenantId, userId }, 'Yangi do‘kon ro‘yxatdan o‘tdi')
    return this.issue(user, meta)
  }

  async login(
    email: string,
    password: string,
    meta: TokenMeta & { tenantId?: string } = {},
  ): Promise<{ response: LoginResponseDto; refreshToken: string }> {
    const candidates = await this.findLoginCandidates(email.trim().toLowerCase(), meta.tenantId)

    if (candidates.length === 0) {
      // Vaqtni tenglashtirish uchun baribir tekshiramiz
      await this.passwords.verify(DUMMY_HASH, password)
      throw new DomainError('AUTH_INVALID_CREDENTIALS')
    }

    const matched: LoginCandidate[] = []
    for (const candidate of candidates) {
      // Ketma-ket ATAYLAB: argon2 har chaqiruvda ~19 MiB xotira oladi,
      // parallel tekshiruv kichik instansiyani cho'ktirishi mumkin.
      // Nomzodlar soni MAX_TENANT_CANDIDATES bilan cheklangan.
      // eslint-disable-next-line no-await-in-loop
      if (await this.passwords.verify(candidate.passwordHash, password)) matched.push(candidate)
    }

    if (matched.length === 0) throw new DomainError('AUTH_INVALID_CREDENTIALS')

    if (matched.length > 1) {
      // Bir xil email+parol bir nechta do'konda — qaysi biri ekanini so'raymiz
      const tenants = await this.prisma.tenant.findMany({
        where: { id: { in: matched.map((c) => c.tenantId) } },
        select: { id: true, name: true },
      })
      throw new DomainError(
        'AUTH_TENANT_REQUIRED',
        'Bu email bir nechta do‘konda mavjud — birini tanlang',
        tenants.map((t) => ({
          code: 'AUTH_TENANT_REQUIRED' as const,
          meta: { tenantId: t.id, tenantName: t.name },
        })),
      )
    }

    const candidate = matched[0]!
    // Xesh eski parametrlar bilan bo'lsa — jimgina yangilaymiz. Xeshlash
    // sekin, shuning uchun tranzaksiyadan OLDIN
    const rehash = this.passwords.needsRehash(candidate.passwordHash)
      ? await this.passwords.hash(password)
      : undefined

    const user = await this.prisma.inTenantTransaction(candidate.tenantId, async (tx) => {
      const found = await tx.user.findUniqueOrThrow({ where: { id: candidate.id }, include: userInclude })
      // Bo'shatilgan xodim — hech narsa yozilmaydi
      this.assertUsable(found)
      await tx.user.update({
        where: { id: candidate.id },
        data: { lastLoginAt: new Date(), ...(rehash && { passwordHash: rehash }) },
      })
      return found
    })

    return this.issue(user, meta)
  }

  /** Refresh cookie bo'yicha yangi access token */
  async refreshTokens(
    rawToken: string,
    meta: TokenMeta = {},
  ): Promise<{ response: LoginResponseDto; refreshToken: string }> {
    const { userId, token } = await this.refresh.rotate(rawToken, meta)
    const tenantId = await this.findUserTenant(userId)
    if (!tenantId) throw new DomainError('AUTH_INVALID_REFRESH')

    const user = await this.prisma.inTenantTransaction(tenantId, (tx) =>
      tx.user.findUnique({ where: { id: userId }, include: userInclude }),
    )
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

  /** Autentifikatsiyalangan so'rov — so'rov tranzaksiyasida (RLS bilan) */
  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.prisma.scoped.user.findUnique({
      where: { id: userId },
      include: userInclude,
    })
    if (!user || user.deletedAt) throw new DomainError('AUTH_INVALID_CREDENTIALS')
    return toAuthUser(user)
  }

  /**
   * Parolni o'zgartiradi va BARCHA sessiyalarni yopadi — bitta
   * tranzaksiyada. Parol o'g'irlangan bo'lsa, o'g'ri sessiyasi ham yopilishi kerak.
   */
  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const db = this.prisma.scoped
    const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
    if (!user || !(await this.passwords.verify(user.passwordHash, current))) {
      throw new DomainError('AUTH_INVALID_CREDENTIALS', 'Joriy parol noto‘g‘ri')
    }
    const passwordHash = await this.passwords.hash(next)
    await db.user.update({ where: { id: userId }, data: { passwordHash } })
    await this.refresh.revokeAllForUser(userId, db)
    this.logger.log({ userId }, 'Parol o‘zgartirildi, barcha sessiyalar yopildi')
  }

  /**
   * Kirishda tenant hali NOMA'LUM: foydalanuvchi email bo'yicha barcha
   * do'konlardan qidiriladi. RLS buni faqat `app.auth_email` o'rnatilgan
   * tranzaksiyada va FAQAT shu email uchun ochadi (`users_auth_lookup`).
   * Bu yerda faqat tekshiruv uchun kerakli ustunlar — qolgani tenant
   * tranzaksiyasida o'qiladi.
   */
  private async findLoginCandidates(email: string, tenantId?: string): Promise<LoginCandidate[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.auth_email', ${email}, true)`
      return tx.user.findMany({
        where: { email, deletedAt: null, isActive: true, ...(tenantId && { tenantId }) },
        select: { id: true, tenantId: true, passwordHash: true },
        take: MAX_TENANT_CANDIDATES,
      })
    })
  }

  /** Refresh: token foydalanuvchisi qaysi do'konda (`app.auth_user_id` bilan) */
  private async findUserTenant(userId: string): Promise<string | undefined> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.auth_user_id', ${userId}, true)`
      return tx.user.findUnique({ where: { id: userId }, select: { tenantId: true } })
    })
    return row?.tenantId
  }

  /**
   * Do'kon holati bu yerda TEKSHIRILMAYDI: to'xtatilgan (`suspended`) va
   * o'chirilayotgan (`deleting`) do'konga kirish mumkin — u faqat-o'qish
   * rejimida (`ReadOnlyTenantInterceptor`), administrator esa kirib to'lashi,
   * zaxira olishi va o'chirishni bekor qilishi kerak (T-127).
   */
  private assertUsable(user: UserWithRelations): void {
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
    tenant: { id: user.tenant.id, name: user.tenant.name, status: user.tenant.status },
  }
}
