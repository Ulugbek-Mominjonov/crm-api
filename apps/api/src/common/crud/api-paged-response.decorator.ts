import { applyDecorators, type Type } from '@nestjs/common'
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger'

/**
 * Sahifali ro'yxat javobi (04 §4.1) — Swagger'da `items` elementining
 * aniq sxemasi ko'rinsin, frontend tiplari to'g'ri generatsiya qilinsin.
 */
export function ApiPagedResponse(item: Type<unknown>): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(item),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['items', 'page', 'pageSize', 'total', 'pageCount'],
        properties: {
          items: { type: 'array', items: { $ref: getSchemaPath(item) } },
          page: { type: 'integer', example: 1 },
          pageSize: { type: 'integer', example: 20 },
          total: { type: 'integer', example: 137 },
          pageCount: { type: 'integer', example: 7 },
        },
      },
    }),
  )
}
