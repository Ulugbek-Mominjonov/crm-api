import { ValidationPipe, type INestApplication } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { DomainExceptionFilter } from '@/common/filters/domain-exception.filter'
import { FieldVisibilityInterceptor } from '@/common/interceptors/field-visibility.interceptor'

export interface SetupOptions {
  /** CORS uchun ruxsat etilgan manbalar. Bo'sh bo'lsa CORS o'chiriladi. */
  origins?: string[]
}

/**
 * Global sozlamalar — `main.ts` va e2e testlar AYNI funksiyani chaqiradi.
 * Shunda test muhiti production bilan bir xil qoidalar ostida ishlaydi.
 */
export function setupApp(
  app: INestApplication,
  opts: SetupOptions = {},
): INestApplication {
  // `contentSecurityPolicy` o'chirilgan: bu JSON API, HTML bermaydi;
  // Swagger UI esa CSP bilan ishlamaydi. Statik kontent Caddy orqali beriladi.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))
  app.use(cookieParser())

  if (opts.origins?.length) {
    app.enableCors({
      // Faqat ro'yxatdagi manbalar. `*` HECH QACHON: refresh cookie
      // `credentials: true` bilan yuboriladi.
      origin: opts.origins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'If-Match', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'ETag'],
      maxAge: 3600,
    })
  }

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
  // Maxfiy maydonlar javobdan olib tashlanadi (03-security §3.6)
  app.useGlobalInterceptors(new FieldVisibilityInterceptor())

  // `health` ataylab prefiksdan tashqarida: orkestrator va yuk balanslagich
  // sozlamalari API versiyasiga bog'liq bo'lib qolmasin.
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] })

  // SIGTERM kelganda: yangi so'rov qabul qilinmaydi, joriylari tugatiladi,
  // keyin `onModuleDestroy` (baza ulanishi) chaqiriladi.
  app.enableShutdownHooks()
  return app
}
