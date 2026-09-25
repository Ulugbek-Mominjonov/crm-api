import { SetMetadata } from '@nestjs/common'

export const AUDIT_ACTION_KEY = 'auditAction'
export const AUDIT_IN_SERVICE_KEY = 'auditInService'

/** Jurnalda ko'rinadigan amal nomi: `sale.create`, `stock.transfer` ... */
export const AuditAction = (action: string): MethodDecorator =>
  SetMetadata(AUDIT_ACTION_KEY, action)

/**
 * Jurnalni servis O'ZI yozadi — tranzaksiya ichida va tafsilot (diff) bilan.
 *
 * Moliyaviy va ommaviy amallarda audit asosiy yozuv bilan birga saqlanishi
 * shart: amal bajarilib, jurnal yozilmay qolmasin (03-security §3.9).
 * Interceptor bunday amalni takroran yozmaydi.
 */
export const AuditedInService = (): MethodDecorator =>
  SetMetadata(AUDIT_IN_SERVICE_KEY, true)
