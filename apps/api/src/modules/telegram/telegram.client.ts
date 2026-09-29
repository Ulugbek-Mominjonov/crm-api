import type { ConfigService } from '@nestjs/config'
import type { Env } from '@/config/env.schema'

/** Telegram Bot API — https://core.telegram.org/bots/api */
export const TELEGRAM_API = 'https://api.telegram.org'
/** Oddiy so'rov chegarasi; uzun so'rovda (getUpdates) — kutish vaqti + shu */
const REQUEST_TIMEOUT_MS = 10_000
/** Fayl yuklash (chek PDF) — kattaroq */
const UPLOAD_TIMEOUT_MS = 30_000

/** Bot oladigan yangilanishlar: xabar (/start) va botni bloklash/ochish */
export const ALLOWED_UPDATES = ['message', 'my_chat_member'] as const

// Faqat ishlatiladigan maydonlar — Telegram ko'proq yuboradi
export interface TelegramUser {
  id: number
  username?: string
}

export interface TelegramChat {
  id: number
  /** private | group | supergroup | channel */
  type: string
}

export interface TelegramMessage {
  message_id: number
  chat: TelegramChat
  from?: TelegramUser
  text?: string
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  /** Foydalanuvchi botni bloklasa — `new_chat_member.status = kicked`, qayta ochsa — `member` */
  my_chat_member?: { chat: TelegramChat; new_chat_member: { status: string } }
}

export interface SendOptions {
  /** Matn HTML (`<b>` …) — maxsus belgilar oldindan ekranlangan bo'lishi SHART */
  html?: boolean
}

/** Yuboriladigan fayl (chek PDF) */
export interface TelegramFile {
  name: string
  content: Uint8Array
  mime: string
}

/**
 * Bot API mijozi (Q116). Interfeys — testda soxtasi bilan almashtiriladi
 * (`TELEGRAM_CLIENT`), SMS provayderi kabi.
 */
export interface TelegramClient {
  getMe(): Promise<TelegramUser>
  sendMessage(chatId: number, text: string, opts?: SendOptions): Promise<{ message_id: number }>
  /** Hujjat va izoh (`caption`, ≤ 1024 belgi) — bitta xabar */
  sendDocument(chatId: number, file: TelegramFile, caption: string, opts?: SendOptions): Promise<{ message_id: number }>
  setWebhook(url: string, secret: string): Promise<void>
  getUpdates(offset: number, timeoutSec: number, signal: AbortSignal): Promise<TelegramUpdate[]>
}

/** DI tokeni; token berilmagan bo'lsa qiymati `null` — Telegram o'chiq */
export const TELEGRAM_CLIENT = Symbol('TELEGRAM_CLIENT')

/**
 * Bot API xatosi. `retryable` — 429 va 5xx (keyinroq qayta). `unreachable` —
 * foydalanuvchi botni bloklagan yoki chat yo'q: mijoz "bloklagan" deb belgilanadi.
 */
export class TelegramApiError extends Error {
  readonly retryable: boolean
  readonly unreachable: boolean

  constructor(
    method: string,
    readonly code: number,
    description: string,
  ) {
    super(`telegram ${method}: ${code} ${description}`.slice(0, 300))
    this.name = 'TelegramApiError'
    this.retryable = code === 429 || code >= 500
    this.unreachable = code === 403 || (code === 400 && /chat not found|user not found/i.test(description))
  }
}

export class HttpTelegramClient implements TelegramClient {
  constructor(
    private readonly token: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>('getMe', json({}))
  }

  sendMessage(chatId: number, text: string, opts: SendOptions = {}): Promise<{ message_id: number }> {
    return this.call(
      'sendMessage',
      json({ chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...(opts.html && { parse_mode: 'HTML' }) }),
    )
  }

  sendDocument(chatId: number, file: TelegramFile, caption: string, opts: SendOptions = {}): Promise<{ message_id: number }> {
    const form = new FormData()
    form.set('chat_id', String(chatId))
    form.set('document', new Blob([file.content], { type: file.mime }), file.name)
    form.set('caption', caption)
    if (opts.html) form.set('parse_mode', 'HTML')
    // Content-Type (multipart chegarasi bilan) — fetch o'zi qo'yadi
    return this.call('sendDocument', { body: form }, AbortSignal.timeout(UPLOAD_TIMEOUT_MS))
  }

  async setWebhook(url: string, secret: string): Promise<void> {
    await this.call('setWebhook', json({ url, secret_token: secret, allowed_updates: ALLOWED_UPDATES }))
  }

  getUpdates(offset: number, timeoutSec: number, signal: AbortSignal): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>(
      'getUpdates',
      json({ offset, timeout: timeoutSec, allowed_updates: ALLOWED_UPDATES }),
      AbortSignal.any([signal, AbortSignal.timeout(timeoutSec * 1000 + REQUEST_TIMEOUT_MS)]),
    )
  }

  /** Token URL'da (Bot API talabi) — xato matniga URL emas, faqat usul nomi tushadi */
  private async call<T>(method: string, init: RequestInit, signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)): Promise<T> {
    const res = await this.http(`${TELEGRAM_API}/bot${this.token}/${method}`, { ...init, method: 'POST', signal })
    // JSON bo'lmagan javob (proksi sahifasi) — HTTP holati bilan xato
    const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; error_code?: number; description?: string } | null
    if (body?.ok) return body.result as T
    throw new TelegramApiError(method, body?.error_code ?? res.status, body?.description ?? `HTTP ${res.status}`)
  }
}

function json(params: Record<string, unknown>): RequestInit {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) }
}

/** Token berilmasa — `null`: bot o'chiq, xabarlar faqat SMS orqali */
export function createTelegramClient(config: ConfigService<Env, true>): TelegramClient | null {
  const token = config.get('TELEGRAM_BOT_TOKEN', { infer: true })
  return token ? new HttpTelegramClient(token) : null
}
