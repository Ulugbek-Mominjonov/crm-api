import type { INestApplication } from '@nestjs/common'
import type { Router } from 'express'

export interface RouteInfo {
  method: string
  path: string
  handler: (...args: unknown[]) => unknown
}

interface RouteStackItem {
  route?: {
    path: string
    methods: Record<string, boolean>
    stack: { handle: unknown }[]
  }
}

/**
 * Ilovadagi BARCHA HTTP yo'llari — Express router'idan.
 *
 * Xavfsizlik testlari (himoya, izolyatsiya) ro'yxatni qo'lda emas, shu
 * yerdan oladi: yangi endpoint qo'shilsa u avtomatik tekshiruvga tushadi.
 */
export function collectRoutes(app: INestApplication): RouteInfo[] {
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
      })
    }
  }
  return out
}
