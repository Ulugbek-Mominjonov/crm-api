import {
  ArgumentsHost,
  Catch,
  HttpException,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { DomainError, VersionConflictError } from '@/common/errors/domain.error'
import { ERROR_CATALOG, type ErrorCodeName } from '@/common/errors/error-catalog'
import type { ApiErrorDto, FieldErrorDto } from '@/common/http/api-error.dto'
import { tryContext } from '@/common/context/request-context'
import { reportError } from '@/common/monitoring/monitoring'
import { hiddenFieldsFor, stripHidden } from '@/common/security/field-visibility'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'

const ERROR_TYPE_BASE = 'https://api.crm.uz/errors'

/** `STOCK_INSUFFICIENT` → `stock-insufficient` */
function typeUri(code: string): string {
  return `${ERROR_TYPE_BASE}/${code.toLowerCase().replaceAll('_', '-')}`
}

interface NestValidationBody {
  message?: string | string[]
  error?: string
}

/**
 * Express o'rta qatlami (body-parser) xatosi — `http-errors` shaklida.
 * `expose: true` — xabarni mijozga ko'rsatish xavfsiz (buzuq JSON,
 * hajm chegarasi). Ular 500 emas: aybi so'rovda.
 */
interface ClientHttpError {
  status: number
  message: string
}

function isClientHttpError(value: unknown): value is ClientHttpError {
  if (value === null || typeof value !== 'object') return false
  const { status, expose } = value as Record<string, unknown>
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true
}

/**
 * Barcha istisnolarni yagona javob shakliga keltiradi.
 *
 * Uchta manba bor: (1) domen xatolari, (2) Nest'ning `HttpException` lari
 * (validatsiya, 404), (3) kutilmagan xatolar. Uchinchisi mijozga **hech
 * qachon** stack yoki ichki xabar bermaydi — faqat `traceId`, u bo'yicha
 * loglardan topiladi.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const res = http.getResponse<Response>()
    const req = http.getRequest<Request & { auth?: AuthContext }>()
    const traceId = tryContext()?.requestId ?? 'unknown'

    const body = this.toBody(exception, req.originalUrl, traceId)
    // Joriy yozuv xato javobida ham rol bo'yicha tozalanadi (interceptor bu yerga yetmaydi)
    if (exception instanceof VersionConflictError && req.auth) {
      body.current = stripHidden(exception.current, hiddenFieldsFor(req.auth.role))
    }

    if (body.status >= 500) {
      this.logger.error(
        { traceId, path: req.originalUrl, err: exception },
        'Kutilmagan xato',
      )
      reportError(exception, traceId)
    }

    res.status(body.status).json(body)
  }

  private toBody(
    exception: unknown,
    instance: string,
    traceId: string,
  ): ApiErrorDto {
    if (exception instanceof DomainError) {
      return {
        type: typeUri(exception.code),
        title: exception.title,
        status: exception.status,
        code: exception.code,
        detail: exception.detail,
        instance,
        traceId,
        errors: exception.errors as FieldErrorDto[] | undefined,
      }
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, instance, traceId)
    }

    if (isClientHttpError(exception)) {
      const code: ErrorCodeName = exception.status === 413 ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_FAILED'
      return {
        type: typeUri(code),
        title: ERROR_CATALOG[code].title,
        status: ERROR_CATALOG[code].status,
        code,
        detail: exception.message,
        instance,
        traceId,
      }
    }

    // Kutilmagan xato — tafsilot mijozga chiqmaydi
    return {
      type: typeUri('INTERNAL'),
      title: ERROR_CATALOG.INTERNAL.title,
      status: 500,
      code: 'INTERNAL',
      instance,
      traceId,
    }
  }

  private fromHttpException(
    exception: HttpException,
    instance: string,
    traceId: string,
  ): ApiErrorDto {
    const status = exception.getStatus()
    const response = exception.getResponse()
    const code: ErrorCodeName =
      status === 400 ? 'VALIDATION_FAILED' : status === 404 ? 'NOT_FOUND' : 'INTERNAL'

    // ValidationPipe xabarlarni massiv sifatida beradi
    const raw = typeof response === 'object' ? (response as NestValidationBody) : {}
    const messages = Array.isArray(raw.message)
      ? raw.message
      : raw.message
        ? [raw.message]
        : []

    return {
      type: typeUri(code),
      title: status === 400 ? ERROR_CATALOG.VALIDATION_FAILED.title : exception.message,
      status,
      code,
      detail: messages.length ? messages.join('; ') : undefined,
      instance,
      traceId,
      errors: messages.length
        ? messages.map((m) => ({ code: 'VALIDATION_FAILED' as const, meta: { message: m } }))
        : undefined,
    }
  }
}
