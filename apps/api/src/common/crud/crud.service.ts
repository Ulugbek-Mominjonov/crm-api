import { DomainError, NotFoundError, VersionConflictError } from '@/common/errors/domain.error'
import type { ErrorCodeName } from '@/common/errors/error-catalog'
import type { ListQueryDto } from './list-query.dto'
import { pageArgs, toPaged, type Paged } from './paging'
import { isRecordNotFound, rethrowAsDomain } from './prisma-errors'
import { orderByOf, type SortMap } from './sort'

/** Ro'yxat so'rovi: umumiy parametrlar + resursning saralash kaliti */
export type CrudListQuery = ListQueryDto & { sort?: string }

/** Noyob maydon: yozishdan oldin tekshiriladi (aniq maydonli 409 uchun) */
export interface UniqueRule {
  /** Prisma maydoni (bazaga yoziladigan `data` dagi nomi) */
  field: string
  /** Xato kodi — sukut `ALREADY_EXISTS` */
  code?: ErrorCodeName
  /** Noyoblik faqat o'chirilmaganlar orasida (qisman indeks) */
  liveOnly?: boolean
}

/**
 * Prisma delegatining CRUD ishlatadigan qismi.
 *
 * Har bir model delegati o'z generik tipiga ega va ularning umumiy
 * interfeysi yo'q. Shuning uchun baza sinf shu minimal shakl bilan
 * ishlaydi; aniq tiplar (`where`, `data`, `select` → qator) voris sinfda
 * e'lon qilinadi va o'sha yerda tekshiriladi.
 */
export interface CrudDelegate<TRow> {
  findFirst(args: { where: object; select: object }): Promise<TRow | null>
  findMany(args: {
    where: object
    select: object
    orderBy: object[]
    skip: number
    take: number
  }): Promise<TRow[]>
  count(args: { where: object }): Promise<number>
  create(args: { data: object; select: object }): Promise<TRow>
  update(args: { where: object; data: object; select: object }): Promise<TRow>
}

/**
 * Prisma delegatini `CrudDelegate` ga toraytiradi. Tip chegarasi FAQAT shu
 * yerda: `TRow` voris sinfdagi `select` dan chiqariladi.
 */
export function crudDelegate<TRow>(
  delegate: Record<keyof CrudDelegate<TRow>, unknown>,
): CrudDelegate<TRow> {
  return delegate as CrudDelegate<TRow>
}

/**
 * Spravochnik resurslari uchun standart CRUD naqshi (04 §4.3):
 * ro'yxat (filtr, saralash, sahifa), bitta yozuv, yaratish, tahrirlash.
 *
 * Bir marta yoziladi — modullar faqat farq qiladigan qismini beradi:
 * `select`, javob shakli, filtrlar va DTO → baza o'girishi.
 *
 * Barcha so'rovlar `prisma.scoped` orqali: `tenantId` kengaytma tomonidan
 * qo'shiladi, bu sinf uni hech qachon qo'lda yozmaydi.
 */
export abstract class CrudService<
  TRow,
  TDto,
  TCreate,
  TUpdate,
  TQuery extends CrudListQuery,
