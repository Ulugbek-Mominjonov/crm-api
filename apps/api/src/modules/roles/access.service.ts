import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { SystemRole } from '@prisma/client'
import { effectivePermissions, type PermissionSet } from '@crm/shared'
import { TtlCache } from '@/common/cache/ttl-cache'
import type { Env } from '@/config/env.schema'
import { PrismaService } from '@/prisma/prisma.service'
import { onCommit } from '@/prisma/tenant-tx'

/** Foydalanuvchining amaldagi huquqi — har so'rovda shu (tokendagi emas) */
export interface Access {
  roleId: string
  /** Tizim roli kaliti; do'kon yaratgan rolda — null */
  role: SystemRole | null
  permissions: PermissionSet
}

/**
 * Kesh muddati. Shu instansiyadagi o'zgarish darhol (COMMIT'dan keyin
 * bekor qilinadi), boshqa instansiya ko'pi bilan shuncha kechikib ko'radi.
 */
const ACCESS_TTL_MS = 30_000
const MAX_ENTRIES = 10_000

/**
 * Rol va ruxsatlar (T-134). Token faqat KIMligini aytadi; rol har so'rovda
 * shu servisdan: rol tahriri, foydalanuvchiga boshqa rol berish yoki uni
 * faolsizlantirish token muddatini kutmaydi.
 *
 * Ikki kesh: foydalanuvchi → rol id, rol id → ruxsatlar. Barqaror holatda
 * so'rov bazaga bormaydi; keshda yo'q bo'lsa — bitta so'rov (hisob + rol
 * JOIN). Rol tahriri faqat rol yozuvini, rol almashtirish — foydalanuvchi
 * yozuvini bekor qiladi.
 */
/** Foydalanuvchi keshi: roli va sessiyalar yopilgan vaqt (soniya, `iat` bilan solishtiriladi) */
interface UserEntry {
  roleId: string
  invalidBefore: number | null
}

@Injectable()
export class AccessService {
  private readonly userRoles: TtlCache<string, UserEntry>
  private readonly roles: TtlCache<string, Access>

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const cached = config.get('CACHE_DRIVER', { infer: true }) !== 'none'
    this.userRoles = cached ? new TtlCache(ACCESS_TTL_MS, MAX_ENTRIES) : TtlCache.disabled()
    this.roles = cached ? new TtlCache(ACCESS_TTL_MS, MAX_ENTRIES) : TtlCache.disabled()
  }

  /**
   * Faol, o'chirilmagan hisobning huquqi; aks holda `null` (kirish yopiq).
   * `issuedAt` (token `iat`, soniya) sessiyalar yopilgan vaqtdan oldin bo'lsa
   * ham `null` — parol almashgach eski access token darhol o'chadi (T-147).
   */
  async forUser(tenantId: string, userId: string, issuedAt?: number): Promise<Access | null> {
    const cachedEntry = this.userRoles.get(userId)
    const cachedAccess = cachedEntry && this.roles.get(cachedEntry.roleId)
    const loaded = cachedEntry && cachedAccess ? { entry: cachedEntry, access: cachedAccess } : await this.loadUser(tenantId, userId)
    if (!loaded) return null
    if (issuedAt !== undefined && loaded.entry.invalidBefore !== null && issuedAt < loaded.entry.invalidBefore) return null
    return loaded.access
  }

  /** So'rov tranzaksiyasidan OLDIN (guard) — o'z qisqa tranzaksiyasida, RLS bilan; ikkala keshga yoziladi */
  private async loadUser(tenantId: string, userId: string): Promise<{ entry: UserEntry; access: Access } | null> {
    const user = await this.prisma.inTenantTransaction(tenantId, (tx) =>
      tx.user.findFirst({
        // Bo'shatilgan xodim ham kira olmaydi (login bilan bir xil qoida) — tokeni tugashini kutmaydi
        where: { id: userId, deletedAt: null, isActive: true, employee: { status: { not: 'fired' } } },
        select: { tokensInvalidBefore: true, role: { select: { id: true, key: true, permissions: true } } },
      }),
    )
    if (!user) return null
    const access = toAccess(user.role)
    const entry: UserEntry = {
      roleId: access.roleId,
      // Soniyagacha (JWT `iat` soniyada): shu soniyada berilgan token amal qiladi
      invalidBefore: user.tokensInvalidBefore ? Math.floor(user.tokensInvalidBefore.getTime() / 1000) : null,
    }
    this.userRoles.set(userId, entry)
    this.roles.set(access.roleId, access)
    return { entry, access }
  }

  /** Foydalanuvchi keshini DARHOL tashlash — tenant tranzaksiyasidan tashqarida (refresh oqimi) */
  forget(userId: string): void {
    this.userRoles.delete(userId)
  }

  /** Rol ruxsatlari o'zgardi yoki rol o'chirildi — COMMIT'dan keyin */
  roleChanged(roleId: string): void {
    onCommit(() => this.roles.delete(roleId))
  }

  /** Foydalanuvchining roli yoki faolligi o'zgardi — COMMIT'dan keyin */
  userChanged(userId: string): void {
    onCommit(() => this.userRoles.delete(userId))
  }
}

export function toAccess(role: { id: string; key: SystemRole | null; permissions: string[] }): Access {
  return {
    roleId: role.id,
    role: role.key,
    // Muzlatilmaydi, lekin hech kim o'zgartirmaydi: tip — `ReadonlySet`
    permissions: new Set(effectivePermissions(role.key, role.permissions)),
  }
}
