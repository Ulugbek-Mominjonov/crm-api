import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { currentContext, currentTenantId } from '@/common/context/request-context'
import { crudDelegate, SoftDeleteCrudService, type CrudDelegate } from '@/common/crud/crud.service'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { PasswordService } from '@/modules/auth/password.service'
import { RefreshTokenService } from '@/modules/auth/refresh-token.service'
import { PrismaService } from '@/prisma/prisma.service'
import { PlanService } from '@/modules/tenants/plan.service'
import { assertAdminRemains } from './admin-guard'
import {
  USER_SORT,
  type CreateUserDto,
  type UpdateUserDto,
  type UserDto,
  type UserListQueryDto,
} from './dto/user.dto'

const USER_SELECT = {
  id: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  employeeId: true,
  // D1: ism va lavozim xodimdan — `relationJoins` bilan o'sha so'rovda
  employee: { select: { name: true, position: true } },
} satisfies Prisma.UserSelect

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>

/**
 * Foydalanuvchilar (kirish hisoblari).
 *
 * Himoya qoidalari: o'z hisobini o'chirib/faolsizlantirib bo'lmaydi
 * (SELF_DELETE), o'z rolini o'zgartirib bo'lmaydi (SELF_ROLE_CHANGE),
 * oxirgi administrator qoladi (LAST_ADMIN). Parol hech qachon javobga
 * chiqmaydi — `select` da umuman yo'q.
 */
@Injectable()
export class UsersService extends SoftDeleteCrudService<
  UserRow,
  UserDto,
  CreateUserDto,
  UpdateUserDto,
  UserListQueryDto
> {
  protected readonly resource = 'Foydalanuvchi'
  protected readonly select = USER_SELECT
  protected readonly sortMap = USER_SORT
  protected readonly defaultSort = 'name'
  protected override readonly uniqueRules = [
    { field: 'email' },
    { field: 'employeeId', code: 'EMPLOYEE_HAS_USER' as const },
  ]

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly refresh: RefreshTokenService,
    private readonly plans: PlanService,
  ) {
    super()
  }

  protected delegate(): CrudDelegate<UserRow> {
    return crudDelegate(this.prisma.scoped.user)
  }

  protected toDto({ employee, ...row }: UserRow): UserDto {
    return { ...row, name: employee.name, position: employee.position }
  }

  protected filters(query: UserListQueryDto): Prisma.UserWhereInput {
    const q = query.q
    return {
      ...(q && {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { employee: { name: { contains: q, mode: 'insensitive' } } },
        ],
      }),
      ...(query.role && { role: query.role }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
    }
  }

  /**
   * Xodim mavjud va o'chirilmagan bo'lishi shart (D1). Xodimning hisobi
   * allaqachon bo'lsa — noyob `employee_id` to'xtatadi (EMPLOYEE_HAS_USER).
   */
  protected async createData(dto: CreateUserDto): Promise<Omit<Prisma.UserUncheckedCreateInput, 'tenantId'>> {
    await this.plans.assertRoom('users')
    const employee = await this.prisma.scoped.employee.findFirst({
      where: { id: dto.employeeId, deletedAt: null },
      select: { id: true },
    })
    if (!employee) {
      throw new DomainError('REFERENCE_NOT_FOUND', 'Xodim topilmadi', [
        { field: 'employeeId', code: 'REFERENCE_NOT_FOUND' },
      ])
    }
    return {
      employeeId: dto.employeeId,
      email: dto.email,
      role: dto.role,
      passwordHash: await this.passwords.hash(dto.password),
    }
  }

  protected updateData(dto: UpdateUserDto): Prisma.UserUncheckedUpdateInput {
    return { email: dto.email, role: dto.role, isActive: dto.isActive }
  }

  /**
   * Rol, faollik va parol. Parol tranzaksiyadan OLDIN xeshlanadi: argon2
   * sekin — qulf ushlab turilmasin. Parol almashsa yoki hisob o'chirilsa,
   * barcha sessiyalar shu tranzaksiyada yopiladi.
   */
  override async update(id: string, dto: UpdateUserDto, version?: Date): Promise<UserDto> {
    const actorId = currentContext().userId
    if (id === actorId && dto.isActive === false) {
      throw new DomainError('SELF_DELETE', 'O‘z hisobingizni faolsizlantirib bo‘lmaydi')
    }
    const passwordHash = dto.password === undefined ? undefined : await this.passwords.hash(dto.password)
    const endSessions = passwordHash !== undefined || dto.isActive === false

    const tenantId = currentTenantId()
    return this.prisma.inTenantTransaction(tenantId, async (tx) => {
      const current = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: { role: true, isActive: true },
      })
      if (!current) throw new NotFoundError(this.resource, id)
      if (id === actorId && dto.role !== undefined && dto.role !== current.role) {
        throw new DomainError('SELF_ROLE_CHANGE')
      }
      // Qayta faollashtirish — tarifdagi joyni egallaydi (T-125)
      if (dto.isActive === true && !current.isActive) await this.plans.assertRoom('users')

      const leavesAdmin = (dto.role !== undefined && dto.role !== 'admin') || dto.isActive === false
      if (current.role === 'admin' && leavesAdmin) {
        await assertAdminRemains(tx, tenantId, id)
      }

      await this.assertUnique({ email: dto.email }, id)
      const row = await tx.user
        .update({ where: { id, ...this.versionWhere(version) }, data: { ...this.updateData(dto), passwordHash }, select: USER_SELECT })
        .catch(this.staleOr404(id, version))
      if (endSessions) await this.refresh.revokeAllForUser(id, tx)
      return this.toDto(row)
    })
  }

  /** Tiklangan faol hisob tarifdagi joyni egallaydi (T-125) */
  override async restore(id: string): Promise<UserDto> {
    const deleted = await this.prisma.scoped.user.findFirst({ where: { id, deletedAt: { not: null } }, select: { isActive: true } })
    if (deleted?.isActive) await this.plans.assertRoom('users')
    return super.restore(id)
  }

  /** O'chirilgan hisob bilan kirib bo'lmaydi — sessiyalar ham shu zahoti yopiladi */
  override async remove(id: string): Promise<void> {
    if (id === currentContext().userId) {
      throw new DomainError('SELF_DELETE')
    }
    const tenantId = currentTenantId()
    await this.prisma.inTenantTransaction(tenantId, async (tx) => {
      const current = await tx.user.findFirst({
        where: { id, deletedAt: null },
        select: { role: true },
      })
      if (!current) throw new NotFoundError(this.resource, id)
      if (current.role === 'admin') await assertAdminRemains(tx, tenantId, id)

      await tx.user.update({ where: { id }, data: { deletedAt: new Date() }, select: { id: true } })
      await this.refresh.revokeAllForUser(id, tx)
    })
  }
}
