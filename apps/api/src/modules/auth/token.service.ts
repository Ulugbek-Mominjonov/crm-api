import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Role } from '@prisma/client'
import type { Env } from '@/config/env.schema'

/**
 * Access token tarkibi.
 *
 * MUHIM: `tid` (tenantId) FAQAT shu yerdan olinadi. Uni so'rov tanasidan
 * yoki sarlavhadan qabul qilish izolyatsiyani darhol buzadi.
 */
export interface AccessTokenPayload {
  /** userId */
  sub: string
  /** tenantId */
  tid: string
  role: Role
  /** employeeId */
  eid: string
  /** token identifikatori — bekor qilish uchun */
  jti: string
}

@Injectable()
export class TokenService {
  private readonly privateKey: string
  private readonly publicKey: string
  /** Soniyada — `ms` kutubxonasining satr formatiga bog'lanmaymiz */
  private readonly accessTtlSec: number

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
  ) {
    // Kalitlar ishga tushishda O'QILADI: fayl yo'q bo'lsa server ko'tarilmaydi.
    // Bu birinchi kirish urinishida bilinganidan yaxshi.
    this.privateKey = readFileSync(config.get('JWT_PRIVATE_KEY_PATH', { infer: true }), 'utf8')
    this.publicKey = readFileSync(config.get('JWT_PUBLIC_KEY_PATH', { infer: true }), 'utf8')
    this.accessTtlSec = ttlToSeconds(config.get('ACCESS_TOKEN_TTL', { infer: true }))
  }

  /** RS256 — kelajakda boshqa servis faqat OCHIQ kalit bilan tekshira oladi */
  async signAccess(
    payload: Omit<AccessTokenPayload, 'jti'>,
  ): Promise<{ token: string; jti: string; expiresIn: number }> {
    const jti = randomUUID()
    // `jti` payload'ga qo'lda yozilmaydi — `jwtid` orqali beriladi, shunda
    // ro'yxatdan o'tgan da'volar (registered claims) kutubxona qoidasiga mos bo'ladi.
    const token = await this.jwt.signAsync(payload, {
      algorithm: 'RS256',
      privateKey: this.privateKey,
      expiresIn: this.accessTtlSec,
      jwtid: jti,
    })
    return { token, jti, expiresIn: this.accessTtlSec }
  }

  async verifyAccess(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      algorithms: ['RS256'],
      publicKey: this.publicKey,
    })
  }

  getPublicKey(): string {
    return this.publicKey
  }
}

/** '15m' → 900. Sxema formatni allaqachon tekshirgan. */
export function ttlToSeconds(ttl: string): number {
  const unit = ttl.at(-1)
  const value = Number(ttl.slice(0, -1))
  const factor = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86_400
  return value * factor
}
