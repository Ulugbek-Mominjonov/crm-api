import { z } from 'zod'

/**
 * Muhit o'zgaruvchilari sxemasi.
 *
 * Server ishga tushishidan OLDIN tekshiriladi: noto'g'ri konfiguratsiya
 * bilan ishlagandan ko'ra darhol to'xtagan yaxshi — aks holda xato faqat
 * birinchi sotuvda, ya'ni eng yomon paytda ma'lum bo'ladi.
 */

/** '15m', '30d', '900s' ko'rinishidagi muddat */
const duration = z
  .string()
  .regex(/^\d+[smhd]$/, "muddat '15m', '2h', '30d' ko'rinishida bo'lishi kerak")

/**
 * '.default()' ATAYLAB '.transform()' dan OLDIN: zod 4 da keyin qo'yilsa
 * sukut qiymat chiqish tipiga (bu yerda boolean) tegishli bo'lib qoladi va
 * "false" satri true bo'lib ketadi.
 */
const bool = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true')

const port = z.coerce.number().int().min(1).max(65_535)

/** Vergul bilan ajratilgan ro'yxat → massiv */
const csv = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),
    PORT: port.default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),

    // ── Baza ──
    DATABASE_URL: z.string().min(1),
    /** Migratsiya uchun — pooler'siz, RLS'ni chetlab o'tadigan rol */
    DIRECT_DATABASE_URL: z.string().min(1).optional(),

    // ── Kesh / navbat ──
    CACHE_DRIVER: z.enum(['memory', 'redis', 'none']).default('memory'),
    REDIS_URL: z.string().optional(),

    // ── Auth ──
    JWT_PRIVATE_KEY_PATH: z.string().min(1),
    JWT_PUBLIC_KEY_PATH: z.string().min(1),
    ACCESS_TOKEN_TTL: duration.default('15m'),
    REFRESH_TOKEN_TTL: duration.default('30d'),

    // ── Transport ──
    WEB_ORIGINS: csv('http://localhost:5173'),

    // ── Obyekt saqlagich (09-storage) ──
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().min(1),
    S3_BACKUP_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: bool('true'),

    // ── Ixtiyoriy integratsiyalar ──
    SMS_PROVIDER: z.enum(['eskiz', 'playmobile', 'none']).default('none'),
    SMS_TOKEN: z.string().optional(),
    OFD_ENABLED: bool('false'),
    OFD_ENDPOINT: z.string().optional(),
    OFD_TOKEN: z.string().optional(),
    PDF_ENABLED: bool('false'),
    SENTRY_DSN: z.string().optional(),
  })
  // Bog'liq shartlar: bir o'zgaruvchi ikkinchisini talab qiladi
  .refine((e) => e.CACHE_DRIVER !== 'redis' || !!e.REDIS_URL, {
    path: ['REDIS_URL'],
    message: "CACHE_DRIVER=redis bo'lsa REDIS_URL majburiy",
  })
  .refine((e) => e.SMS_PROVIDER === 'none' || !!e.SMS_TOKEN, {
    path: ['SMS_TOKEN'],
    message: "SMS provayderi tanlangan bo'lsa SMS_TOKEN majburiy",
  })
  .refine((e) => !e.OFD_ENABLED || (!!e.OFD_ENDPOINT && !!e.OFD_TOKEN), {
    path: ['OFD_ENDPOINT'],
    message: 'OFD_ENABLED=true bo‘lsa OFD_ENDPOINT va OFD_TOKEN majburiy',
  })

export type Env = z.infer<typeof envSchema>

/** Xatolarni bitta o'qiladigan xabarga yig'adi */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `  · ${i.path.join('.') || '(ildiz)'}: ${i.message}`)
    .join('\n')
}

/**
 * Muhitni tekshiradi. Xato bo'lsa **istisno tashlaydi** — chaqiruvchi
 * jarayonni to'xtatadi.
 */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(
      `Muhit o‘zgaruvchilari noto‘g‘ri:\n${formatIssues(result.error)}\n` +
        'Namuna uchun .env.example ga qarang.',
    )
  }
  return result.data
}
