import { createHash, randomBytes } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { RefreshToken } from '@prisma/client'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import { DomainError } from '@/common/errors/domain.error'
import type { Env } from '@/config/env.schema'
import { ttlToSeconds } from './token.service'

/** Token uzunligi — 32 bayt = 256 bit entropiya */
const TOKEN_BYTES = 32

export interface TokenMeta {
  userAgent?: string
  ip?: string
}

/** Xom tokenni xeshlaydi. Bazada FAQAT xesh saqlanadi. */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Refresh tokenlar: rotatsiya va o'g'irlanishni aniqlash.
 *
 * Har yangilashda eski token bekor qilinadi. Agar bekor qilingan token
 * qayta ishlatilsa — bu o'g'irlangan degani va foydalanuvchining BARCHA
 * tokenlari bekor qilinadi (03-security §3.2).
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name)
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

  /** Yangi token yaratadi va XOM qiymatini qaytaradi (u faqat shu yerda ko'rinadi) */
  async issue(userId: string, meta: TokenMeta = {}, parentId?: string): Promise<string> {
    const raw = randomBytes(TOKEN_BYTES).toString('base64url')
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(raw),
        parentId,
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
        expiresAt: new Date(Date.now() + this.maxAgeMs),
      },
    })
    return raw
  }

  /**
   * Tokenni tekshiradi va ALMASHTIRADI (rotatsiya).
   * Muvaffaqiyatli bo'lsa yangi xom token qaytadi.
   */
  async rotate(raw: string, meta: TokenMeta = {}): Promise<{ userId: string; token: string }> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(raw) },
    })
    if (!token) throw new DomainError('AUTH_INVALID_REFRESH')

    if (token.revokedAt) {
      // Bekor qilingan token qayta ishlatildi — o'g'irlangan deb hisoblaymiz
      await this.revokeAllForUser(token.userId)
      this.logger.warn(
        { userId: token.userId, tokenId: token.id },
        'Bekor qilingan refresh token qayta ishlatildi — barcha sessiyalar yopildi',
      )
      throw new DomainError('AUTH_TOKEN_REUSE')
    }

    if (token.expiresAt.getTime() < Date.now()) {
      throw new DomainError('AUTH_INVALID_REFRESH', 'Sessiya muddati tugagan')
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: token.id },
        data: { revokedAt: new Date() },
      })
      const raw2 = randomBytes(TOKEN_BYTES).toString('base64url')
      await tx.refreshToken.create({
        data: {
          userId: token.userId,
          tokenHash: hashToken(raw2),
          parentId: token.id,
          userAgent: meta.userAgent?.slice(0, 255),
          ip: meta.ip,
          expiresAt: new Date(Date.now() + this.maxAgeMs),
        },
      })
      return { userId: token.userId, token: raw2 }
    })
  }

  /** Bitta tokenni bekor qiladi (chiqish) */
  async revoke(raw: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  /**
   * Barcha qurilmalardan chiqish. `tx` berilsa — o'sha tranzaksiyada:
   * foydalanuvchi o'chirilib, sessiyalari ochiq qolmasin.
   */
  async revokeAllForUser(userId: string, tx?: TenantTx): Promise<number> {
    const client = tx ?? this.prisma
    const { count } = await client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return count
  }

  /** Muddati o'tgan tokenlarni tozalash (rejalashtirilgan ish) */
  async purgeExpired(): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    return count
  }

  async findByRaw(raw: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } })
  }
}
