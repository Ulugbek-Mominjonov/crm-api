import { SetMetadata } from '@nestjs/common'

export const AUDIT_ACTION_KEY = 'auditAction'

/** Jurnalda ko'rinadigan amal nomi: `sale.create`, `stock.transfer` ... */
export const AuditAction = (action: string): MethodDecorator =>
  SetMetadata(AUDIT_ACTION_KEY, action)
