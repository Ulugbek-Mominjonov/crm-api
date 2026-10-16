import {
  TelegramApiError, type SendOptions, type TelegramClient, type TelegramFile, type TelegramUpdate, type TelegramUser,
} from '@/modules/telegram/telegram.client'

/**
 * Telegram Bot API soxtasi: yuborilgan xabarlar xotirada, `fail(chatId)` —
 * keyingi yuborish shu xato bilan tugaydi (bloklagan foydalanuvchi va h.k.).
 */
export class FakeTelegram implements TelegramClient {
  readonly sent: { chatId: number; text: string; opts?: SendOptions }[] = []
  readonly documents: { chatId: number; file: TelegramFile; caption: string }[] = []
  private readonly failures = new Map<number, TelegramApiError>()

  reset(): void {
    this.sent.length = 0
    this.documents.length = 0
    this.failures.clear()
  }

  /** Shu chatga keyingi yuborish xato bilan tugaydi (bir marta) */
  failNext(chatId: number, error: TelegramApiError): void {
    this.failures.set(chatId, error)
  }

  /** Chatga kelgan xabarlar (bo'sh bo'lishi mumkin) */
  to(chatId: number): string[] {
    return this.sent.filter((m) => m.chatId === chatId).map((m) => m.text)
  }

  async getMe(): Promise<TelegramUser> {
    return { id: 1, username: 'test_bot' }
  }

  async sendMessage(chatId: number, text: string, opts?: SendOptions): Promise<{ message_id: number }> {
    this.throwIfFailing(chatId)
    this.sent.push({ chatId, text, opts })
    return { message_id: this.sent.length }
  }

  async sendDocument(chatId: number, file: TelegramFile, caption: string): Promise<{ message_id: number }> {
    this.throwIfFailing(chatId)
    this.documents.push({ chatId, file, caption })
    return { message_id: this.documents.length }
  }

  async setWebhook(): Promise<void> {}

  async getUpdates(): Promise<TelegramUpdate[]> {
    return []
  }

  private throwIfFailing(chatId: number): void {
    const failure = this.failures.get(chatId)
    if (!failure) return
    this.failures.delete(chatId)
    throw failure
  }
}

export const blockedByUser = (): TelegramApiError => new TelegramApiError('sendMessage', 403, 'Forbidden: bot was blocked by the user')
