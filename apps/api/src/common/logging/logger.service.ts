import { Injectable, Scope, type LoggerService } from '@nestjs/common'
import pino, { type Logger as PinoLogger } from 'pino'
import { tryContext } from '@/common/context/request-context'
import { redact, REDACT_PATHS } from './redaction'

export interface LoggerOptions {
  level: string
  pretty: boolean
}

/** Ildiz pino nusxasi — butun jarayon uchun bitta. */
export function createRootLogger({ level, pretty }: LoggerOptions): PinoLogger {
  const base = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    formatters: { level: (label: string) => ({ level: label }) },
    timestamp: pino.stdTimeFunctions.isoTime,
  }
  if (!pretty) return pino(base)

  try {
    return pino({
      ...base,
      transport: { target: 'pino-pretty', options: { colorize: true } },
    })
  } catch {
    // `pino-pretty` faqat ishlab chiqish qulayligi. U yo'q bo'lsa server
    // to'xtamaydi — JSON formatida yozishda davom etadi.
    return pino(base)
  }
}

/**
 * Nest logger'i pino ustida.
 *
 * Har bir yozuvga so'rov konteksti (`requestId`, `tenantId`, `userId`)
 * avtomatik qo'shiladi — qidiruvda bitta so'rovning butun izini ko'rish
 * uchun shu kerak.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private context?: string

  constructor(private readonly root: PinoLogger) {}

  setContext(context: string): void {
    this.context = context
  }

  private base(): Record<string, unknown> {
    const ctx = tryContext()
    return {
      ...(this.context ? { context: this.context } : {}),
      ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx?.tenantId ? { tenantId: ctx.tenantId } : {}),
      ...(ctx?.userId ? { userId: ctx.userId } : {}),
    }
  }

  log(message: unknown, ...meta: unknown[]): void {
    this.root.info({ ...this.base(), ...this.meta(meta) }, String(message))
  }
  error(message: unknown, ...meta: unknown[]): void {
    this.root.error({ ...this.base(), ...this.meta(meta) }, String(message))
  }
  warn(message: unknown, ...meta: unknown[]): void {
    this.root.warn({ ...this.base(), ...this.meta(meta) }, String(message))
  }
  debug(message: unknown, ...meta: unknown[]): void {
    this.root.debug({ ...this.base(), ...this.meta(meta) }, String(message))
  }
  verbose(message: unknown, ...meta: unknown[]): void {
    this.root.trace({ ...this.base(), ...this.meta(meta) }, String(message))
  }

  private meta(meta: unknown[]): Record<string, unknown> {
    const obj = meta.find((m) => m !== null && typeof m === 'object')
    return obj ? redact(obj as Record<string, unknown>) : {}
  }
}
