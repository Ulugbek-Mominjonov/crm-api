import { Injectable } from '@nestjs/common'
import type { Prisma, SystemRole } from '@prisma/client'
import {
  effectivePermissions, normalizePermissions, PERMISSION_CATALOG, PERMISSION_GROUPS, type Permission,
} from '@crm/shared'
import { currentTenantId } from '@/common/context/request-context'
import { isRecordNotFound, rethrowAsDomain } from '@/common/crud/prisma-errors'
import { DomainError, NotFoundError, VersionConflictError } from '@/common/errors/domain.error'
import { AuditService } from '@/modules/audit/audit.service'
import { DomainEvents } from '@/modules/realtime/domain-events.service'
import { PrismaService } from '@/prisma/prisma.service'
import { AccessService } from './access.service'
import { assertWithinActor } from './actor-scope'
import type { CreateRoleDto, PermissionCatalogDto, RoleDto, UpdateRoleDto } from './dto/role.dto'

const RESOURCE = 'Rol'

const ROLE_SELECT = {
  id: true,
  key: true,
  name: true,
  permissions: true,
  updatedAt: true,
  // O'chirilgan hisoblar sanalmaydi (lekin rolni o'chirishda ular ham ko'chiriladi)
  _count: { select: { users: { where: { deletedAt: null } } } },
} satisfies Prisma.RoleSelect

type RoleRow = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>

/** Foydalanuvchiga beriladigan rol (huquq oshirish tekshiruvi uchun ruxsatlari bilan) */
export interface RoleRef {
  id: string
  key: SystemRole | null
  permissions: Permission[]
}

