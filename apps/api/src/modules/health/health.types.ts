/** Bitta bog'liqlikning tekshiruv natijasi */
export interface CheckResult {
  name: string
  ok: boolean
  ms: number
  error?: string
}

export interface HealthReport {
  status: 'ok' | 'degraded'
  uptimeSec: number
  checks: CheckResult[]
}

/**
 * Tayyorlik tekshiruvchisi.
 *
 * Modullar o'z tekshiruvini shu interfeys orqali qo'shadi — health moduli
 * S3, navbat yoki boshqa bog'liqlik haqida bilishi shart emas.
 */
export interface ReadinessCheck {
  readonly name: string
  check(): Promise<void>
}

export const READINESS_CHECK = Symbol('READINESS_CHECK')
