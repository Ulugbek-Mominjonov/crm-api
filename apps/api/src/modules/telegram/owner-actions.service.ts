import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { PrismaService } from '@/prisma/prisma.service'
import { TELEGRAM_CLIENT, type TelegramCallbackQuery, type TelegramClient } from './telegram.client'

/** Tugmani bosgan egasi hisobi (egasi yoki operator) */
export interface OwnerActor {
  id: string
  name: string
}

/** `text` — bosganga qisqa bildirish va chatga javob; `settled` — amal yakunlandi, tugmalar olib tashlanadi */
export interface OwnerActionResult {
  text: string
  settled: boolean
}

export type OwnerActionHandler = (args: string[], actor: OwnerActor) => Promise<OwnerActionResult>

/** `callback_data`: `<amal>:<arg>:…` (Telegram — ≤ 64 bayt) */
const SEPARATOR = ':'
/** `answerCallbackQuery` matni — Telegram chegarasi */
const ANSWER_MAX_LENGTH = 200

/** Tugma qiymati: `ownerAction('pay', 'ok', id)` → `pay:ok:<id>` */
export function ownerAction(action: string, ...args: string[]): string {
  return [action, ...args].join(SEPARATOR)
}

/**
 * Egasi xabaridagi tugmalar (T-149). Amalni boshqa modul ro'yxatga oladi
 * (`register`): Telegram moduli platforma moduliga bog'lanmaydi — aksincha
 * u bizga bog'langan. Bosgan odam botga ulangan FAOL egasi hisobi bo'lishi
 * shart: tugma qiymatini istalgan foydalanuvchi o'zgartirilgan mijozdan
 * yuborishi mumkin.
 */
@Injectable()
export class OwnerActionsService {
  private readonly logger = new Logger(OwnerActionsService.name)
  private readonly handlers = new Map<string, OwnerActionHandler>()

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(TELEGRAM_CLIENT) private readonly client: TelegramClient | null,
  ) {}

  register(action: string, handler: OwnerActionHandler): void {
    this.handlers.set(action, handler)
  }

  async handle(query: TelegramCallbackQuery): Promise<void> {
    const client = this.client
    if (!client) return
    const [action = '', ...args] = (query.data ?? '').split(SEPARATOR)
    const handler = this.handlers.get(action)
    const actor = handler ? await this.actor(query.from.id) : null
    if (!handler || !actor) {
      await client.answerCallbackQuery(query.id, 'Bu amal sizga ochiq emas')
      return
    }
    let result: OwnerActionResult
    try {
      result = await handler(args, actor)
    } catch (err) {
      this.logger.error({ err, action, adminId: actor.id }, 'Egasi tugmasi bajarilmadi')
      await client.answerCallbackQuery(query.id, 'Bajarilmadi — egasi panelida urinib ko‘ring')
      return
    }
    await client.answerCallbackQuery(query.id, result.text.slice(0, ANSWER_MAX_LENGTH))
    const message = query.message
    if (!result.settled || !message) return
    await client.removeButtons(message.chat.id, message.message_id)
    await client.sendMessage(message.chat.id, result.text, { replyTo: message.message_id })
  }

  /** Shaxsiy chatda chat = foydalanuvchi; havola bilan ulangan faol hisob (T-137) */
  private actor(userId: number): Promise<OwnerActor | null> {
    return this.prisma.platformAdmin.findFirst({
      where: { telegramChatId: BigInt(userId), isActive: true },
      select: { id: true, name: true },
    })
  }
}