/**
 * Do'kon rollari (T-134). Ruxsatlar ROLGA beriladi; foydalanuvchi — bitta
 * rolda. Boshqarish — `roles.*` ruxsati bilan; administrator bo'lmagan egasi
 * faqat O'ZIDA bor ruxsatlar doirasida (`assertWithinActor`): kengroq rolni
 * yarata, tahrirlay, o'chira olmaydi, hisoblarni unga ko'chira olmaydi.
 *
 * Tizim rollari: `admin` — o'zgarmaydi (doim hammasi); qolganlarida faqat
 * ruxsatlar o'zgaradi. Ular o'chirilmaydi — eski mijoz (`role` kaliti) va
 * ko'chirish (migratsiya) ularga tayanadi.
 *
 * Ruxsat o'zgarsa — `AccessService` keshi COMMIT'dan keyin bekor va do'konga
 * `access.changed`: ochiq ilovalar `GET /auth/me` ni qayta so'raydi.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: DomainEvents,
    private readonly access: AccessService,
  ) {}

  /** Hammasi (do'konda o'nlab) — sahifasiz: avval tizim rollari, keyin nom bo'yicha */
  async list(): Promise<RoleDto[]> {
    const rows = await this.prisma.scoped.role.findMany({
      select: ROLE_SELECT,
      orderBy: [{ key: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
    })
    return rows.map(toRoleDto)
  }

  async get(id: string): Promise<RoleDto> {
    return toRoleDto(await this.find(id))
  }

  catalog(): PermissionCatalogDto {
    return {
      groups: Object.entries(PERMISSION_GROUPS).map(([key, label]) => ({ key: key as keyof typeof PERMISSION_GROUPS, label })),
      resources: [...PERMISSION_CATALOG],
    }
  }

  async create(dto: CreateRoleDto): Promise<RoleDto> {
    const permissions = normalizePermissions(dto.permissions)
    assertWithinActor({ key: null, permissions })
    await this.assertNameFree(dto.name)
    const row = await this.prisma.scoped.role
      .create({ data: { tenantId: currentTenantId(), name: dto.name, permissions }, select: ROLE_SELECT })
      .catch((err: unknown) => rethrowAsDomain(err, { resource: RESOURCE, unique: { name: 'ALREADY_EXISTS' } }))
    await this.audit.log({ action: 'role.create', entityType: 'role', entityId: row.id, diff: { name: row.name, permissions } })
    return toRoleDto(row)
  }

  /** `version` (`If-Match`) eskirgan bo'lsa — 409 `VERSION_CONFLICT` joriy holat bilan */
  async update(id: string, dto: UpdateRoleDto, version?: Date): Promise<RoleDto> {
    const current = await this.find(id)
    assertEditable(current, dto)
    assertWithinActor(scopeOf(current))
    const permissions = dto.permissions && normalizePermissions(dto.permissions)
    if (permissions) assertWithinActor({ key: current.key, permissions })
    if (dto.name !== undefined) await this.assertNameFree(dto.name, id)

    const row = await this.prisma.scoped.role
      .update({
        where: { id, ...(version && { updatedAt: { gte: version, lt: new Date(version.getTime() + 1) } }) },
        data: { name: dto.name, permissions },
        select: ROLE_SELECT,
      })
      .catch(async (err: unknown) => {
        if (version && isRecordNotFound(err)) throw new VersionConflictError(toRoleDto(await this.find(id)))
        return rethrowAsDomain(err, { resource: RESOURCE, id, unique: { name: 'ALREADY_EXISTS' } })
      })

    const diff = roleDiff(current, row)
    if (diff.permissions) this.accessChanged(id)
    await this.audit.log({ action: 'role.update', entityType: 'role', entityId: id, diff })
    return toRoleDto(row)
  }

  /**
   * Do'kon yaratgan rolni o'chirish. Foydalanuvchilari (o'chirilganlari ham —
   * tiklansa rolsiz qolmasin) bo'lsa — `replaceWith` rolga o'tkaziladi, aks
   * holda 409 `ROLE_IN_USE`. Rol qatori qulflanadi: shu orada unga yangi
   * foydalanuvchi bog'lanmaydi (FK tekshiruvi qulfni kutadi).
   */
  async remove(id: string, replaceWith?: string): Promise<void> {
    const tx = this.prisma.scoped
    const [role] = await tx.$queryRaw<{ name: string; key: SystemRole | null; permissions: string[] }[]>`
      SELECT name, key, permissions FROM roles WHERE tenant_id = ${currentTenantId()}::uuid AND id = ${id}::uuid FOR UPDATE`
    if (!role) throw new NotFoundError(RESOURCE, id)
    if (role.key) throw new DomainError('ROLE_PROTECTED', 'Tizim rolini o‘chirib bo‘lmaydi')
    assertWithinActor(scopeOf(role))

    const holders = await tx.user.count({ where: { roleId: id } })
    if (holders > 0) await this.moveUsers(id, holders, replaceWith)
    await tx.role.delete({ where: { id }, select: { id: true } })

    this.accessChanged(id)
    await this.audit.log({
      action: 'role.delete',
      entityType: 'role',
      entityId: id,
      diff: { name: role.name, movedUsers: holders, ...(holders > 0 && { replaceWith }) },
    })
  }

  /**
   * Foydalanuvchiga beriladigan rol: `roleId` yoki eski mijozning `role`
   * kaliti (tizim roli). Topilmasa — 422 `REFERENCE_NOT_FOUND` (`roleId`).
   */
  async resolve(ref: { roleId?: string; role?: SystemRole }): Promise<RoleRef> {
    const where = ref.roleId !== undefined ? { id: ref.roleId } : { key: ref.role }
    const row = await this.prisma.scoped.role.findFirst({ where, select: { id: true, key: true, permissions: true } })
    if (!row) {
      throw new DomainError('REFERENCE_NOT_FOUND', 'Rol topilmadi', [{ field: 'roleId', code: 'REFERENCE_NOT_FOUND' }])
    }
    return { id: row.id, key: row.key, permissions: effectivePermissions(row.key, row.permissions) }
  }

  private async moveUsers(id: string, holders: number, replaceWith?: string): Promise<void> {
    if (!replaceWith) {
      throw new DomainError('ROLE_IN_USE', `Rolda ${holders} ta foydalanuvchi bor — \`replaceWith\` bilan boshqa rolga o‘tkazing`, [
        { field: 'replaceWith', code: 'ROLE_IN_USE', meta: { users: holders } },
      ])
    }
    const target = replaceWith === id
      ? null
      : await this.prisma.scoped.role.findFirst({ where: { id: replaceWith }, select: { key: true, permissions: true } })
    if (!target) {
      throw new DomainError('REFERENCE_NOT_FOUND', 'O‘tkaziladigan rol topilmadi', [
        { field: 'replaceWith', code: 'REFERENCE_NOT_FOUND' },
      ])
    }
    // Ko'chirilganlar (o'zi ham bo'lishi mumkin) kengroq rolga o'tmasin
    assertWithinActor(scopeOf(target))
    await this.prisma.scoped.user.updateMany({ where: { roleId: id }, data: { roleId: replaceWith } })
  }

  private async find(id: string): Promise<RoleRow> {
    const row = await this.prisma.scoped.role.findFirst({ where: { id }, select: ROLE_SELECT })
    if (!row) throw new NotFoundError(RESOURCE, id)
    return row
  }

  /** Nom do'konda noyob, katta-kichik harf farqsiz (bazada — `lower(name)` indeksi) */
  private async assertNameFree(name: string, excludeId?: string): Promise<void> {
    const clash = await this.prisma.scoped.role.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, ...(excludeId && { NOT: { id: excludeId } }) },
      select: { id: true },
    })
    if (!clash) return
    throw new DomainError('ALREADY_EXISTS', `${RESOURCE}: «${name}» nomi band`, [{ field: 'name', code: 'ALREADY_EXISTS' }])
  }

  /** Kesh (shu instansiya) va ochiq ilovalar — COMMIT'dan keyin */
  private accessChanged(roleId: string): void {
    this.access.roleChanged(roleId)
    this.events.publish('access.changed', {})
  }
}

