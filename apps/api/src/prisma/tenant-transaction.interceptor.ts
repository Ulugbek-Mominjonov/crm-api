import { Injectable, SetMetadata, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { defer, lastValueFrom, type Observable } from 'rxjs'
import { CommittedDomainError, type DomainError } from '@/common/errors/domain.error'
import type { AuthContext } from '@/modules/auth/decorators/current-user.decorator'
import { PrismaService } from './prisma.service'

/**
 * So'rov uzoq ishlashi mumkin (5000 qatorli import ~2 s). Chegara undan
 * keng, lekin cheksiz emas: osilib qolgan so'rov qulflarni ushlab turmasin.
 */
const REQUEST_TX_TIMEOUT_MS = 30_000

const TX_TIMEOUT_KEY = 'txTimeout'

/**
 * Shu yo'l tranzaksiyasi uchun boshqa chegara — FAQAT ataylab uzun
 * ishlarga (migratsiya importi). Oddiy so'rovga uzun chegara qulflarni
 * uzoq ushlab turishga yo'l ochardi.
 */
export const TransactionTimeout = (ms: number): MethodDecorator => SetMetadata(TX_TIMEOUT_KEY, ms)

const TX_MANUAL_KEY = 'txManual'

/**
 * So'rov tranzaksiyasi OCHILMAYDI — servis tranzaksiyalarini o'zi ochadi
 * (`inTenantTransaction`). Bitta tranzaksiya yaramaydigan holat uchun:
 * zaxira butun do'konni bitta suratda (REPEATABLE READ) o'qiydi, faylni
 * esa alohida oddiy tranzaksiyada yozadi — suratli tranzaksiyada issiq
 * qatorni (`tenant_state`) yangilash parallel sotuv bilan to'qnashardi.
 */
export const ManualTransaction = (): MethodDecorator => SetMetadata(TX_MANUAL_KEY, true)

/**
 * Har bir AUTENTIFIKATSIYALANGAN so'rov — bitta tenant tranzaksiyasi.
 *
 * Nega: RLS (3-qatlam) `app.tenant_id` ni faqat tranzaksiya ichida ko'radi.
 * Servislar `prisma.scoped` orqali shu tranzaksiyani oladi — ularning
 * o'zi hech narsani eslab qolishi shart emas. Qo'shimcha foyda: so'rov
 * yaxlit — xato bo'lsa hamma yozuv bekor, javob esa COMMIT'dan keyin.
 *
 * Narxi: har so'rovga 3 ta xizmat buyrug'i (BEGIN, set_config, COMMIT) va
 * so'rov davomida bitta ulanish band.
 *
 * Ochiq yo'llar (login, health) tenantsiz — tranzaksiya ochilmaydi.
 *
 * `CommittedDomainError` — istisno: yozuvlar saqlanadi (COMMIT), mijozga
 * ichidagi xato qaytadi (masalan fayl karantini va uning audit yozuvi).
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>()
    const tenantId = req.auth?.tenantId
    if (!tenantId || this.reflector.get<boolean>(TX_MANUAL_KEY, ctx.getHandler())) return next.handle()

    return defer(async () => {
      let failure: DomainError | undefined
      const result = await this.prisma.inTenantTransaction(
        tenantId,
        async () => {
          try {
            return await lastValueFrom(next.handle(), { defaultValue: undefined })
          } catch (err) {
            if (!(err instanceof CommittedDomainError)) throw err
            failure = err.error
            return undefined
          }
        },
        { timeout: this.reflector.get<number | undefined>(TX_TIMEOUT_KEY, ctx.getHandler()) ?? REQUEST_TX_TIMEOUT_MS },
      )
      if (failure) throw failure
      return result
    })
  }
}
