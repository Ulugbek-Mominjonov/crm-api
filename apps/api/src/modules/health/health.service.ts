import { Inject, Injectable } from '@nestjs/common'
import { READINESS_CHECK, type CheckResult, type HealthReport, type ReadinessCheck } from './health.types'

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now()

  constructor(
    @Inject(READINESS_CHECK) private readonly checks: ReadinessCheck[],
  ) {}

  /**
   * Barcha tekshiruvlar PARALLEL bajariladi: ketma-ket bo'lsa
   * tayyorlik so'rovi bog'liqliklar sonига mutanosib sekinlashadi.
   */
  async readiness(): Promise<HealthReport> {
    const results = await Promise.all(this.checks.map((c) => this.run(c)))
    return {
      status: results.every((r) => r.ok) ? 'ok' : 'degraded',
      uptimeSec: this.uptimeSec(),
      checks: results,
    }
  }

  liveness(): { status: 'ok'; uptimeSec: number } {
    return { status: 'ok', uptimeSec: this.uptimeSec() }
  }

  private uptimeSec(): number {
    return Math.round((Date.now() - this.startedAt) / 1000)
  }

  private async run(check: ReadinessCheck): Promise<CheckResult> {
    const started = Date.now()
    try {
      await check.check()
      return { name: check.name, ok: true, ms: Date.now() - started }
    } catch (err) {
      return {
        name: check.name,
        ok: false,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}
