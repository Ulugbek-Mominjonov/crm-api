import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '@/config/env.schema'
import type { ReadinessCheck } from '../health.types'

const TIMEOUT_MS = 2_000

/**
 * Obyekt saqlagich yetib boradimi?
 *
 * Bu yerda imzolangan so'rov yuborilmaydi — S3 uchun autentifikatsiyasiz
 * javob (403/400) ham "xizmat tirik" degani. To'liq `HeadBucket` tekshiruvi
 * S3 moduli qo'shilganda (E11) shu interfeys orqali almashtiriladi.
 */
@Injectable()
export class StorageCheck implements ReadinessCheck {
  readonly name = 'storage'

  constructor(private readonly config: ConfigService<Env, true>) {}

  async check(): Promise<void> {
    const endpoint = this.config.get('S3_ENDPOINT', { infer: true })
    const res = await fetch(endpoint, {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // 5xx — saqlagich o'zi nosoz; qolgani (200/400/403) javob berayotgani
    if (res.status >= 500) {
      throw new Error(`saqlagich ${res.status} qaytardi`)
    }
  }
}
