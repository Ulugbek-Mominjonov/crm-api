import { RequestMethod, type INestApplication } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { ModulesContainer, Reflector } from '@nestjs/core'
import type { Router } from 'express'

/**
 * Klass darajasidagi metama'lumot (`@PlatformRoute()` kabi) Express
 * handler'ida ko'rinmaydi — controller klasslari modullar konteyneridan
 * olinadi va ularning yo'llari `METOD /yo'l` ko'rinishida yig'iladi.
 */
export function routesOfControllersWith(app: INestApplication, metadataKey: string): Set<string> {
  const reflector = app.get(Reflector)
  const out = new Set<string>()
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const cls = wrapper.metatype as (new () => unknown) | null
      if (!cls || !reflector.get<boolean>(metadataKey, cls)) continue
      const prefix = Reflect.getMetadata(PATH_METADATA, cls) as string
      const proto = cls.prototype as Record<string, unknown>
      for (const name of Object.getOwnPropertyNames(proto)) {
        const fn = proto[name]
        if (typeof fn !== 'function' || name === 'constructor') continue
        const path = Reflect.getMetadata(PATH_METADATA, fn) as string | undefined
        const method = Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined
        if (path === undefined || method === undefined) continue
        const segments = [prefix, path].flatMap((p) => p.split('/')).filter(Boolean)
        out.add(`${RequestMethod[method]} /api/v1/${segments.join('/')}`)
      }
    }
  }
  return out
}

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
