import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DomainError } from '@/common/errors/domain.error'
import type { Env } from '@/config/env.schema'
import { hashToken, newRawToken, type TokenMeta } from '@/modules/auth/refresh-token.service'
import { ttlToSeconds } from '@/modules/auth/token.service'
import { PrismaService } from '@/prisma/prisma.service'

/**
 * Egasi sessiyalari (T-135) — `RefreshTokenService` bilan bir xil qoida
 * (xesh, rotatsiya, bekor qilingan tokenni qayta ishlatish — barcha
 * sessiyalar yopiladi), lekin O'Z jadvalida: egasi hisobi `users` da emas,
 * do'kon sessiyalari bilan aralashmaydi.
 */
@Injectable()
export class PlatformSessionService {
  private readonly logger = new Logger(PlatformSessionService.name)
  private readonly ttlSec: number

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlSec = ttlToSeconds(config.get('REFRESH_TOKEN_TTL', { infer: true }))
  }

  get maxAgeMs(): number {
    return this.ttlSec * 1000
  }

  /** Yangi token — XOM qiymati faqat shu yerda ko'rinadi */
  async issue(adminId: string, meta: TokenMeta = {}, parentId?: string): Promise<string> {
    const raw = newRawToken()
    await this.prisma.platformRefreshToken.create({
      data: {
        adminId,
        tokenHash: hashToken(raw),
        parentId,
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
        expiresAt: new Date(Date.now() + this.maxAgeMs),
      },
    })
    return raw
  }

  /** Tekshiradi va ALMASHTIRADI (rotatsiya) */
  async rotate(raw: string, meta: TokenMeta = {}): Promise<{ adminId: string; token: string }> {
    const token = await this.prisma.platformRefreshToken.findUnique({ where: { tokenHash: hashToken(raw) } })
    if (!token) throw new DomainError('AUTH_INVALID_REFRESH')

    if (token.revokedAt) {
      await this.revokeAll(token.adminId)
      this.logger.warn({ adminId: token.adminId, tokenId: token.id }, 'Bekor qilingan egasi tokeni qayta ishlatildi — barcha sessiyalar yopildi')
      throw new DomainError('AUTH_TOKEN_REUSE')
    }
    if (token.expiresAt.getTime() < Date.now()) {
      throw new DomainError('AUTH_INVALID_REFRESH', 'Sessiya muddati tugagan')
    }

    await this.prisma.platformRefreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } })
    return { adminId: token.adminId, token: await this.issue(token.adminId, meta, token.id) }
  }

  async revoke(raw: string): Promise<void> {
    await this.prisma.platformRefreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async revokeAll(adminId: string): Promise<number> {
    const { count } = await this.prisma.platformRefreshToken.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return count
  }
}
