import { applyDecorators, SetMetadata } from '@nestjs/common'
import { ApiHeader } from '@nestjs/swagger'

export const IDEMPOTENT_KEY = 'idempotent'
export const IDEMPOTENCY_HEADER = 'Idempotency-Key'

/**
 * Moliyaviy va ombor amallari idempotent (04 §4.3): kassir «Sotish» ni
 * bosdi, javob kelmadi, qayta bosdi — ikkinchi chek yozilmasligi kerak.
 * `Idempotency-Key` sarlavhasi MAJBURIY.
 */
export const Idempotent = (): MethodDecorator =>
  applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, true),
    ApiHeader({
      name: IDEMPOTENCY_HEADER,
      required: true,
      description:
        'Mijoz yaratgan noyob kalit (UUID). Qayta urinishda O‘ZGARTIRILMAYDI: bir xil kalit + ' +
        'bir xil tana — saqlangan javob (`Idempotent-Replay: true`), boshqa tana — 409.',
    }),
  )
