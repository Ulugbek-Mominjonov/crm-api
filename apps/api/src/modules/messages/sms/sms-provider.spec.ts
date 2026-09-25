import { ConfigService } from '@nestjs/config'
import type { Env } from '@/config/env.schema'
import { ESKIZ_SEND_URL, EskizSmsProvider } from './eskiz.provider'
import { PLAYMOBILE_SEND_URL, PlaymobileSmsProvider } from './playmobile.provider'
import { createSmsProvider } from './sms-provider.factory'
import { SmsSendError } from './sms.provider'

/** SMS provayderlari (T-077): so'rov shakli va xato turlari — HTTP soxta */
const reply = (status: number, body: unknown) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('SMS provayderlari (sms-provider)', () => {
  it('eskiz: Bearer token, faqat raqamlar, jo‘natuvchi; javobdagi id', async () => {
    const http = reply(200, { id: 4815, status: 'waiting' })
    const result = await new EskizSmsProvider('tok', '4546', http).send('+998 90 123-45-67', 'Salom')
    expect(result).toEqual({ providerId: '4815' })
    const [url, init] = http.mock.calls[0]!
    expect(url).toBe(ESKIZ_SEND_URL)
    expect(init?.headers).toEqual({ Authorization: 'Bearer tok' })
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({ mobile_phone: '998901234567', message: 'Salom', from: '4546' })
  })

  it('5xx va 429 — qayta urinish mumkin, 4xx — yo‘q', async () => {
    const server = new EskizSmsProvider('tok', '4546', reply(503, { message: 'down' }))
    await expect(server.send('+998901234567', 'x')).rejects.toMatchObject({ name: 'SmsSendError', retryable: true })
    const limited = new EskizSmsProvider('tok', '4546', reply(429, {}))
    await expect(limited.send('+998901234567', 'x')).rejects.toMatchObject({ retryable: true })
    const bad = new EskizSmsProvider('tok', '4546', reply(400, { message: 'invalid phone' }))
    const err = await bad.send('+998', 'x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SmsSendError)
    expect(err).toMatchObject({ retryable: false })
  })

  it('playmobile: Basic auth, JSON tana, o‘z message-id si', async () => {
    const http = reply(200, {})
    const result = await new PlaymobileSmsProvider('login:parol', '3700', http).send('+998901234567', 'Salom')
    const [url, init] = http.mock.calls[0]!
    expect(url).toBe(PLAYMOBILE_SEND_URL)
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('login:parol').toString('base64')}`)
    const body = JSON.parse(String(init?.body)) as { messages: { recipient: string; 'message-id': string; sms: unknown }[] }
    expect(body.messages[0]).toEqual({
      recipient: '998901234567', 'message-id': result.providerId, sms: { originator: '3700', content: { text: 'Salom' } },
    })
  })

  it('sozlama: `none` — provayder yo‘q (faqat jurnal)', () => {
    const config = (env: Partial<Env>) => new ConfigService<Env, true>({ SMS_SENDER: '4546', ...env })
    expect(createSmsProvider(config({ SMS_PROVIDER: 'none' }))).toBeNull()
    expect(createSmsProvider(config({ SMS_PROVIDER: 'eskiz', SMS_TOKEN: 't' }))).toBeInstanceOf(EskizSmsProvider)
    expect(createSmsProvider(config({ SMS_PROVIDER: 'playmobile', SMS_TOKEN: 'a:b' }))).toBeInstanceOf(PlaymobileSmsProvider)
  })
})
