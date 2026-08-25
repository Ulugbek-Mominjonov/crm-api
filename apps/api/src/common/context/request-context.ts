import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

/**
 * So'rov konteksti — loglar, audit va tenant izolyatsiyasi shu yerdan o'qiydi.
 *
 * `AsyncLocalStorage` tanlanishining sababi: kontekstni har bir funksiyaga
 * parametr sifatida uzatish kerak emas, lekin u global o'zgaruvchi ham emas —
 * har bir so'rov o'z nusxasini oladi.
 */
export interface RequestContext {
  requestId: string
  tenantId?: string
  userId?: string
  role?: string
}

const storage = new AsyncLocalStorage<RequestContext>()

/** Berilgan kontekstda funksiyani ishga tushiradi */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

/** Joriy kontekst yoki `undefined` (masalan cron ishida) */
export function tryContext(): RequestContext | undefined {
  return storage.getStore()
}

/**
 * Joriy kontekst. Yo'q bo'lsa — bu dasturchi xatosi (middleware ishlamagan),
 * shuning uchun jimgina davom etmaymiz.
 */
export function currentContext(): RequestContext {
  const ctx = storage.getStore()
  if (!ctx) {
    throw new Error('So‘rov konteksti yo‘q: middleware ishlamagan')
  }
  return ctx
}

/** Kontekstni to'ldiradi (login tekshiruvidan keyin tenant/user ma'lum bo'ladi) */
export function enrichContext(patch: Partial<RequestContext>): void {
  const ctx = storage.getStore()
  if (ctx) Object.assign(ctx, patch)
}

export function newRequestId(): string {
  return randomUUID()
}
