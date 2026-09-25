/** SMS yuborish natijasi — provayderdagi xabar identifikatori */
export interface SmsResult {
  providerId: string
}

/**
 * SMS provayderi (08 §8.10). Yuborish navbat orqali — ishchi har
 * qabul qiluvchi uchun `send` ni chaqiradi, xatoda keyinroq qayta uradi.
 */
export interface SmsProvider {
  readonly name: string
  send(phone: string, text: string): Promise<SmsResult>
}

/** DI tokeni — testda soxta provayder bilan almashtiriladi */
export const SMS_PROVIDER = Symbol('SMS_PROVIDER')

/**
 * Provayder xatosi. `retryable: false` — qayta urinish befoyda (noto'g'ri
 * raqam, rad etilgan matn): qator darhol `failed`.
 */
export class SmsSendError extends Error {
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message)
    this.name = 'SmsSendError'
  }
}

/** Provayderlar `+998…` emas, faqat raqamlarni kutadi */
export function smsDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** HTTP javobni xatoga aylantiradi: 4xx — qayta urinish befoyda, 5xx/tarmoq — qayta */
export async function assertOk(res: Response, provider: string): Promise<void> {
  if (res.ok) return
  const body = await res.text().catch(() => '')
  throw new SmsSendError(`${provider}: HTTP ${res.status} ${body.slice(0, 200)}`, res.status >= 500 || res.status === 429)
}
