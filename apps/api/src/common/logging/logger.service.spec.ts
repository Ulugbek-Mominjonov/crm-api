import { Writable } from 'node:stream'
import { ConsoleLogger, Logger } from '@nestjs/common'
import pino from 'pino'
import { AppLogger } from './logger.service'
import { REDACT_PATHS } from './redaction'

/** AppLogger yozgan qatorlar (JSON) — xotirada */
function capture(): { logger: AppLogger; lines: () => Record<string, unknown>[] } {
  const out: string[] = []
  const stream = new Writable({
    write(chunk, _enc, cb) {
      out.push(String(chunk))
      cb()
    },
  })
  const logger = new AppLogger(pino({ level: 'trace', redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, stream))
  return { logger, lines: () => out.map((line) => JSON.parse(line) as Record<string, unknown>) }
}

describe('AppLogger', () => {
  // Servislar `new Logger(Klass)` ishlatadi — Nest chaqiruvni ilova loggeriga (AppLogger) uzatadi
  afterEach(() => Logger.overrideLogger(new ConsoleLogger()))

  it('pino shakli: maydonlar va xabar saqlanadi, kontekst — klass nomi', () => {
    const { logger, lines } = capture()
    Logger.overrideLogger(logger)
    new Logger('ClickService').warn({ clickTransId: '42' }, 'Click: imzo mos emas')
    expect(lines()[0]).toMatchObject({ level: 40, msg: 'Click: imzo mos emas', clickTransId: '42', context: 'ClickService' })
  })

  it('pino shakli: `err` — xabari va stack bilan', () => {
    const { logger, lines } = capture()
    Logger.overrideLogger(logger)
    new Logger('PrismaService').error({ err: new Error('ulanish uzildi'), tenantId: 't_1' }, 'COMMIT’dan keyingi amal yiqildi')
    const [line] = lines()
    expect(line).toMatchObject({ msg: 'COMMIT’dan keyingi amal yiqildi', tenantId: 't_1', context: 'PrismaService' })
    expect(line?.err).toMatchObject({ type: 'Error', message: 'ulanish uzildi' })
    expect(String((line?.err as { stack?: string }).stack)).toContain('ulanish uzildi')
  })

  it('Nest shakli: meta obyekt maydonlari, maxfiylari yashiriladi', () => {
    const { logger, lines } = capture()
    logger.log('Kirish urinishi', { email: 'a@b.uz', password: 'sirli' })
    expect(lines()[0]).toMatchObject({ msg: 'Kirish urinishi', email: 'a@b.uz', password: '[redacted]' })
    expect(lines()[0]).not.toHaveProperty('context')
  })

  it('Nest shakli: `error(xabar, stack)` — stack alohida maydon, kontekst — klass nomi', () => {
    const { logger, lines } = capture()
    Logger.overrideLogger(logger)
    const stack = 'Error: boom\n    at handler (app.js:1:1)'
    new Logger('ExceptionsHandler').error('boom', stack)
    expect(lines()[0]).toMatchObject({ msg: 'boom', stack, context: 'ExceptionsHandler' })
  })

  it('Error xabar sifatida — `err` maydoni va uning matni', () => {
    const { logger, lines } = capture()
    logger.error(new Error('kutilmagan'))
    expect(lines()[0]).toMatchObject({ msg: 'kutilmagan', err: { message: 'kutilmagan' } })
  })
})
