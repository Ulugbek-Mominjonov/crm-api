import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { currentTenantId } from '@/common/context/request-context'
import { dateFromDb, dateToDb, mapDefined, moneyFromDb, moneyToDb } from '@/common/crud/convert'
import { crudDelegate, SoftDeleteCrudService, type CrudDelegate } from '@/common/crud/crud.service'
import { DomainError } from '@/common/errors/domain.error'
import { assertAdminRemains } from '@/modules/users/admin-guard'
import { PrismaService } from '@/prisma/prisma.service'
import {
  EMPLOYEE_SORT,
  type CreateEmployeeDto,
  type EmployeeDto,
  type EmployeeListQueryDto,
  type UpdateEmployeeDto,
} from './dto/employee.dto'

const EMPLOYEE_SELECT = {
  id: true,
  name: true,
  position: true,
  phone: true,
  status: true,
  salary: true,
  hiredAt: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, deletedAt: true } },
} satisfies Prisma.EmployeeSelect

type EmployeeRow = Prisma.EmployeeGetPayload<{ select: typeof EMPLOYEE_SELECT }>

const MIN_PHONE_SEARCH_DIGITS = 3

/**
 * Xodimlar — shaxs (D1). Kirish hisobi (`User`) bo'lsa, u shu yozuvga
 * bog'langan: ism/lavozim o'zgarsa foydalanuvchida ham darhol ko'rinadi.
 */
@Injectable()
export class EmployeesService extends SoftDeleteCrudService<
  EmployeeRow,
  EmployeeDto,
  CreateEmployeeDto,
  UpdateEmployeeDto,
  EmployeeListQueryDto
> {
  protected readonly resource = 'Xodim'
  protected readonly select = EMPLOYEE_SELECT
  protected readonly sortMap = EMPLOYEE_SORT
  protected readonly defaultSort = 'name'

  constructor(private readonly prisma: PrismaService) {
    super()
  }

  protected delegate(): CrudDelegate<EmployeeRow> {
    return crudDelegate(this.prisma.scoped.employee)
  }

  protected toDto({ user, ...row }: EmployeeRow): EmployeeDto {
    return {
      ...row,
      salary: moneyFromDb(row.salary),
      hiredAt: dateFromDb(row.hiredAt),
      userId: user && !user.deletedAt ? user.id : null,
    }
  }

  protected filters(query: EmployeeListQueryDto): Prisma.EmployeeWhereInput {
    const q = query.q
    const digits = q?.replace(/\D/g, '') ?? ''
    return {
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { position: { contains: q, mode: 'insensitive' } },
          ...(digits.length >= MIN_PHONE_SEARCH_DIGITS ? [{ phone: { contains: digits } }] : []),
        ],
      }),
      ...(query.status && { status: query.status }),
    }
  }

  protected createData(dto: CreateEmployeeDto): Omit<Prisma.EmployeeUncheckedCreateInput, 'tenantId'> {
    return {
      name: dto.name,
      position: dto.position,
      phone: dto.phone,
      status: dto.status,
      salary: mapDefined(dto.salary, moneyToDb),
      hiredAt: dateToDb(dto.hiredAt),
    }
  }

  protected updateData(dto: UpdateEmployeeDto): Prisma.EmployeeUncheckedUpdateInput {
    return {
      name: dto.name,
      position: dto.position,
      phone: dto.phone,
      status: dto.status,
      salary: mapDefined(dto.salary, moneyToDb),
      hiredAt: mapDefined(dto.hiredAt, dateToDb),
    }
  }

  /**
   * Bo'shatilgan xodim tizimga kira olmaydi (`auth.service`). Shuning uchun
   * oxirgi administratorning xodimini bo'shatish ham LAST_ADMIN qoidasiga
   * bo'ysunadi — aks holda menejer direktorni tizimdan chiqarib qo'yardi.
   */
  override async update(id: string, dto: UpdateEmployeeDto, version?: Date): Promise<EmployeeDto> {
    if (dto.status !== 'fired') return super.update(id, dto, version)

    const tenantId = currentTenantId()
    return this.prisma.inTenantTransaction(tenantId, async (tx) => {
      const user = await tx.user.findFirst({
        where: { employeeId: id, deletedAt: null },
        select: { id: true },
      })
      if (user) await assertAdminRemains(tx, tenantId, user.id)

      const row = await tx.employee
        .update({ where: { id, deletedAt: null, ...this.versionWhere(version) }, data: this.updateData(dto), select: EMPLOYEE_SELECT })
        .catch(this.staleOr404(id, version))
      return this.toDto(row)
    })
  }

  /** Kirish hisobi bor xodim o'chmaydi — avval foydalanuvchi o'chiriladi (D1) */
  protected override async assertDeletable(id: string): Promise<void> {
    const user = await this.prisma.scoped.user.findFirst({
      where: { employeeId: id, deletedAt: null },
      select: { id: true },
    })
    if (user) {
      throw new DomainError('EMPLOYEE_HAS_USER', 'Xodimning kirish hisobi bor — avval foydalanuvchini o‘chiring', [
        { field: 'id', code: 'EMPLOYEE_HAS_USER', meta: { userId: user.id } },
      ])
    }
  }
}
