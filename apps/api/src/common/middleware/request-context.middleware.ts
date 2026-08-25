import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { newRequestId, runWithContext } from '@/common/context/request-context'

const TRACE_HEADER = 'x-request-id'

/**
 * Har bir so'rov uchun kontekst ochadi.
 *
 * `X-Request-Id` tashqaridan kelsa (yuk balanslagich, boshqa servis)
 * saqlanadi — shunda bitta so'rovni tizimlar bo'ylab kuzatib bo'ladi.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[TRACE_HEADER]
    const requestId =
      typeof incoming === 'string' && incoming.length <= 64
        ? incoming
        : newRequestId()

    res.setHeader(TRACE_HEADER, requestId)
    runWithContext({ requestId }, () => next())
  }
}
