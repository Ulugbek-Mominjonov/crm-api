import type { ConfigService } from '@nestjs/config'
import type { Env } from '@/config/env.schema'
import { EskizSmsProvider } from './eskiz.provider'
import { PlaymobileSmsProvider } from './playmobile.provider'
import type { SmsProvider } from './sms.provider'

/**
 * Sozlamaga ko'ra provayder; `none` — `null`: xabarlar faqat jurnalga
 * yoziladi (demo rejim, 08 §8.10), navbatga tushmaydi.
 */
export function createSmsProvider(config: ConfigService<Env, true>): SmsProvider | null {
  const token = config.get('SMS_TOKEN', { infer: true }) ?? ''
  const sender = config.get('SMS_SENDER', { infer: true })
  switch (config.get('SMS_PROVIDER', { infer: true })) {
    case 'eskiz':
      return new EskizSmsProvider(token, sender)
    case 'playmobile':
      return new PlaymobileSmsProvider(token, sender)
    case 'none':
      return null
  }
}
