import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import type { RequestType } from '@/modules/account/dto/tenant-request.dto'
import { PrismaService } from '@/prisma/prisma.service'
import { ownerAction } from './owner-actions.service'
import { OWNER_TEXT } from './owner-texts'
import { TELEGRAM_CLIENT, TelegramApiError, type InlineButton, type TelegramClient, type TelegramFile } from './telegram.client'

/** Karta to'lovini tasdiqlash/rad etish tugmasi (`pay:ok|no:<invoiceId>`) — amalni platforma moduli bajaradi */
export const PAYMENT_ACTION = 'pay'

/** Xabarda ko'rsatiladigan do'kon ma'lumoti */
interface StoreInfo {
  name: string
  blockedReason: string | null
}

/** Xabarga qo'shimcha: tugmalar va fayl (bo'lsa — matn uning izohi bo'ladi) */
interface Extras {
  buttons?: InlineButton[][]
  document?: TelegramFile | null
}

/** Karta to'lovi da'vosi (T-149) — egasi bankdagi tushum bilan solishtiradi */
export interface CardClaimNotice {
  tenantId: string
  invoiceId: string
  amount: number
  /** Tarif nomi (`Biznes`), kaliti emas */
  plan: string
  months: number
  payerCard: string
  transferredAt: Date
  note: string | null
  receipt: TelegramFile | null
}

/**
 * Egasiga Telegram xabarlar (T-137, T-140, T-149): yangi do'kon ro'yxatdan
 * o'tdi, onlayn to'lov keldi, karta to'lovini tekshirish kerak (tugmalar
 * bilan), do'kon o'chirishni so'radi, do'kon murojaat yubordi.
 * Botga ulangan BARCHA faol egasi hisoblariga (egasi va operatorlar).
 * Chaqiruvchi KUTMAYDI: xabar yetmasa asosiy amal (ro'yxatdan o'tish,
 * to'lov) baribir muvaffaqiyatli — xato faqat loglanadi. Bot o'chiq bo'lsa
 * hech narsa qilinmaydi.
 */
@Injectable()
export class OwnerNotifierService {
  private readonly logger = new Logger(OwnerNotifierService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(TELEGRAM_CLIENT) private readonly client: TelegramClient | null,
  ) {}

  tenantRegistered(input: { store: string; ownerName: string; phone: string; email: string }): void {
    this.broadcast(OWNER_TEXT.registered(input))
  }

  /** Faqat onlayn to'lov (Payme/Click): egasi o'zi yozgan to'lov haqida xabar shart emas */
  paymentReceived(input: { tenantId: string; amount: number; plan: string; months: number; provider: string }): void {
    void this.withStore(input.tenantId, (store) => OWNER_TEXT.paid({ ...input, store: store.name }))
  }

  deletionRequested(input: { tenantId: string; days: number }): void {
    void this.withStore(input.tenantId, (store) => OWNER_TEXT.deletionRequested({ store: store.name, days: input.days }))
  }

  /** Do'kon murojaati (T-140) — telefonga javob bo'lmasa ham egasi ko'radi */
  requestCreated(input: { tenantId: string; type: RequestType; authorName: string; phone: string | null; message: string }): void {
    void this.withStore(input.tenantId, (store) => OWNER_TEXT.requestCreated({ ...input, store: store.name, blockedReason: store.blockedReason }))
  }

  requestMessage(input: { tenantId: string; type: RequestType; authorName: string; message: string }): void {
    void this.withStore(input.tenantId, (store) => OWNER_TEXT.requestMessage({ ...input, store: store.name }))
  }

  /** Karta to'lovi (T-149): tasdiqlash/rad etish tugmalari bilan; chek bo'lsa — fayl, matn uning izohi */
  cardClaimed(input: CardClaimNotice): void {
    const buttons = [[
      { text: '✅ Tasdiqlash', data: ownerAction(PAYMENT_ACTION, 'ok', input.invoiceId) },
      { text: '❌ Rad etish', data: ownerAction(PAYMENT_ACTION, 'no', input.invoiceId) },
    ]]
    void this.withStore(input.tenantId, (store) => OWNER_TEXT.cardClaimed({ ...input, store: store.name }), { buttons, document: input.receipt })
  }

  private async withStore(tenantId: string, render: (store: StoreInfo) => string, extras: Extras = {}): Promise<void> {
    if (!this.client) return
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, blockedReason: true } })
      this.broadcast(render(tenant ?? { name: tenantId, blockedReason: null }), extras)
    } catch (err) {
      this.logger.error({ err, tenantId }, 'Egasi xabari tayyorlanmadi')
    }
  }

  private broadcast(html: string, extras: Extras = {}): void {
    if (!this.client) return
    void this.send(this.client, html, extras).catch((err: unknown) => this.logger.error({ err }, 'Egasi xabari yuborilmadi'))
  }

  private async send(client: TelegramClient, html: string, { buttons, document }: Extras): Promise<void> {
    const admins = await this.prisma.platformAdmin.findMany({
      where: { isActive: true, telegramChatId: { not: null } },
      select: { id: true, telegramChatId: true },
    })
    for (const admin of admins) {
      const chatId = Number(admin.telegramChatId)
      try {
        // Ketma-ket ATAYLAB: egasi hisoblari bir nechta, xolos
        // eslint-disable-next-line no-await-in-loop
        await (document ? client.sendDocument(chatId, document, html, { html: true, buttons }) : client.sendMessage(chatId, html, { html: true, buttons }))
      } catch (err) {
        if (err instanceof TelegramApiError && err.unreachable) {
          // Botni bloklagan yoki chat yo'q — ulanish olib tashlanadi, panelda qayta ulaydi
          // eslint-disable-next-line no-await-in-loop
          await this.prisma.platformAdmin.update({ where: { id: admin.id }, data: { telegramChatId: null, telegramLinkedAt: null } })
          this.logger.warn({ adminId: admin.id }, 'Egasi botni bloklagan — Telegram ulanishi olib tashlandi')
          continue
        }
        this.logger.error({ err, adminId: admin.id }, 'Egasi xabari yuborilmadi')
      }
    }
  }
}
