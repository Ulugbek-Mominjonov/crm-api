import { BadRequestException } from '@nestjs/common'
import type { ValidationError } from 'class-validator'

/** Bitta qoida buzilishi: qaysi maydon (`items[0].qty`) va xabar */
export interface FieldMessage {
  field: string
  message: string
}

interface Path {
  /** Biznes xatolaridagidek: `items[0].qty` */
  field: string
  /** Nest xabaridagidek: `items.0` (xabar matni avvalgidek qoladi) */
  prefix: string
}

/**
 * class-validator daraxti → tekis ro'yxat. Xabar matni Nest'ning o'zinikidek
 * (ichki maydonda — yo'l prefiksi bilan: `items.0.qty must be …`), qo'shimcha —
 * maydon yo'li: frontend xatoni aynan o'sha inputga ko'rsatadi.
 */
export function flattenValidationErrors(errors: readonly ValidationError[], parent?: Path): FieldMessage[] {
  return errors.flatMap((error) => {
    const path: Path = parent
      ? {
          field: /^\d+$/.test(error.property) ? `${parent.field}[${error.property}]` : `${parent.field}.${error.property}`,
          prefix: `${parent.prefix}.${error.property}`,
        }
      : { field: error.property, prefix: error.property }
    const own = Object.values(error.constraints ?? {}).map((message) => ({
      field: path.field,
      message: parent ? `${parent.prefix}.${message}` : message,
    }))
    return [...own, ...flattenValidationErrors(error.children ?? [], path)]
  })
}

/** `ValidationPipe.exceptionFactory`: 400, `message` — `FieldMessage[]` (filtr `errors[].field` ga aylantiradi) */
export const validationException = (errors: ValidationError[]): BadRequestException =>
  new BadRequestException({ message: flattenValidationErrors(errors) })
