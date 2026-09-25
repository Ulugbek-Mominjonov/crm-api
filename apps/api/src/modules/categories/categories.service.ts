import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { crudDelegate, SoftDeleteCrudService, type CrudDelegate } from '@/common/crud/crud.service'
import { searchWhere } from '@/common/crud/search'
import { DomainError } from '@/common/errors/domain.error'
import { PrismaService } from '@/prisma/prisma.service'
import {
  CATEGORY_SORT,
  type CategoryDto,
  type CategoryListQueryDto,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from './dto/category.dto'

const CATEGORY_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  updatedAt: true,
  // `relationJoins` tufayli ro'yxat bilan BITTA so'rovda sanaladi
  _count: { select: { products: { where: { deletedAt: null } } } },
} satisfies Prisma.CategorySelect

type CategoryRow = Prisma.CategoryGetPayload<{ select: typeof CATEGORY_SELECT }>

/**
 * Mahsulot kategoriyalari.
 *
 * D4 (10 §10.3): mahsulot kategoriyaga NOM bilan emas, `categoryId` bilan
 * bog'langan — nomni o'zgartirish bitta `UPDATE`, mahsulotlarga tegilmaydi.
 */
@Injectable()
export class CategoriesService extends SoftDeleteCrudService<
  CategoryRow,
  CategoryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryListQueryDto
> {
  protected readonly resource = 'Kategoriya'
  protected readonly select = CATEGORY_SELECT
  protected readonly sortMap = CATEGORY_SORT
  protected readonly defaultSort = 'sortOrder'
  protected override readonly uniqueRules = [{ field: 'name' }]

  constructor(private readonly prisma: PrismaService) {
    super()
  }

  protected delegate(): CrudDelegate<CategoryRow> {
    return crudDelegate(this.prisma.scoped.category)
  }

  protected toDto({ _count, ...row }: CategoryRow): CategoryDto {
    return { ...row, productCount: _count.products }
  }

  protected filters(query: CategoryListQueryDto): Prisma.CategoryWhereInput {
    return searchWhere(query.q, ['name'])
  }

  /** Tartib berilmasa — oxiriga (frontenddagi `addCategory` kabi) */
  protected async createData(
    dto: CreateCategoryDto,
  ): Promise<Omit<Prisma.CategoryUncheckedCreateInput, 'tenantId'>> {
    if (dto.sortOrder !== undefined) return { name: dto.name, sortOrder: dto.sortOrder }
    const { _max } = await this.prisma.scoped.category.aggregate({ _max: { sortOrder: true } })
    return { name: dto.name, sortOrder: (_max.sortOrder ?? -1) + 1 }
  }

  protected updateData(dto: UpdateCategoryDto): Prisma.CategoryUncheckedUpdateInput {
    return { name: dto.name, sortOrder: dto.sortOrder }
  }

  /** Ishlatilayotgan kategoriya o'chmaydi — mahsulotlar "kategoriyasiz" qolmasin */
  protected override async assertDeletable(id: string): Promise<void> {
    const productCount = await this.prisma.scoped.product.count({
      where: { categoryId: id, deletedAt: null },
    })
    if (productCount > 0) {
      throw new DomainError(
        'CATEGORY_IN_USE',
        `Kategoriyada ${productCount} ta mahsulot bor — avval ularni boshqa kategoriyaga o‘tkazing`,
        [{ field: 'id', code: 'CATEGORY_IN_USE', meta: { productCount } }],
      )
    }
  }
}
