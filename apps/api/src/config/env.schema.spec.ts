import { parseEnv } from './env.schema'

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/crm',
  JWT_PRIVATE_KEY_PATH: '/keys/private.pem',
  JWT_PUBLIC_KEY_PATH: '/keys/public.pem',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'crm-media-dev',
  S3_BACKUP_BUCKET: 'crm-backup-dev',
  S3_ACCESS_KEY: 'minioadmin',
  S3_SECRET_KEY: 'minioadmin',
} as unknown as NodeJS.ProcessEnv

describe('parseEnv', () => {
  it('to‘liq muhitni qabul qiladi va sukut qiymatlarni qo‘yadi', () => {
    const env = parseEnv(base)
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3000)
    expect(env.ACCESS_TOKEN_TTL).toBe('15m')
    expect(env.S3_FORCE_PATH_STYLE).toBe(true)
    expect(env.WEB_ORIGINS).toEqual(['http://localhost:5173'])
  })

  it('majburiy o‘zgaruvchi yetishmasa xato tashlaydi', () => {
    const { DATABASE_URL: _omit, ...rest } = base as Record<string, string>
    expect(() => parseEnv(rest as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/)
  })

  it('bo‘sh DATABASE_URL ni rad etadi', () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: '' })).toThrow(/DATABASE_URL/)
  })

  it('noto‘g‘ri muddat formatini rad etadi', () => {
    expect(() => parseEnv({ ...base, ACCESS_TOKEN_TTL: '15 daqiqa' })).toThrow(
      /ACCESS_TOKEN_TTL/,
    )
  })

  it('CACHE_DRIVER=redis bo‘lsa REDIS_URL talab qiladi', () => {
    expect(() => parseEnv({ ...base, CACHE_DRIVER: 'redis' })).toThrow(
      /REDIS_URL/,
    )
    expect(
      parseEnv({ ...base, CACHE_DRIVER: 'redis', REDIS_URL: 'redis://x:6379' })
        .CACHE_DRIVER,
    ).toBe('redis')
  })

  it('SWAGGER_ENABLED: berilmasa — aniqlanmagan (muhitga qarab), aks holda aniq true/false', () => {
    expect(parseEnv(base).SWAGGER_ENABLED).toBeUndefined()
    expect(parseEnv({ ...base, SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED).toBe(true)
    expect(parseEnv({ ...base, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false)
    expect(() => parseEnv({ ...base, SWAGGER_ENABLED: 'yes' })).toThrow(/SWAGGER_ENABLED/)
  })

  it('OFD yoqilsa endpoint va token talab qiladi', () => {
    expect(() => parseEnv({ ...base, OFD_ENABLED: 'true' })).toThrow(/OFD_/)
  })

  it('Telegram: webhook rejimida manzil va sir majburiy, polling — ularsiz', () => {
    const token = { TELEGRAM_BOT_TOKEN: '123:abc' }
    expect(() => parseEnv({ ...base, ...token })).toThrow(/TELEGRAM_WEBHOOK_URL/)
    expect(parseEnv({ ...base, ...token, TELEGRAM_UPDATES: 'polling' }).TELEGRAM_UPDATES).toBe('polling')
    const secret = 'a'.repeat(32)
    const env = parseEnv({ ...base, ...token, TELEGRAM_WEBHOOK_URL: 'https://crm.example.uz/api/v1/telegram/webhook', TELEGRAM_WEBHOOK_SECRET: secret })
    expect(env.TELEGRAM_UPDATES).toBe('webhook')
    expect(() => parseEnv({ ...base, TELEGRAM_WEBHOOK_SECRET: 'qisqa' })).toThrow(/TELEGRAM_WEBHOOK_SECRET/)
    // Namunadagi bo'sh qatorlar — berilmagan
    const blank = parseEnv({ ...base, TELEGRAM_BOT_TOKEN: '', TELEGRAM_WEBHOOK_URL: '', TELEGRAM_WEBHOOK_SECRET: '' })
    expect(blank.TELEGRAM_WEBHOOK_URL).toBeUndefined()
    expect(blank.TELEGRAM_WEBHOOK_SECRET).toBeUndefined()
  })

  it('vergulli ro‘yxatni massivga aylantiradi', () => {
    const env = parseEnv({ ...base, WEB_ORIGINS: 'https://a.uz, https://b.uz' })
    expect(env.WEB_ORIGINS).toEqual(['https://a.uz', 'https://b.uz'])
  })

  it('noto‘g‘ri S3_ENDPOINT (URL emas) ni rad etadi', () => {
    expect(() => parseEnv({ ...base, S3_ENDPOINT: 'localhost' })).toThrow(
      /S3_ENDPOINT/,
    )
  })
})
