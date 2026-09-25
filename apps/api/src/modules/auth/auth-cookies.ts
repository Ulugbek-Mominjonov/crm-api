import type { Request, Response } from 'express'
import { DomainError } from '@/common/errors/domain.error'

export const REFRESH_COOKIE = 'refresh_token'
/** Cookie faqat auth yo'llariga yuboriladi — boshqa endpointlarga kerak emas */
export const COOKIE_PATH = '/api/v1/auth'

export function setRefreshCookie(res: Response, token: string, maxAgeMs: number): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true, // JS o'qiy olmaydi — XSS bo'lsa ham token chiqmaydi
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', // CSRF himoyasi
    path: COOKIE_PATH,
    maxAge: maxAgeMs,
  })
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH })
}

export function readRefreshCookie(req: Request): string {
  const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined
  if (!raw) throw new DomainError('AUTH_INVALID_REFRESH', 'Sessiya cookie’si yo‘q')
  return raw
}
