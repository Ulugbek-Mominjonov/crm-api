import { ApiResponse } from '@nestjs/swagger'
import { ApiErrorDto } from '@/common/http/api-error.dto'

/** Swagger: tarif chegarasi (T-125) — foydalanuvchi yoki ombor qo'shadigan amallar */
export const ApiPlanLimit = (): MethodDecorator =>
  ApiResponse({
    status: 402,
    description: 'PLAN_LIMIT_EXCEEDED — tarif chegarasi (`meta.resource`, `limit`, `used`); tarif oshirilgach darhol ochiladi',
    type: ApiErrorDto,
  })
