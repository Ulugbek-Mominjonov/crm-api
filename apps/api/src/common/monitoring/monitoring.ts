import * as Sentry from '@sentry/node'
import { isSensitiveKey } from '@/common/logging/redaction'

export interface MonitoringOptions {
  dsn: string
  environment: string
  release?: string
}

/**
 * Xatolar kuzatuvi (T-122, 11 §11.10) — Sentry, faqat `SENTRY_DSN` berilsa.
 * Shaxsiy ma'lumot yuborilmaydi: so'rov tanasi, cookie, `Authorization`
 * va maxfiy nomli maydonlar olib tashlanadi. Unumdorlik izlari o'chiq —
 * bepul tarif hajmi faqat xatolarga.
 */
export function initMonitoring({ dsn, environment, release }: MonitoringOptions): void {
  Sentry.init({
    dsn,
    environment,
    release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data
        delete event.request.cookies
        event.request.headers = Object.fromEntries(
          Object.entries(event.request.headers ?? {}).filter(([name]) => !isSensitiveKey(name)),
        )
      }
      return event
    },
  })
}

/** Kutilmagan xato (5xx) — `traceId` bilan: loglardan shu so'rovni topish uchun */
export function reportError(err: unknown, traceId: string): void {
  if (!Sentry.isInitialized()) return
  Sentry.captureException(err, { tags: { traceId } })
}

/** Darhol e'tibor talab qiladigan holat (invariant buzilishi) */
export function alertCritical(message: string, extra: Record<string, unknown>): void {
  if (!Sentry.isInitialized()) return
  Sentry.captureMessage(message, { level: 'fatal', extra })
}
