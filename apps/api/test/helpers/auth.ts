import type { INestApplication } from '@nestjs/common'
import type { Role } from '@prisma/client'
import { TokenService } from '@/modules/auth/token.service'

export interface TokenSubject {
  tenantId: string
  userId: string
  employeeId: string
}

/**
 * `Authorization` sarlavhasi qiymati — berilgan rol bilan.
 * Login oqimi o'z testlarida tekshirilgan; bu yerda har testda argon2
 * kutilmasin, shuning uchun token to'g'ridan-to'g'ri imzolanadi.
 */
export async function bearer(
  app: INestApplication,
  who: TokenSubject,
  role: Role = 'admin',
): Promise<string> {
  const { token } = await app.get(TokenService).signAccess({
    sub: who.userId,
    tid: who.tenantId,
    role,
    eid: who.employeeId,
  })
  return `Bearer ${token}`
}
