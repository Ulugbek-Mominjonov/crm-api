import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Inject, Injectable, Logger, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { currentContext, currentTenantId, runWithContext } from '@/common/context/request-context'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import type { Env } from '@/config/env.schema'
import { AuditService } from '@/modules/audit/audit.service'
import { SettingsService } from '@/modules/settings/settings.service'
import { PrismaService, type TenantTx } from '@/prisma/prisma.service'
import type { TelegramLinkDto, TelegramStatusDto } from './dto/telegram.dto'
import { TELEGRAM_CLIENT, TelegramApiError, type TelegramClient, type TelegramFile, type TelegramUpdate } from './telegram.client'
import { BOT_TEXT } from './telegram-texts'

/** Shaxsiy havola muddati: kassada darhol skanerlanadi, boshqa yo'l bilan yuborilsa ham yetadi */
const LINK_TTL_MS = 7 * 24 * 3_600_000
/** Token — 16 tasodifiy bayt (128 bit) → base64url, 22 belgi (Telegram `start`: ≤ 64, `[A-Za-z0-9_-]`) */
const TOKEN_BYTES = 16
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/
const START = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/

/** Nega yetkazib bo'lmaydi — `RECIPIENT_UNREACHABLE` ning `meta.reason` i (frontend shunga qarab taklif beradi) */
export type UnreachableReason = 'no_channel' | 'no_customer' | 'not_linked' | 'blocked'

const UNREACHABLE_DETAIL: Readonly<Record<UnreachableReason, string>> = {
  no_channel: 'Telegram bot sozlanmagan',
  no_customer: 'Chekda mijoz yo‘q',
  not_linked: 'Mijoz botga ulanmagan',
  blocked: 'Mijoz botni bloklagan',
}

/** 422 `RECIPIENT_UNREACHABLE`: `meta.reason` va qo'shimcha (masalan guruhda `unreachable` soni) */
export function unreachableError(
  reason: UnreachableReason,
  detail = UNREACHABLE_DETAIL[reason],
  meta: Record<string, unknown> = {},
): DomainError {
  return new DomainError('RECIPIENT_UNREACHABLE', detail, [{ code: 'RECIPIENT_UNREACHABLE', meta: { reason, ...meta } }])
}

/**
 * Telegram "yetib bo'lmaydi" dedi (botni bloklagan, chat yo'q): mijoz bloklagan
 * deb belgilanadi — bog'lanish QOLADI, botni qayta ochsa xabarlar davom etadi
 */
export function markTelegramBlocked(tx: TenantTx, tenantId: string, chatIds: readonly (string | bigint)[]): Promise<number> {
  return tx.$executeRaw`
    UPDATE clients SET telegram_blocked_at = now()
     WHERE tenant_id = ${tenantId}::uuid AND telegram_blocked_at IS NULL
       AND telegram_chat_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(chatIds.map(String))}::jsonb)::bigint)`
}

