/**
 * Loglardan olib tashlanadigan maydonlar.
 *
 * Sabab: log fayllari uzoq saqlanadi, tashqi xizmatga (Sentry, Grafana)
 * yuboriladi va ko'p odam ko'radi. Parol yoki token bir marta logga tushsa,
 * uni qaytarib olib bo'lmaydi.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.s3SecretKey',
  'body.password',
  'body.token',
]

/** Maydon nomi maxfiymi? (qo'lda log yozishda ishlatiladi) */
const SENSITIVE = /(password|passwd|secret|token|authorization|cookie|apikey|api_key)/i

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE.test(key)
}

/**
 * Obyektdagi maxfiy maydonlarni `[redacted]` bilan almashtiradi.
 * Chuqurlik cheklangan — aylanma havolada osilib qolmasin.
 */
export function redact<T>(value: T, depth = 4): T {
  if (depth <= 0 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, depth - 1)) as unknown as T
  }
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isSensitiveKey(k) ? '[redacted]' : redact(v, depth - 1)
  }
  return out as T
}
