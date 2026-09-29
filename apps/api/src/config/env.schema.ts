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

/** Bo'sh qiymat (`KEY=`) — berilmagan: namuna fayldagi bo'sh qator formatda yiqilmasin */
const blankAsUnset = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional())

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
    /** Fon navbati (T-096): `bullmq` — Redis orqali; `inline` — jarayon ichida (Redis'siz zaxira) */
    QUEUE_DRIVER: z.enum(['inline', 'bullmq']).default('inline'),

    // ── Auth ──
    JWT_PRIVATE_KEY_PATH: z.string().min(1),
    JWT_PUBLIC_KEY_PATH: z.string().min(1),
    ACCESS_TOKEN_TTL: duration.default('15m'),
    REFRESH_TOKEN_TTL: duration.default('30d'),

    // ── Transport ──
    WEB_ORIGINS: csv('http://localhost:5173'),
    /**
     * Ilova oldidagi ishonchli proksilar soni (Caddy — 1). 0 — proksi yo'q:
     * `X-Forwarded-For` e'tiborsiz qoldiriladi (aks holda mijoz uni soxtalashtirib
     * rate limitni aylanib o'tardi). Proksi ortida 0 qolsa esa `req.ip` — proksi
     * manzili va barcha foydalanuvchilar bitta rate limit hisobini bo'lishadi.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    /**
     * Swagger UI (`/api/docs`). Berilmasa — production'dan boshqa muhitda ochiq.
     * Production'da ochish — egasi qarori (Q115): API tuzilmasi repoda baribir ochiq.
     */
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === 'true')),

    // ── Obyekt saqlagich (09-storage) ──
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().min(1),
    S3_BACKUP_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_FORCE_PATH_STYLE: bool('true'),
    /** Rasm variantlari ishchisi davri (ms); 0 — o'chiq: faqat `orig` beriladi (testlar) */
    FILE_VARIANTS_INTERVAL_MS: z.coerce.number().int().min(0).default(10_000),

    // ── Ixtiyoriy integratsiyalar ──
    SMS_PROVIDER: z.enum(['eskiz', 'playmobile', 'none']).default('none'),
    /** eskiz — Bearer token; playmobile — `login:parol` (Basic) */
    SMS_TOKEN: z.string().optional(),
    /** Jo'natuvchi nomi/raqami (provayderda ro'yxatdan o'tgan) */
    SMS_SENDER: z.string().default('4546'),
    /** Bir tenant uchun kunlik SMS chegarasi (T-078) */
    SMS_DAILY_LIMIT: z.coerce.number().int().positive().default(1000),
    /** SMS navbati ishchisi qanchalik tez-tez aylanadi (ms); 0 — o'chiq (testlar) */
    SMS_DISPATCH_INTERVAL_MS: z.coerce.number().int().min(0).default(15_000),
    // ── Telegram bot (Q116): bog'langan mijozga xabar SMS o'rniga shu yerdan — token berilmasa o'chiq ──
    /** @BotFather bergan token */
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    /** Yangilanishlar: `webhook` — Telegram o'zi yuboradi (production); `polling` — ochiq manzilsiz (lokal) */
    TELEGRAM_UPDATES: z.enum(['webhook', 'polling']).default('webhook'),
    /** Ishga tushganda Telegram'ga o'rnatiladi: https://DOMEN/api/v1/telegram/webhook */
    TELEGRAM_WEBHOOK_URL: blankAsUnset(z.url()),
    /** Telegram har webhook so'rovida `X-Telegram-Bot-Api-Secret-Token` sarlavhasida yuboradi */
    TELEGRAM_WEBHOOK_SECRET: blankAsUnset(
      z.string().regex(/^[A-Za-z0-9_-]{32,256}$/, "32–256 belgi: harf, raqam, _ va - (openssl rand -hex 32)"),
    ),
    // ── Obuna to'lovlari (T-126) — berilmasa tegishli webhook o'chiq ──
    /** Payme Merchant API: kassa id (checkout havolasi) va kalit (webhook Basic auth) */
    PAYME_MERCHANT_ID: z.string().optional(),
    PAYME_KEY: z.string().optional(),
    /** Click SHOP API: xizmat va sotuvchi id, imzo kaliti */
    CLICK_SERVICE_ID: z.string().optional(),
    CLICK_MERCHANT_ID: z.string().optional(),
    CLICK_SECRET_KEY: z.string().optional(),
    // ── Fiskal chek (T-129) — o'chiq bo'lsa cheklar navbatga tushmaydi ──
    OFD_ENABLED: bool('false'),
    OFD_ENDPOINT: z.string().optional(),
    OFD_TOKEN: z.string().optional(),
    /** Fiskal navbat ishchisi qayta urinishlar uchun qanchalik tez-tez aylanadi (ms); 0 — o'chiq (testlar) */
    OFD_DISPATCH_INTERVAL_MS: z.coerce.number().int().min(0).default(30_000),
    SENTRY_DSN: z.string().optional(),
  })
  // Bog'liq shartlar: bir o'zgaruvchi ikkinchisini talab qiladi
  .refine((e) => e.CACHE_DRIVER !== 'redis' || !!e.REDIS_URL, {
    path: ['REDIS_URL'],
    message: "CACHE_DRIVER=redis bo'lsa REDIS_URL majburiy",
  })
  .refine((e) => e.QUEUE_DRIVER !== 'bullmq' || !!e.REDIS_URL, {
    path: ['REDIS_URL'],
    message: "QUEUE_DRIVER=bullmq bo'lsa REDIS_URL majburiy",
  })
  .refine((e) => e.SMS_PROVIDER === 'none' || !!e.SMS_TOKEN, {
    path: ['SMS_TOKEN'],
    message: "SMS provayderi tanlangan bo'lsa SMS_TOKEN majburiy",
  })
  .refine(
    (e) => !e.TELEGRAM_BOT_TOKEN || e.TELEGRAM_UPDATES === 'polling' || (!!e.TELEGRAM_WEBHOOK_URL && !!e.TELEGRAM_WEBHOOK_SECRET),
    {
      path: ['TELEGRAM_WEBHOOK_URL'],
      message: 'TELEGRAM_UPDATES=webhook bo‘lsa TELEGRAM_WEBHOOK_URL va TELEGRAM_WEBHOOK_SECRET majburiy',
    },
  )
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
