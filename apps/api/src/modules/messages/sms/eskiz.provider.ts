import { assertOk, smsDigits, type SmsProvider, type SmsResult } from './sms.provider'

/** eskiz.uz — https://documenter.getpostman.com/view/663428/RzfmES4z */
export const ESKIZ_SEND_URL = 'https://notify.eskiz.uz/api/message/sms/send'

export class EskizSmsProvider implements SmsProvider {
  readonly name = 'eskiz'

  constructor(
    private readonly token: string,
    private readonly sender: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async send(phone: string, text: string): Promise<SmsResult> {
    const body = new URLSearchParams({ mobile_phone: smsDigits(phone), message: text, from: this.sender })
    const res = await this.http(ESKIZ_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}` },
      body,
    })
    await assertOk(res, this.name)
    const json = (await res.json()) as { id?: string | number }
    return { providerId: String(json.id ?? '') }
  }
}
