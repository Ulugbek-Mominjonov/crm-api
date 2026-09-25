import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import { ApiHeader } from '@nestjs/swagger'
import type { Request } from 'express'
import { DomainError } from '@/common/errors/domain.error'

/** ISO 8601 vaqt (mijoz yozuvning `updatedAt` qiymatini aynan qaytaradi) */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/

/**
 * `If-Match: <updatedAt>` (04 §4.4) — mijoz tahrirlashni boshlaganda
 * ko'rgan versiya. Sarlavha yo'q bo'lsa tekshirilmaydi (oxirgi yozuv
 * yutadi). ETag uslubidagi qo'shtirnoq ham qabul qilinadi.
 */
export const IfMatch = createParamDecorator((_data: unknown, ctx: ExecutionContext): Date | undefined => {
  const raw = ctx.switchToHttp().getRequest<Request>().get('if-match')
  if (raw === undefined) return undefined
  const value = raw.trim().replace(/^"(.*)"$/, '$1')
  if (!ISO_TIMESTAMP.test(value)) {
    throw new DomainError('VALIDATION_FAILED', '`If-Match` — yozuvning `updatedAt` qiymati (ISO 8601)', [
      { field: 'If-Match', code: 'VALIDATION_FAILED' },
    ])
  }
  return new Date(value)
})

/** Swagger: optimistik qulf sarlavhasi */
export const ApiIfMatch = (): MethodDecorator =>
  ApiHeader({
    name: 'If-Match',
    required: false,
    description: 'Yozuvning `updatedAt` qiymati: boshqa foydalanuvchi o‘zgartirgan bo‘lsa — 409 `VERSION_CONFLICT` (`current` bilan)',
  })
