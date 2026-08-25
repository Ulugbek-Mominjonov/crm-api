import { ERROR_CATALOG, type ErrorCodeName } from './error-catalog'

/** Xato tafsiloti — maydonga bog'langan mashina o'qiy oladigan ma'lumot */
export interface FieldError {
  field?: string
  code: ErrorCodeName
  meta?: Record<string, unknown>
}

/**
 * Barcha biznes xatolari uchun asos.
 *
 * HTTP statusi katalogdan olinadi — servis kodi status haqida o'ylamaydi,
 * faqat "qaysi qoida buzildi" ni aytadi.
 */
export class DomainError extends Error {
  readonly status: number

  constructor(
    readonly code: ErrorCodeName,
    /** Odam uchun aniq tafsilot: "Sement M400: kerak 20, mavjud 12" */
    readonly detail?: string,
    readonly errors?: FieldError[],
  ) {
    super(detail ?? ERROR_CATALOG[code].title)
    this.name = new.target.name
    this.status = ERROR_CATALOG[code].status
  }

  get title(): string {
    return ERROR_CATALOG[this.code].title
  }
}

/** Topilmadi. Boshqa tenant yozuvi ham SHU xato bilan qaytadi (03-security). */
export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super('NOT_FOUND', id ? `${resource} topilmadi: ${id}` : `${resource} topilmadi`)
  }
}

export class PermissionDeniedError extends DomainError {
  constructor(detail?: string) {
    super('PERMISSION_DENIED', detail)
  }
}