/**
 * Telegram bot (Q116). Bot odamga raqami bo'yicha yoza olmaydi va Start
 * bosganda raqamini ham bilmaydi (Telegram qoidasi) — shuning uchun har
 * mijozga SHAXSIY havola: xodim mijoz kartasidan QR chiqaradi, mijoz uni
 * skanerlab Start bosadi va chat shu mijozga bog'lanadi. Mijoz hech narsa
 * yozmaydi. Havola bir martalik va 7 kun amal qiladi; bazada — token xeshi.
 *
 * Mijoz botdan chiqib keta olmaydi (`/stop` yo'q). Botni bloklashni Telegram
 * o'zi beradi — uni to'xtatib bo'lmaydi: mijoz "bloklagan" deb belgilanadi
 * (xodim ko'radi), qayta ochsa xabarlar davom etadi.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name)
  private botUsername?: Promise<string>

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    @Optional() @Inject(TELEGRAM_CLIENT) private readonly client: TelegramClient | null,
  ) {}

  async status(): Promise<TelegramStatusDto> {
    if (!this.client) return { enabled: false, botUsername: null }
    return { enabled: true, botUsername: await this.username(this.client) }
  }

  /** Mijozning shaxsiy havolasi — yangi token, eskisi bekor bo'ladi. So'rov tranzaksiyasida */
  async createLink(clientId: string): Promise<TelegramLinkDto> {
    // Boshqa do'kon (yoki o'chirilgan) mijozi — sozlamadan qat'i nazar 404 (izolyatsiya qoidasi)
    const found = await this.prisma.scoped.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } })
    if (!found) throw new NotFoundError('Mijoz', clientId)
    if (!this.client) throw unreachableError('no_channel')
    // Bot nomi — birinchi marta Telegram'dan (keyin keshda); yozishdan OLDIN — qator qulfi tashqi so'rovni kutmasin
    const username = await this.username(this.client)
    const token = randomBytes(TOKEN_BYTES).toString('base64url')
    const expiresAt = new Date(Date.now() + LINK_TTL_MS)
    const updated = await this.prisma.scoped.$executeRaw`
      UPDATE clients SET telegram_link_hash = ${hashToken(token)}, telegram_link_expires_at = ${expiresAt}
       WHERE tenant_id = ${currentTenantId()}::uuid AND id = ${clientId}::uuid AND deleted_at IS NULL`
    if (updated === 0) throw new NotFoundError('Mijoz', clientId)
    return { link: `https://t.me/${username}?start=${token}`, expiresAt }
  }

  /**
   * Mijozga hujjat (chek PDF) — darhol, navbatsiz: xodim natijani kutadi.
   * So'rov tranzaksiyasi TASHQARISIDA chaqiriladi (`@ManualTransaction`): o'qish
   * va belgilash — qisqa tranzaksiyalarda, Telegram'ga yuklash — ularsiz.
   */
  async sendDocument(clientId: string | null, file: TelegramFile, caption: string): Promise<void> {
    if (!this.client) throw unreachableError('no_channel')
    if (!clientId) throw unreachableError('no_customer')
    const tenantId = currentTenantId()
    const target = await this.prisma.inTenantTransaction(tenantId, (tx) =>
      tx.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { telegramChatId: true, telegramBlockedAt: true } }),
    )
    const chatId = target?.telegramChatId
    if (!chatId) throw unreachableError('not_linked')
    if (target.telegramBlockedAt) throw unreachableError('blocked')
    try {
      await this.client.sendDocument(Number(chatId), file, caption, { html: true })
    } catch (err) {
      if (err instanceof TelegramApiError && err.unreachable) {
        await this.prisma.inTenantTransaction(tenantId, (tx) => markTelegramBlocked(tx, tenantId, [chatId]))
        throw unreachableError('blocked')
      }
      this.logger.error({ err }, 'Telegram: hujjat yuborilmadi')
      throw new ServiceUnavailableException('Telegram javob bermadi — birozdan keyin qayta urinib ko‘ring')
    }
  }

  /** Webhook faqat Telegram'dan: `setWebhook` da berilgan sir. Bot o'chiq bo'lsa — yopiq */
  assertWebhookSecret(given: string | undefined): void {
    const secret = this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true })
    const expected = Buffer.from(secret ?? '')
    const actual = Buffer.from(given ?? '')
    if (!this.client || !secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException('Telegram webhook siri noto‘g‘ri')
    }
  }

  /**
   * Webhook va polling uchun. Xato loglanadi va YUTILADI: Telegram javobsiz
   * yangilanishni qayta-qayta yuborib, keyingilarini to'sib qo'yardi.
   */
  async receive(update: TelegramUpdate): Promise<void> {
    try {
      await this.handle(update)
    } catch (err) {
      this.logger.error({ err, updateId: update.update_id }, 'Telegram yangilanishi qayta ishlanmadi')
    }
  }

  private async handle(update: TelegramUpdate): Promise<void> {
    const client = this.client
    if (!client) return
    const member = update.my_chat_member
    if (member) {
      // Bloklasa (`kicked`) — belgilanadi; qayta ochsa (`member`) — xabarlar davom etadi
      if (member.chat.type === 'private') await this.setBlocked(member.chat.id, member.new_chat_member.status === 'kicked')
      return
    }
    const message = update.message
    if (!message || message.chat.type !== 'private') return
    const start = START.exec(message.text?.trim() ?? '')
    if (!start) {
      await reply(client, message.chat.id, BOT_TEXT.help)
      return
    }
    await this.onStart(client, message.chat.id, start[1])
  }

  private async onStart(client: TelegramClient, chatId: number, payload: string | undefined): Promise<void> {
    const linked = payload && TOKEN_PATTERN.test(payload) ? await this.linkByToken(chatId, payload) : null
    if (linked) {
      await reply(client, chatId, BOT_TEXT.linked(linked.store, linked.name))
      return
    }
    // Havolasiz /start (botni qayta ochish ham) yoki ishlatilgan havola (takroriy yangilanish) —
    // allaqachon ulangan bo'lsa shuni aytadi
    const already = (await this.linkedTenants(chatId)).length > 0
    await reply(client, chatId, already ? BOT_TEXT.alreadyLinked : payload ? BOT_TEXT.badLink : BOT_TEXT.noLink)
  }

  /** Token bir martalik: bog'lash bilan birga o'chadi. Faol bo'lmagan do'kon havolasi ishlamaydi */
  private async linkByToken(chatId: number, token: string): Promise<{ store: string; name: string } | null> {
    const hash = hashToken(token)
    const [found] = await this.prisma.$queryRaw<{ tenantId: string | null }[]>`SELECT telegram_link_tenant(${hash}) AS "tenantId"`
    const tenantId = found?.tenantId
    if (!tenantId || !(await this.isActive(tenantId))) return null
    const linked = await runWithContext({ ...currentContext(), tenantId }, () =>
      this.prisma.inTenantTransaction(tenantId, async (tx) => {
        const [row] = await tx.$queryRaw<{ id: string; name: string }[]>`
          UPDATE clients
             SET telegram_chat_id = ${chatId}::bigint, telegram_linked_at = now(), telegram_blocked_at = NULL,
                 telegram_link_hash = NULL, telegram_link_expires_at = NULL
           WHERE tenant_id = ${tenantId}::uuid AND telegram_link_hash = ${hash}
             AND telegram_link_expires_at > now() AND deleted_at IS NULL
          RETURNING id, name`
        if (row) await this.audit.log({ action: 'client.telegramLinked', entityType: 'client', entityId: row.id }, tx)
        return row
      }),
    )
    if (!linked) return null
    return { store: (await this.settings.forTenant(tenantId)).storeName, name: linked.name }
  }

  /** Chat bog'langan barcha do'konlarda: har biri — o'z tranzaksiyasida (RLS) */
  private async setBlocked(chatId: number, blocked: boolean): Promise<void> {
    for (const tenantId of await this.linkedTenants(chatId)) {
      // Ketma-ket ATAYLAB: har do'kon — o'z tenant tranzaksiyasi. Soni — shu odam mijoz bo'lgan do'konlar
      // eslint-disable-next-line no-await-in-loop
      await this.prisma.inTenantTransaction(tenantId, (tx) =>
        blocked
          ? markTelegramBlocked(tx, tenantId, [String(chatId)])
          : tx.$executeRaw`
              UPDATE clients SET telegram_blocked_at = NULL
               WHERE tenant_id = ${tenantId}::uuid AND telegram_chat_id = ${chatId}::bigint AND telegram_blocked_at IS NOT NULL`,
      )
    }
  }

  /** SECURITY DEFINER funksiya — faqat tenant id'lari (ma'lumot emas) */
  private async linkedTenants(chatId: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`SELECT tenants_with_telegram_chat(${chatId}::bigint) AS id`
    return rows.map((r) => r.id)
  }

  private async isActive(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } })
    return tenant?.status === 'active'
  }

  /** Bot nomi (`getMe`) bir marta so'raladi; xato keshlanmaydi — keyingi so'rov qayta uradi */
  private async username(client: TelegramClient): Promise<string> {
    this.botUsername ??= client.getMe().then((me) => {
      if (!me.username) throw new Error('Telegram getMe: botda username yo‘q')
      return me.username
    })
    try {
      return await this.botUsername
    } catch (err) {
      this.botUsername = undefined
      this.logger.error({ err }, 'Telegram bot nomini olib bo‘lmadi')
      throw new ServiceUnavailableException('Telegram javob bermadi — birozdan keyin qayta urinib ko‘ring')
    }
  }
}

/** Bazada token emas, uning xeshi: baza nusxasi sizsa ham havolani tiklab bo'lmaydi */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Bot javobi — `BOT_TEXT` HTML'da */
async function reply(client: TelegramClient, chatId: number, text: string): Promise<void> {
  await client.sendMessage(chatId, text, { html: true })
}
