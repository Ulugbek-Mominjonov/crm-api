import type { INestApplication } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '@/modules/auth/decorators/public.decorator'
import { PERMISSION_KEY } from '@/modules/auth/decorators/require-permission.decorator'
import { createTestApp } from './helpers/app'
import { testDb } from './helpers/db'
import { collectRoutes, type RouteInfo } from './helpers/routes'

/**
 * Har bir endpoint ATAYLAB tasniflangan bo'lishi kerak:
 *  · `@Public()` — autentifikatsiyasiz
 *  · `@RequirePermission(...)` — rol tekshiruvi bilan
 *  · quyidagi oq ro'yxatda — faqat autentifikatsiya yetarli
 *
 * Yangi endpoint qo'shilib, hech biriga kirmasa — SHU TEST yiqiladi.
 * Shu tariqa himoyalanmagan yo'l e'tibordan chetda qolmaydi.
 */

/** Faqat autentifikatsiya talab qiladigan yo'llar (rol farqi yo'q) */
const AUTH_ONLY = new Set([
  'POST /api/v1/auth/logout-all',
  'GET /api/v1/auth/me',
  'POST /api/v1/auth/change-password',
  // Kassir ham QQS va chegirma chegarasini bilishi kerak; maxfiy maydon yo'q
  'GET /api/v1/settings',
  // Fayl huquqi TURIGA bog'liq (rasm — products, eksport — finance …) —
  // FilesService tekshiradi (files-read, files-presign testlari)
  'POST /api/v1/files/presign',
  'POST /api/v1/files/:id/confirm',
  'GET /api/v1/files/:id',
  'GET /api/v1/files/:id/raw',
  'GET /api/v1/files/urls',
  'DELETE /api/v1/files/:id',
  // Eksport huquqi ro'yxatga bog'liq (sotuvlar — sales, mijozlar — customers …),
  // ishni faqat so'rovchi ko'radi — ExportsService tekshiradi (exports testi)
  'GET /api/v1/exports/:resource',
  'GET /api/v1/exports/jobs/:id',
  'GET /api/v1/exports/jobs/:id/download',
  // Migratsiya — faqat administrator (matritsada "faqat admin" resursi yo'q) — MigrationService tekshiradi
  'POST /api/v1/migration/validate',
  'POST /api/v1/migration/import',
  // Obuna va do'kon hisobi — faqat administrator (Billing/AccountService tekshiradi)
  'POST /api/v1/billing/invoices',
  'GET /api/v1/billing/invoices',
  'GET /api/v1/tenants/current',
  'POST /api/v1/tenants/current/delete',
  'POST /api/v1/tenants/current/restore',
  // Zaxira — faqat administrator (BackupService tekshiradi, tenant-export testi)
  'GET /api/v1/backup/export',
])

describe('Har bir endpoint himoyalangan', () => {
  let app: INestApplication
  let routes: RouteInfo[]

  beforeAll(async () => {
    app = await createTestApp()
    routes = collectRoutes(app)
  })

  afterAll(async () => {
    await app.close()
    await testDb.$disconnect()
  })

  it('yo‘llar ro‘yxati bo‘sh emas', () => {
    expect(routes.length).toBeGreaterThan(0)
  })

  it('har bir yo‘l tasniflangan: public, huquqli yoki oq ro‘yxatda', () => {
    const reflector = app.get(Reflector)
    const unclassified: string[] = []

    for (const route of routes) {
      const key = `${route.method} ${route.path}`
      const isPublic = reflector.get<boolean>(IS_PUBLIC_KEY, route.handler)
      const perm = reflector.get<unknown>(PERMISSION_KEY, route.handler)
      if (isPublic || perm || AUTH_ONLY.has(key)) continue
      unclassified.push(key)
    }

    expect(unclassified).toEqual([])
  })

  it('ochiq yo‘llar ro‘yxati kutilganidek', () => {
    const reflector = app.get(Reflector)
    const publicRoutes = routes
      .filter((r) => reflector.get<boolean>(IS_PUBLIC_KEY, r.handler))
      .map((r) => `${r.method} ${r.path}`)
      .sort()

    // Har bir ochiq yo'l ONGLI qaror. Ro'yxat o'zgarsa — test yiqiladi.
    expect(publicRoutes).toEqual([
      'GET /health/live',
      'GET /health/ready',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/logout',
      'POST /api/v1/auth/refresh',
      // To'lov provayderlari (T-126) — JWT emas, kalit/imzo bilan
      'POST /api/v1/billing/click/complete',
      'POST /api/v1/billing/click/prepare',
      'POST /api/v1/billing/payme',
      // Yangi do'kon ochish (T-124) — hisob hali yo'q; rate limit bilan
      'POST /api/v1/tenants/register',
    ])
  })
})
