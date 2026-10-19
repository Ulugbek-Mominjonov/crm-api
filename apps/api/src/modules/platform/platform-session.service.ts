import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Prisma } from '@prisma/client'
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

  /** Yangi token — XOM qiymati faqat shu yerda ko'rinadi; `db` — rotatsiya tranzaksiyasi */
  async issue(adminId: string, meta: TokenMeta = {}, parentId?: string, db: Prisma.TransactionClient = this.prisma): Promise<string> {
    const raw = newRawToken()
    await db.platformRefreshToken.create({
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

    // Bekor qilish va yangisini berish — BITTA tranzaksiya (do'kon sessiyasi bilan bir xil):
    // orasida uzilsa egasi sessiyasiz qolmasin
    return this.prisma.$transaction(async (tx) => {
      await tx.platformRefreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } })
      return { adminId: token.adminId, token: await this.issue(token.adminId, meta, token.id, tx) }
    })
  }

  async revoke(raw: string): Promise<void> {
    await this.prisma.platformRefreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  /** Barcha sessiyalar: refresh tokenlar bekor, undan oldingi access tokenlar ham (`tokens_invalid_before`, T-147) */
  async revokeAll(adminId: string): Promise<number> {
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.platformRefreshToken.updateMany({ where: { adminId, revokedAt: null }, data: { revokedAt: new Date() } }),
      // Soniyagacha: JWT `iat` soniyada — shu soniyada berilgan token amal qiladi
      this.prisma.platformAdmin.update({
        where: { id: adminId },
        data: { tokensInvalidBefore: new Date(Math.floor(Date.now() / 1000) * 1000) },
        select: { id: true },
      }),
    ])
    return count
  }
}
