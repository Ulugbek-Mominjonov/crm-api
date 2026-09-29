import { ConfigService } from '@nestjs/config'
import type { Env } from '@/config/env.schema'
import { ALLOWED_UPDATES, HttpTelegramClient, TELEGRAM_API, TelegramApiError, createTelegramClient } from './telegram.client'
import { storeMessage } from './telegram-texts'

/** Telegram Bot API mijozi (Q116): so'rov shakli va xato turlari — HTTP soxta */
const reply = (status: number, body: unknown) =>
  // Har chaqiruvga yangi javob: tana bir marta o'qiladi
  vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(body), { status }))

describe('Telegram mijozi (telegram.client)', () => {
  it('sendMessage: token URL’da, JSON tana, HTML ixtiyoriy', async () => {
    const http = reply(200, { ok: true, result: { message_id: 77 } })
    const client = new HttpTelegramClient('123:tok', http)
    expect(await client.sendMessage(42, '<b>Do‘kon</b>', { html: true })).toEqual({ message_id: 77 })
    const [url, init] = http.mock.calls[0]!
    expect(url).toBe(`${TELEGRAM_API}/bot123:tok/sendMessage`)
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: 42, text: '<b>Do‘kon</b>', parse_mode: 'HTML', link_preview_options: { is_disabled: true },
    })

    await client.sendMessage(42, 'oddiy')
    expect(JSON.parse(String(http.mock.calls[1]![1]?.body))).not.toHaveProperty('parse_mode')
  })

  it('sendDocument: multipart — fayl (nomi, turi), HTML izoh', async () => {
    const http = reply(200, { ok: true, result: { message_id: 9 } })
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    await new HttpTelegramClient('t', http).sendDocument(42, { name: 'CHEK-1.pdf', content: pdf, mime: 'application/pdf' }, '<b>Chek</b>', { html: true })
    const [url, init] = http.mock.calls[0]!
    expect(url).toBe(`${TELEGRAM_API}/bott/sendDocument`)
    const form = init?.body as FormData
    expect([form.get('chat_id'), form.get('caption'), form.get('parse_mode')]).toEqual(['42', '<b>Chek</b>', 'HTML'])
    const file = form.get('document') as File
    expect([file.name, file.type, new Uint8Array(await file.arrayBuffer())]).toEqual(['CHEK-1.pdf', 'application/pdf', pdf])
  })

  it('setWebhook: sir va faqat kerakli yangilanishlar (xabar, bloklash)', async () => {
    const http = reply(200, { ok: true, result: true })
    await new HttpTelegramClient('t', http).setWebhook('https://crm.uz/api/v1/telegram/webhook', 's'.repeat(32))
    expect(JSON.parse(String(http.mock.calls[0]![1]?.body))).toEqual({
      url: 'https://crm.uz/api/v1/telegram/webhook', secret_token: 's'.repeat(32), allowed_updates: [...ALLOWED_UPDATES],
    })
  })

  it('xatolar: 429/5xx — qayta urinish; 403 va "chat not found" — bog‘lanish uziladi; token xabarga tushmaydi', async () => {
    const call = (status: number, description: string) =>
      new HttpTelegramClient('123:maxfiy', reply(status, { ok: false, error_code: status, description })).sendMessage(1, 'x').catch((e: unknown) => e)

    expect(await call(429, 'Too Many Requests: retry after 5')).toMatchObject({ retryable: true, unreachable: false })
    expect(await call(502, 'Bad Gateway')).toMatchObject({ retryable: true, unreachable: false })
    const blocked = await call(403, 'Forbidden: bot was blocked by the user')
    expect(blocked).toBeInstanceOf(TelegramApiError)
    expect(blocked).toMatchObject({ retryable: false, unreachable: true, code: 403 })
    expect((blocked as Error).message).not.toContain('maxfiy')
    expect(await call(400, 'Bad Request: chat not found')).toMatchObject({ retryable: false, unreachable: true })
    expect(await call(400, 'Bad Request: message is too long')).toMatchObject({ retryable: false, unreachable: false })
  })

  it('JSON bo‘lmagan javob — HTTP holati bilan xato', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>502</html>', { status: 502 }))
    await expect(new HttpTelegramClient('t', http).getMe()).rejects.toMatchObject({ code: 502, retryable: true })
  })

  it('sozlama: token yo‘q (yoki bo‘sh) — bot o‘chiq', () => {
    const config = (env: Partial<Env>) => new ConfigService<Env, true>(env)
    expect(createTelegramClient(config({}))).toBeNull()
    expect(createTelegramClient(config({ TELEGRAM_BOT_TOKEN: '' }))).toBeNull()
    expect(createTelegramClient(config({ TELEGRAM_BOT_TOKEN: '123:abc' }))).toBeInstanceOf(HttpTelegramClient)
  })
})

describe('Telegram yordamchilari', () => {
  it('do‘kon xabari: sarlavhada nom, pastda aloqa (bo‘lsa); do‘kon ma’lumoti ekranlanadi', () => {
    const card = { storeName: 'A & B <Qurilish>', receiptPhone: '+998 90 123 45 67', receiptAddress: 'Chilonzor <5>' }
    expect(storeMessage(card, 'Qarz: <b>5</b>')).toBe(
      '🏪 <b>A &amp; B &lt;Qurilish&gt;</b>\n\nQarz: <b>5</b>\n\n📞 +998 90 123 45 67\n📍 Chilonzor &lt;5&gt;',
    )
    expect(storeMessage({ ...card, receiptPhone: '', receiptAddress: '' }, 'x')).toBe('🏪 <b>A &amp; B &lt;Qurilish&gt;</b>\n\nx')
  })

})
