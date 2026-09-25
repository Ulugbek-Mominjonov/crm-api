import { randomUUID } from 'node:crypto'
import { assertOk, smsDigits, type SmsProvider, type SmsResult } from './sms.provider'

/** playmobile.uz (smsxabar) broker API */
export const PLAYMOBILE_SEND_URL = 'https://send.smsxabar.uz/broker-api/send'

export class PlaymobileSmsProvider implements SmsProvider {
  readonly name = 'playmobile'

  /** `credentials` — `login:parol` (Basic auth) */
  constructor(
    private readonly credentials: string,
    private readonly sender: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async send(phone: string, text: string): Promise<SmsResult> {
    const messageId = randomUUID().replace(/-/g, '').slice(0, 20)
    const res = await this.http(PLAYMOBILE_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(this.credentials).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ recipient: smsDigits(phone), 'message-id': messageId, sms: { originator: this.sender, content: { text } } }],
      }),
    })
    await assertOk(res, this.name)
    return { providerId: messageId }
  }
}
