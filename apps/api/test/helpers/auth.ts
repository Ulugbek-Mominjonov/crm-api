import type { INestApplication } from '@nestjs/common'
import type { SystemRole } from '@prisma/client'
import { TokenService } from '@/modules/auth/token.service'
import { roleIdOf, testDb } from './db'

export interface TokenSubject {
  tenantId: string
  userId: string
  employeeId: string
}

/**
 * `Authorization` sarlavhasi qiymati — berilgan tizim roli bilan.
 * Login oqimi o'z testlarida tekshirilgan; bu yerda har testda argon2
 * kutilmasin, shuning uchun token to'g'ridan-to'g'ri imzolanadi.
 *
 * Huquq tokenda emas — bazadagi rolda (T-134): `who` shu rolda bo'lsa —
 * o'zi, aks holda do'konning shu roldagi sinov hisobi (bir marta yaratiladi).
 */
export async function bearer(
  app: INestApplication,
  who: TokenSubject,
  role: SystemRole = 'admin',
): Promise<string> {
  const subject = await subjectWithRole(who, role)
  const { token } = await app.get(TokenService).signAccess({
    sub: subject.userId,
    tid: who.tenantId,
    eid: subject.employeeId,
  })
  return `Bearer ${token}`
}

async function subjectWithRole(who: TokenSubject, role: SystemRole): Promise<Pick<TokenSubject, 'userId' | 'employeeId'>> {
  const own = await testDb.user.findFirst({ where: { id: who.userId, role: { key: role } }, select: { id: true } })
  if (own) return who

  const email = `${role}+${who.tenantId.slice(-12)}@test.crm.uz`
  const existing = await testDb.user.findFirst({ where: { tenantId: who.tenantId, email }, select: { id: true, employeeId: true } })
  if (existing) return { userId: existing.id, employeeId: existing.employeeId }

  const employee = await testDb.employee.create({
    data: { tenantId: who.tenantId, name: `Sinov ${role}`, position: role, phone: '+998900000001', hiredAt: new Date('2026-01-01') },
  })
  const user = await testDb.user.create({
    data: { tenantId: who.tenantId, employeeId: employee.id, email, passwordHash: 'x', roleId: await roleIdOf(who.tenantId, role) },
  })
  return { userId: user.id, employeeId: employee.id }
}
