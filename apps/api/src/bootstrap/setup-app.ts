import { ValidationPipe } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import { json } from 'express'
import helmet from 'helmet'
import { DomainExceptionFilter } from '@/common/filters/domain-exception.filter'
import { RealtimeIoAdapter } from '@/modules/realtime/realtime-io.adapter'

/**
 * JSON tanasining eng katta hajmi. Express sukuti (100 KB) mahsulot
 * importiga yetmaydi: 5000 qator (04-api §2) ~2 MB. Chegara baribir
 * qo'yiladi — cheksiz tana xotirani to'ldirish hujumiga yo'l ochadi.
 */
export const JSON_BODY_LIMIT = '4mb'

/**
 * Migratsiya (07 §7.5): 3 yillik do'kon ~5 MB JSON, rasmlar (dataURL) bilan
 * ko'proq. Kattaroq chegara FAQAT shu yo'lga — boshqalarida 4 MB qoladi.
 */
export const MIGRATION_BODY_LIMIT = '25mb'
export const MIGRATION_PATH = '/api/v1/migration'

export interface SetupOptions {
  /** CORS uchun ruxsat etilgan manbalar. Bo'sh bo'lsa CORS o'chiriladi. */
  origins?: string[]
  /** Ishonchli proksilar soni (`TRUST_PROXY`): `req.ip` — rate limit shu bo'yicha */
  trustProxy?: number
}

/**
 * Global sozlamalar — `main.ts` va e2e testlar AYNI funksiyani chaqiradi.
 * Shunda test muhiti production bilan bir xil qoidalar ostida ishlaydi.
 */
export function setupApp(
  app: NestExpressApplication,
  opts: SetupOptions = {},
): NestExpressApplication {
  // `contentSecurityPolicy` o'chirilgan: bu JSON API, HTML bermaydi;
  // Swagger UI esa CSP bilan ishlamaydi. Statik kontent Caddy orqali beriladi.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
  // Faqat aniq hop soni: `true` X-Forwarded-For dagi eng chapdagi (mijoz yozgan) manzilni olardi
  if (opts.trustProxy) app.set('trust proxy', opts.trustProxy)
  app.use(cookieParser())
  // Avval — yo'lga xos: tana o'qilgach umumiy parser uni qayta o'qimaydi
  app.use(MIGRATION_PATH, json({ limit: MIGRATION_BODY_LIMIT }))
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT })

  if (opts.origins?.length) {
    app.enableCors({
      // Faqat ro'yxatdagi manbalar. `*` HECH QACHON: refresh cookie
      // `credentials: true` bilan yuboriladi.
      origin: opts.origins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match', 'X-Request-Id'],
      // Content-Disposition — eksport fayli nomi (frontend boshqa domenda)
      exposedHeaders: ['X-Request-Id', 'ETag', 'Idempotent-Replay', 'Content-Disposition'],
      maxAge: 3600,
    })
  }

  // Realtime (`/events`) — CORS ro'yxati HTTP bilan bir xil
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, opts.origins ?? []))

  app.useGlobalPipes(
    new ValidationPipe({
      // DTO da e'lon qilinmagan maydonlar OLIB TASHLANADI...
      whitelist: true,
      // ...va ular yuborilgan bo'lsa so'rov rad etiladi.
      // Aks holda mijoz `role: "admin"` kabi maydonni yashirincha qo'shishi mumkin.
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  )
  app.useGlobalFilters(new DomainExceptionFilter())
  // Maxfiy maydonlar (03-security §3.6) — `FieldVisibilityInterceptor`, AppModule'da (DI: do'kon sozlamasi)

  // `health` ataylab prefiksdan tashqarida: orkestrator va yuk balanslagich
  // sozlamalari API versiyasiga bog'liq bo'lib qolmasin.
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] })

  // SIGTERM kelganda: yangi so'rov qabul qilinmaydi, joriylari tugatiladi,
  // keyin `onModuleDestroy` (baza ulanishi) chaqiriladi.
  app.enableShutdownHooks()
  return app
}
