import {
  HttpStatus, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor,
} from '@nestjs/common'
import { HTTP_CODE_METADATA } from '@nestjs/common/constants'
import { Reflector } from '@nestjs/core'
import type { Request, Response } from 'express'
import { from, mergeMap, of, type Observable } from 'rxjs'
import { DomainError } from '@/common/errors/domain.error'
import { IDEMPOTENCY_HEADER, IDEMPOTENT_KEY } from './idempotent.decorator'
import { IdempotencyService } from './idempotency.service'

export const REPLAY_HEADER = 'Idempotent-Replay'

/** Mijoz kaliti: UUID yoki shunga o'xshash (bo'sh joy va maxsus belgilarsiz) */
const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/

/**
 * `@Idempotent()` endpointlari uchun.
 *
 * Tenant tranzaksiyasi ICHIDA, audit interceptoridan TASHQARIDA ishlaydi
 * (tartib `AppModule` da): takroriy so'rov handlerga ham, jurnalga ham
 * yetib bormaydi — saqlangan javob qaytadi.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly idempotency: IdempotencyService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.reflector.get<boolean>(IDEMPOTENT_KEY, ctx.getHandler())) return next.handle()

    const http = ctx.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()
    const key = req.get(IDEMPOTENCY_HEADER)
    if (!key || !KEY_PATTERN.test(key)) {
      throw new DomainError(
        'VALIDATION_FAILED',
        `${IDEMPOTENCY_HEADER} sarlavhasi majburiy (8–100 belgi: harf, raqam, - va _)`,
        [{ field: IDEMPOTENCY_HEADER, code: 'VALIDATION_FAILED' }],
      )
    }

    const endpoint = `${req.method} ${req.originalUrl}`
    const status =
      this.reflector.get<number | undefined>(HTTP_CODE_METADATA, ctx.getHandler()) ??
      (req.method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK)

    return from(this.idempotency.claim(key, endpoint, req.body)).pipe(
      mergeMap((claim) => {
        if (claim.replay) {
          res.setHeader(REPLAY_HEADER, 'true')
          return of(claim.response)
        }
        return next.handle().pipe(
          mergeMap(async (body: unknown) => {
            await this.idempotency.complete(key, status, body)
            return body
          }),
        )
      }),
    )
  }
}
