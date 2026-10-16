import type { Request, Response } from 'express'
import { DomainError } from '@/common/errors/domain.error'

/** Cookie nomi va yo'li: cookie faqat o'z auth yo'llariga yuboriladi — boshqa endpointlarga kerak emas */
export interface RefreshCookie {
  name: string
  path: string
}

export const REFRESH_COOKIE = 'refresh_token'
export const COOKIE_PATH = '/api/v1/auth'
/** Do'kon foydalanuvchisi sessiyasi */
export const STORE_COOKIE: RefreshCookie = { name: REFRESH_COOKIE, path: COOKIE_PATH }
/** Platforma egasi sessiyasi (T-135) — alohida nom va yo'l: ikki panel bitta brauzerda aralashmaydi */
export const PLATFORM_COOKIE: RefreshCookie = { name: 'platform_refresh', path: '/api/v1/platform/auth' }

export function setRefreshCookie(res: Response, token: string, maxAgeMs: number, cookie: RefreshCookie = STORE_COOKIE): void {
  res.cookie(cookie.name, token, {
    httpOnly: true, // JS o'qiy olmaydi — XSS bo'lsa ham token chiqmaydi
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', // CSRF himoyasi
    path: cookie.path,
    maxAge: maxAgeMs,
  })
}

export function clearRefreshCookie(res: Response, cookie: RefreshCookie = STORE_COOKIE): void {
  res.clearCookie(cookie.name, { path: cookie.path })
}

export function readRefreshCookie(req: Request, cookie: RefreshCookie = STORE_COOKIE): string {
  const raw = req.cookies?.[cookie.name] as string | undefined
  if (!raw) throw new DomainError('AUTH_INVALID_REFRESH', 'Sessiya cookie’si yo‘q')
  return raw
}
