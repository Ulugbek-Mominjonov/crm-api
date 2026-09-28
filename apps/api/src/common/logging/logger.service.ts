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

type Level = 'info' | 'error' | 'warn' | 'debug' | 'trace'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Error)

/** `error('xabar', err.stack)` dagi stack — kontekst (klass nomi) emas */
const isStack = (v: unknown): v is string => typeof v === 'string' && v.includes('\n    at ')

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

  private base(context = this.context): Record<string, unknown> {
    const ctx = tryContext()
    return {
      ...(context ? { context } : {}),
      ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx?.tenantId ? { tenantId: ctx.tenantId } : {}),
      ...(ctx?.userId ? { userId: ctx.userId } : {}),
    }
  }

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params)
  }
  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params)
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params)
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params)
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params)
  }

  /**
   * Ikkala chaqiruv shakli: pino — `warn({ fileId, err }, 'Rasm o‘qilmadi')` (kodda asosan shu)
   * va Nest — `log('xabar', { maydon })`, `error('xabar', stack)`. `new Logger(Klass)` oxirgi
   * argument sifatida kontekstni (klass nomini) qo'shadi.
   */
  private write(level: Level, message: unknown, params: unknown[]): void {
    const args = params.filter((p) => p !== undefined)
    const fields: Record<string, unknown> = {}
    let msg = message
    if (message instanceof Error) {
      fields.err = message
      msg = message.message
    } else if (isRecord(message)) {
      Object.assign(fields, message)
      msg = typeof args[0] === 'string' ? args.shift() : ''
    }
    const last = args.at(-1)
    const context = typeof last === 'string' && !isStack(last) ? (args.pop() as string) : this.context
    for (const arg of args) {
      if (isStack(arg)) fields.stack = arg
      else if (arg instanceof Error) fields.err = arg
      else if (isRecord(arg)) Object.assign(fields, arg)
    }
    this.root[level]({ ...this.base(context), ...redact(fields) }, String(msg))
  }
}