> {
  /** Xato xabarlari uchun nom: 'Mijoz' */
  protected abstract readonly resource: string
  protected abstract readonly select: object
  protected abstract readonly sortMap: SortMap<object>
  /** Sukut saralash: `name` yoki `-createdAt` */
  protected abstract readonly defaultSort: string
  /**
   * Noyob maydonlar. Yozishdan OLDIN bitta so'rov bilan tekshiriladi: RLS
   * yoqilgan jadvalda Postgres unique xatosida kalitni yashiradi, ya'ni
   * bazadan qaysi maydon band ekanini bilib bo'lmaydi. Baza cheklovi
   * baribir oxirgi to'siq (poyga holatida — umumiy `ALREADY_EXISTS`).
   */
  protected readonly uniqueRules: readonly UniqueRule[] = []

  protected abstract delegate(): CrudDelegate<TRow>
  protected abstract toDto(row: TRow): TDto
  /** Resursga xos filtrlar (`q`, `status` ...) */
  protected abstract filters(query: TQuery): object
  protected abstract createData(dto: TCreate): object | Promise<object>
  protected abstract updateData(dto: TUpdate): object | Promise<object>

  /** Har bir o'qishdagi asosiy shart (yumshoq o'chirishda — o'chirilmaganlar) */
  protected liveWhere(): object {
    return {}
  }

  /**
   * Sahifa va jami soni PARALLEL: ikki so'rov, byudjet — 2 (10 §10.1).
   * Ikkalasi bitta `where` bilan quriladi, ya'ni filtr ular orasida
   * ajralib qolmaydi.
   */
  async list(query: TQuery): Promise<Paged<TDto>> {
    const where = { ...this.liveWhere(), ...this.filters(query) }
    const [rows, total] = await Promise.all([
      this.delegate().findMany({
        where,
        select: this.select,
        orderBy: orderByOf(query.sort, this.sortMap, this.defaultSort),
        ...pageArgs(query),
      }),
      this.delegate().count({ where }),
    ])
    return toPaged(
      rows.map((row) => this.toDto(row)),
      total,
      query,
    )
  }

  async get(id: string): Promise<TDto> {
    const row = await this.delegate().findFirst({
      where: { ...this.liveWhere(), id },
      select: this.select,
    })
    if (!row) throw new NotFoundError(this.resource, id)
    return this.toDto(row)
  }

  async create(dto: TCreate): Promise<TDto> {
    const data = await this.createData(dto)
    await this.assertUnique(data)
    const row = await this.delegate()
      .create({ data, select: this.select })
      .catch(this.rethrow())
    return this.toDto(row)
  }

  /**
   * Bitta `UPDATE … RETURNING`: yo'q (yoki boshqa tenantniki) bo'lsa — 404.
   * `version` (`If-Match`, 04 §4.4) berilsa — faqat shu versiyadagi yozuv
   * yangilanadi, aks holda 409 `VERSION_CONFLICT` joriy holat bilan.
   */
  async update(id: string, dto: TUpdate, version?: Date): Promise<TDto> {
    const data = await this.updateData(dto)
    await this.assertUnique(data, id)
    const row = await this.delegate()
      .update({ where: { ...this.liveWhere(), id, ...this.versionWhere(version) }, data, select: this.select })
      .catch(this.staleOr404(id, version))
    return this.toDto(row)
  }

  /**
   * Versiya sharti. Mijoz qiymatni JSON'dan oladi (millisekund), bazada esa
   * mikrosekund bo'lishi mumkin — shuning uchun o'sha millisekund oralig'i.
   */
  protected versionWhere(version?: Date): object {
    return version ? { updatedAt: { gte: version, lt: new Date(version.getTime() + 1) } } : {}
  }

  /** `UPDATE` hech narsa topmadi: yozuv bor — versiya eskirgan (409 + joriy holat), yo'q — 404 */
  protected staleOr404(id: string, version?: Date): (err: unknown) => Promise<never> {
    return async (err) => {
      if (version && isRecordNotFound(err)) {
        const current = await this.delegate().findFirst({ where: { ...this.liveWhere(), id }, select: this.select })
        if (current) throw new VersionConflictError(this.toDto(current))
      }
      return this.rethrow(id)(err)
    }
  }

  /**
   * `data` dagi noyob qiymatlar boshqa yozuvda bormi — BITTA so'rov.
   * `excludeId` — tahrirlanayotgan yozuvning o'zi hisobga olinmaydi.
   */
  protected async assertUnique(data: object, excludeId?: string): Promise<void> {
    const values = data as Record<string, unknown>
    const rules = this.uniqueRules.filter(
      (r) => values[r.field] !== undefined && values[r.field] !== null,
    )
    if (rules.length === 0) return

    // Tanlov (`select`) boshqa — natija qator emas, faqat noyob maydonlar
    const clash = (await this.delegate().findFirst({
      where: {
        OR: rules.map((r) => ({ [r.field]: values[r.field], ...(r.liveOnly && { deletedAt: null }) })),
        ...(excludeId && { NOT: { id: excludeId } }),
      },
      select: Object.fromEntries(rules.map((r) => [r.field, true])),
    })) as Record<string, unknown> | null
    if (!clash) return

    const rule = rules.find((r) => clash[r.field] === values[r.field]) ?? rules[0]!
    const code = rule.code ?? 'ALREADY_EXISTS'
    throw new DomainError(code, `${this.resource}: «${rule.field}» qiymati band`, [
      { field: rule.field, code },
    ])
  }

  protected rethrow(id?: string): (err: unknown) => never {
    const unique = Object.fromEntries(
      this.uniqueRules.map((r) => [r.field, r.code ?? 'ALREADY_EXISTS'] as const),
    )
    return (err) => rethrowAsDomain(err, { resource: this.resource, id, unique })
  }
}

/**
 * Yumshoq o'chirishli resurs: `DELETE` → `deletedAt`, `restore` → undo.
 *
 * Yozuv jismonan o'chirilmaydi: cheklar, harakatlar va audit unga havola
 * qiladi — tarix buzilmasligi kerak.
 */
export abstract class SoftDeleteCrudService<
  TRow,
  TDto,
  TCreate,
  TUpdate,
  TQuery extends CrudListQuery,
> extends CrudService<TRow, TDto, TCreate, TUpdate, TQuery> {
  protected override liveWhere(): object {
    return { deletedAt: null }
  }

  /** O'chirishdan oldingi biznes tekshiruvi (qarz, ochiq buyurtma ...) */
  protected async assertDeletable(_id: string): Promise<void> {}

  async remove(id: string): Promise<void> {
    await this.assertDeletable(id)
    await this.delegate()
      .update({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
        select: this.select,
      })
      .catch(this.rethrow(id))
  }

  /**
   * Idempotent: o'chirilmagan yozuvni tiklash ham uni qaytaradi. Faqat
   * tiriklar orasida noyob maydonlar (shtrix-kod) tiklashdan oldin
   * tekshiriladi — o'chirilganda uning qiymatini boshqasi olgan bo'lishi mumkin.
   */
  async restore(id: string): Promise<TDto> {
    await this.assertRestorable(id)
    const row = await this.delegate()
      .update({ where: { id }, data: { deletedAt: null }, select: this.select })
      .catch(this.rethrow(id))
    return this.toDto(row)
  }

  private async assertRestorable(id: string): Promise<void> {
    const live = this.uniqueRules.filter((r) => r.liveOnly)
    if (live.length === 0) return
    const current = (await this.delegate().findFirst({
      where: { id },
      select: Object.fromEntries(live.map((r) => [r.field, true])),
    })) as Record<string, unknown> | null
    if (current) await this.assertUnique(current, id)
  }
}
