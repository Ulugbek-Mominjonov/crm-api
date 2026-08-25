import { Injectable } from '@nestjs/common'
import argon2 from 'argon2'
import { DomainError } from '@/common/errors/domain.error'

/**
 * Parol siyosati va xeshlash.
 *
 * argon2id tanlangan: u GPU va yon-kanal hujumlariga bir vaqtda qarshi
 * turadi (argon2i faqat yon-kanal, argon2d faqat GPU).
 */

/** OWASP tavsiyasiga yaqin, 512 MB'li instansiyada ham ishlaydigan parametrlar */
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128

/**
 * Eng ko'p uchraydigan parollar. To'liq ro'yxat emas — u faqat eng qo'pol
 * holatlarni to'sadi; asosiy himoya uzunlik va rate limit.
 */
const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'password', 'parol123',
  'qwerty123', 'admin123', 'iloveyou', '11111111', 'abc12345',
  'password1', 'qwertyui', 'admin1234', '87654321',
])

@Injectable()
export class PasswordService {
  /**
   * Parolni tekshiradi va xeshlaydi.
   * Kuchsiz parol XATO beradi — jimgina qabul qilinmaydi.
   */
  async hash(plain: string): Promise<string> {
    this.assertStrong(plain)
    return argon2.hash(plain, ARGON_OPTIONS)
  }

  /**
   * Parolni solishtiradi. Xesh buzuq bo'lsa ham `false` qaytaradi —
   * istisno tashlash foydalanuvchi mavjudligini oshkor qilardi.
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain)
    } catch {
      return false
    }
  }

  /** Xesh eski parametrlar bilan yaratilganmi? (kirish paytida yangilanadi) */
  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, ARGON_OPTIONS)
    } catch {
      return true
    }
  }

  /** Siyosatga mos kelmasa `DomainError` tashlaydi */
  assertStrong(plain: string): void {
    const issues = passwordIssues(plain)
    if (issues.length > 0) {
      throw new DomainError(
        'VALIDATION_FAILED',
        issues.join('; '),
        issues.map((message) => ({
          field: 'password',
          code: 'VALIDATION_FAILED' as const,
          meta: { message },
        })),
      )
    }
  }
}

/** Parol muammolari ro'yxati (bo'sh — muammo yo'q). Sof funksiya — testlanadi. */
export function passwordIssues(plain: string): string[] {
  const issues: string[] = []
  if (plain.length < MIN_PASSWORD_LENGTH) {
    issues.push(`Parol kamida ${MIN_PASSWORD_LENGTH} belgidan iborat bo‘lsin`)
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    issues.push(`Parol ${MAX_PASSWORD_LENGTH} belgidan uzun bo‘lmasin`)
  }
  if (plain.trim() !== plain) {
    issues.push('Parol boshida yoki oxirida bo‘sh joy bo‘lmasin')
  }
  if (COMMON_PASSWORDS.has(plain.toLowerCase())) {
    issues.push('Bu parol juda ko‘p ishlatiladi — boshqasini tanlang')
  }
  if (/^(.)\1+$/.test(plain)) {
    issues.push('Parol bir xil belgilardan iborat bo‘lmasin')
  }
  return issues
}