/** Saqlangan rol → amaldagi ruxsatlari (administrator — hammasi) */
function scopeOf(role: { key: SystemRole | null; permissions: string[] }): { key: SystemRole | null; permissions: Permission[] } {
  return { key: role.key, permissions: effectivePermissions(role.key, role.permissions) }
}

/** `admin` — hech narsa o'zgarmaydi; boshqa tizim rolining nomi doimiy (mijoz uni tarjima qiladi) */
function assertEditable(role: RoleRow, dto: UpdateRoleDto): void {
  if (role.key === 'admin') {
    throw new DomainError('ROLE_PROTECTED', 'Administrator roli o‘zgarmaydi — u doim barcha ruxsatlarga ega')
  }
  if (role.key && dto.name !== undefined && dto.name !== role.name) {
    throw new DomainError('ROLE_PROTECTED', 'Tizim rolining nomi o‘zgarmaydi — faqat ruxsatlari', [
      { field: 'name', code: 'ROLE_PROTECTED' },
    ])
  }
}

export function toRoleDto(row: RoleRow): RoleDto {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    permissions: effectivePermissions(row.key, row.permissions),
    usersCount: row._count.users,
    updatedAt: row.updatedAt,
  }
}

/** Jurnal uchun: nom `{ from, to }`, ruxsatlar — qo'shilgan va olingan */
function roleDiff(before: RoleRow, after: RoleRow): Prisma.InputJsonObject {
  const diff: Record<string, Prisma.InputJsonValue> = {}
  if (before.name !== after.name) diff.name = { from: before.name, to: after.name }
  const added = after.permissions.filter((p) => !before.permissions.includes(p))
  const removed = before.permissions.filter((p) => !after.permissions.includes(p))
  if (added.length > 0 || removed.length > 0) diff.permissions = { added, removed }
  return diff
}
