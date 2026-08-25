import type { INestApplication } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Router } from 'express'
import { IS_PUBLIC_KEY } from '@/modules/auth/decorators/public.decorator'
import { PERMISSION_KEY } from '@/modules/auth/decorators/require-permission.decorator'
import { createTestApp } from './helpers/app'
import { testDb } from './helpers/db'

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
])

interface RouteInfo {
  method: string
  path: string
  handler: (...args: unknown[]) => unknown
  controller: object
}

/** Express router'idan barcha yo'llarni yig'adi */
function collectRoutes(app: INestApplication): RouteInfo[] {
  const server = app.getHttpAdapter().getInstance() as { router?: Router; _router?: Router }
  const router = server.router ?? server._router
  const stack = (router as unknown as { stack: RouteStackItem[] }).stack
  const out: RouteInfo[] = []
  for (const layer of stack) {
    const route = layer.route
    if (!route) continue
    for (const [method, enabled] of Object.entries(route.methods)) {
      if (!enabled) continue
      const handleLayer = route.stack.at(-1)
      out.push({
        method: method.toUpperCase(),
        path: route.path,
        handler: handleLayer?.handle as RouteInfo['handler'],
        controller: {},
      })
    }
  }
  return out
}

interface RouteStackItem {
  route?: {
    path: string
    methods: Record<string, boolean>
    stack: { handle: unknown }[]
  }
}

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
    ])
  })
})
