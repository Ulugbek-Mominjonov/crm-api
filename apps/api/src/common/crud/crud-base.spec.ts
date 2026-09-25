import { Prisma } from '@prisma/client'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import { crudDelegate, SoftDeleteCrudService, type CrudDelegate } from './crud.service'
import type { ListQueryDto } from './list-query.dto'
import {
  decodeCursor, encodeCursor, keysetWhere, pageArgs, toCursorPage, toPaged,
} from './paging'
import { referenceField, rethrowAsDomain, uniqueField } from './prisma-errors'
import { searchWhere } from './search'
import { byField, orderByOf, sortValues, type SortMap } from './sort'

const prismaError = (code: string, meta: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('xato', { code, clientVersion: 'test', meta })

describe('CRUD bazasi — sahifalash', () => {
  it('sahifa → skip/take', () => {
    expect(pageArgs({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 })
    expect(pageArgs({ page: 3, pageSize: 50 })).toEqual({ skip: 100, take: 50 })
  })

  it('javob shakli va sahifalar soni (04 §4.1)', () => {
    expect(toPaged(['a'], 137, { page: 2, pageSize: 20 })).toEqual({
      items: ['a'], page: 2, pageSize: 20, total: 137, pageCount: 7,
    })
    expect(toPaged([], 0, { page: 1, pageSize: 20 }).pageCount).toBe(0)
  })
})

describe('CRUD bazasi — kursorli (keyset) sahifalash', () => {
  it('kursor kodlanadi va qaytariladi', () => {
    const key = { v: '2026-08-25', id: '0190a7a0-0000-7000-8000-000000000001' }
    expect(decodeCursor(encodeCursor(key))).toEqual(key)
  })

  it('buzilgan yoki soxta kursor — 400 VALIDATION_FAILED', () => {
    for (const raw of ['emas', encodeCursor({ v: 'x', id: '' }), Buffer.from('[1]').toString('base64url')]) {
      expect(() => decodeCursor(raw)).toThrow(DomainError)
    }
  })

  it('kursordan keyingi qatorlar sharti: qiymat, teng bo‘lsa — id', () => {
    expect(keysetWhere('date', 'desc', '2026-08-25', 'x')).toEqual({
      OR: [{ date: { lt: '2026-08-25' } }, { date: '2026-08-25', id: { lt: 'x' } }],
    })
    expect(keysetWhere('name', 'asc', 'B', 'y')).toEqual({
      OR: [{ name: { gt: 'B' } }, { name: 'B', id: { gt: 'y' } }],
    })
  })

  it('ortiqcha qator keyingi sahifa borligini bildiradi (COUNT kerak emas)', () => {
    const rows = [{ id: '1' }, { id: '2' }, { id: '3' }]
    const page = toCursorPage(rows, 2, (r) => ({ v: r.id, id: r.id }))
    expect(page.items).toEqual([{ id: '1' }, { id: '2' }])
    expect(page.hasMore).toBe(true)
    expect(decodeCursor(page.nextCursor!)).toEqual({ v: '2', id: '2' })

    expect(toCursorPage(rows, 3, (r) => ({ v: r.id, id: r.id }))).toMatchObject({ hasMore: false, nextCursor: null })
  })
})

describe('CRUD bazasi — saralash va qidiruv', () => {
  const SORT: SortMap<object> = { id: byField('id'), name: byField('name'), createdAt: byField('createdAt') }

  it('oq ro‘yxat qiymatlari: o‘sish va kamayish', () => {
    expect(sortValues(SORT)).toEqual(['id', '-id', 'name', '-name', 'createdAt', '-createdAt'])
  })

  it('saralashga doim `id` qo‘shiladi — tartib barqaror', () => {
    expect(orderByOf('-createdAt', SORT, 'name')).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    expect(orderByOf(undefined, SORT, 'name')).toEqual([{ name: 'asc' }, { id: 'asc' }])
    // Ro'yxatda yo'q kalit — sukut tartib (DTO baribir rad etadi)
    expect(orderByOf('-cost', SORT, '-createdAt')).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
  })

  it('qidiruv sharti: bo‘sh `q` — shart yo‘q', () => {
    expect(searchWhere(undefined, ['name'])).toEqual({})
    expect(searchWhere('', ['name'])).toEqual({})
    expect(searchWhere('sem', ['name', 'sku'])).toEqual({
      OR: [
        { name: { contains: 'sem', mode: 'insensitive' } },
        { sku: { contains: 'sem', mode: 'insensitive' } },
      ],
    })
  })
})

describe('CRUD bazasi — Prisma xatolari', () => {
  const ctx = { resource: 'Mahsulot', id: 'p1', unique: { sku: 'DUPLICATE_SKU' as const } }

  it('P2025 → 404 (boshqa tenant yozuvi ham)', () => {
    expect(() => rethrowAsDomain(prismaError('P2025', {}), ctx)).toThrow(NotFoundError)
  })

  it('P2002 → maxsus yoki umumiy kod, maydon nomi bilan', () => {
    const sku = captureDomain(() => rethrowAsDomain(prismaError('P2002', { target: ['tenant_id', 'sku'] }), ctx))
    expect(sku).toMatchObject({ code: 'DUPLICATE_SKU', status: 409, errors: [{ field: 'sku' }] })

    const barcode = captureDomain(() => rethrowAsDomain(prismaError('P2002', { target: ['tenant_id', 'barcode'] }), ctx))
    expect(barcode).toMatchObject({ code: 'ALREADY_EXISTS', errors: [{ field: 'barcode' }] })
  })

  it('P2003 → 422 REFERENCE_NOT_FOUND (mavjudlik oshkor qilinmaydi)', () => {
    const err = captureDomain(() =>
      rethrowAsDomain(prismaError('P2003', { constraint: 'products_category_id_same_tenant' }), ctx),
    )
    expect(err).toMatchObject({ code: 'REFERENCE_NOT_FOUND', status: 422, errors: [{ field: 'categoryId' }] })
  })

  it('RLS ostida P2002 maydonsiz keladi: yagona noyob maydon bo‘lsa — o‘sha, aks holda umumiy', () => {
    const single = captureDomain(() =>
      rethrowAsDomain(prismaError('P2002', { target: null }), { resource: 'Ombor', unique: { name: 'ALREADY_EXISTS' } }),
    )
    expect(single).toMatchObject({ code: 'ALREADY_EXISTS', errors: [{ field: 'name' }] })

    const twoFields = { resource: 'Mahsulot', unique: { sku: 'DUPLICATE_SKU' as const, barcode: 'ALREADY_EXISTS' as const } }
    const ambiguous = captureDomain(() => rethrowAsDomain(prismaError('P2002', { target: null }), twoFields))
    expect(ambiguous.code).toBe('ALREADY_EXISTS')
    expect(ambiguous.errors?.[0]?.field).toBeUndefined()
  })

  it('boshqa xato o‘zgarmay qaytadi', () => {
    const boom = new Error('boshqa')
    expect(() => rethrowAsDomain(boom, ctx)).toThrow(boom)
    const other = prismaError('P2034', {})
    expect(() => rethrowAsDomain(other, ctx)).toThrow(other)
  })

  it('ustun va cheklov nomlaridan maydon nomi', () => {
    expect(uniqueField(['tenant_id', 'employee_id'])).toBe('employeeId')
    expect(uniqueField(['email'])).toBe('email')
    expect(referenceField('product_stocks_warehouse_id_fkey')).toBe('warehouseId')
    expect(referenceField('users_employee_id_same_tenant')).toBe('employeeId')
  })
})

// ───────────────────────────────────────────── baza sinf (orkestratsiya)

interface Row {
  id: string
  name: string
  deletedAt: Date | null
}
interface Query extends ListQueryDto {
  sort?: string
  name?: string
}

/**
 * Xotiradagi delegat — faqat baza sinf qanday ARGUMENTLAR bilan
 * chaqirishini tekshirish uchun. Haqiqiy baza bilan xatti-harakat
 * resurs e2e testlarida (tranzaksiya va cheklovlar mock'da tekshirilmaydi).
 */
function fakeDelegate(rows: Row[]) {
  const calls: { op: string; args: Record<string, unknown> }[] = []
  // `where` — tenglik shartlari (id, deletedAt: null, filtr) + OR/NOT
  const matches = (row: Row, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return (value as Record<string, unknown>[]).some((w) => matches(row, w))
      if (key === 'NOT') return !matches(row, value as Record<string, unknown>)
      return row[key as keyof Row] === value
    })
  const delegate = {
    findFirst: async (args: { where: Record<string, unknown> }) => {
      calls.push({ op: 'findFirst', args })
      return rows.find((r) => matches(r, args.where)) ?? null
    },
    findMany: async (args: { where: Record<string, unknown>; skip: number; take: number }) => {
      calls.push({ op: 'findMany', args })
      return rows.filter((r) => matches(r, args.where)).slice(args.skip, args.skip + args.take)
    },
    count: async (args: { where: Record<string, unknown> }) => {
      calls.push({ op: 'count', args })
      return rows.filter((r) => matches(r, args.where)).length
    },
    create: async (args: { data: { name: string } }) => {
      calls.push({ op: 'create', args })
      return { id: 'new', name: args.data.name, deletedAt: null }
    },
    update: async (args: { where: Record<string, unknown>; data: Partial<Row> }) => {
      calls.push({ op: 'update', args })
      const row = rows.find((r) => matches(r, args.where))
      if (!row) throw prismaError('P2025', {})
      Object.assign(row, args.data)
      return row
    },
  }
  return { delegate: crudDelegate<Row>(delegate), calls }
}

class Service extends SoftDeleteCrudService<Row, { id: string; name: string }, { name: string }, { name?: string }, Query> {
  protected readonly resource = 'Sinov'
  protected override readonly uniqueRules = [{ field: 'name' }]
  protected readonly select = { id: true, name: true }
  protected readonly sortMap = { id: byField('id'), name: byField('name') }
  protected readonly defaultSort = 'name'
  deletable = true

  constructor(private readonly fake: CrudDelegate<Row>) {
    super()
  }

  protected delegate(): CrudDelegate<Row> {
    return this.fake
  }
  protected toDto(row: Row) {
    return { id: row.id, name: row.name }
  }
  protected filters(query: Query) {
    return query.name ? { name: query.name } : {}
  }
  protected createData(dto: { name: string }) {
    return { name: dto.name }
  }
  protected updateData(dto: { name?: string }) {
    return { name: dto.name }
  }
  protected override async assertDeletable(): Promise<void> {
    if (!this.deletable) throw new DomainError('CATEGORY_IN_USE')
  }
}

describe('CRUD bazasi — servis', () => {
  const rows = (): Row[] => [
    { id: 'a', name: 'A', deletedAt: null },
    { id: 'b', name: 'B', deletedAt: null },
    { id: 'z', name: 'Z', deletedAt: new Date('2026-01-01') },
  ]

  it('ro‘yxat: o‘chirilganlar yo‘q, filtr + saralash + sahifa bitta `where` bilan', async () => {
    const { delegate, calls } = fakeDelegate(rows())
    const page = await new Service(delegate).list({ page: 1, pageSize: 1, sort: '-name', name: 'A' })

    expect(page).toMatchObject({ total: 1, pageCount: 1, items: [{ id: 'a' }] })
    const findMany = calls.find((c) => c.op === 'findMany')!.args
    expect(findMany).toMatchObject({
      where: { deletedAt: null, name: 'A' },
      orderBy: [{ name: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 1,
    })
    expect(calls.find((c) => c.op === 'count')!.args.where).toEqual(findMany.where)
  })

  it('bitta yozuv: yo‘q yoki o‘chirilgan — 404', async () => {
    const { delegate } = fakeDelegate(rows())
    const service = new Service(delegate)
    await expect(service.get('a')).resolves.toEqual({ id: 'a', name: 'A' })
    await expect(service.get('z')).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.get('yoq')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('yaratish: ma’lumot `createData` dan, javob `toDto` orqali (bazadagi shakl chiqmaydi)', async () => {
    const { delegate, calls } = fakeDelegate(rows())
    await expect(new Service(delegate).create({ name: 'Yangi' })).resolves.toEqual({ id: 'new', name: 'Yangi' })
    expect(calls.find((c) => c.op === 'create')!.args).toEqual({
      data: { name: 'Yangi' },
      select: { id: true, name: true },
    })
  })

  it('noyob maydon yozishdan OLDIN tekshiriladi — aniq maydon bilan 409', async () => {
    const { delegate, calls } = fakeDelegate(rows())
    const service = new Service(delegate)

    await expect(service.create({ name: 'A' })).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
      errors: [{ field: 'name' }],
    })
    expect(calls.some((c) => c.op === 'create')).toBe(false)
    // O'chirilgan yozuvning nomi ham band (noyoblik o'chirilganlarni ham qamraydi)
    await expect(service.create({ name: 'Z' })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' })
    // O'zining nomini qayta yuborish — xato emas
    await expect(service.update('a', { name: 'A' })).resolves.toEqual({ id: 'a', name: 'A' })
    await expect(service.update('a', { name: 'B' })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' })
  })

  it('tahrirlash o‘chirilgan yozuvga tegmaydi (404)', async () => {
    const { delegate } = fakeDelegate(rows())
    const service = new Service(delegate)
    await expect(service.update('a', { name: 'A2' })).resolves.toEqual({ id: 'a', name: 'A2' })
    await expect(service.update('z', { name: 'Z2' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('yumshoq o‘chirish → tiklash (undo); takroriy o‘chirish — 404', async () => {
    const data = rows()
    const { delegate } = fakeDelegate(data)
    const service = new Service(delegate)

    await service.remove('a')
    expect(data[0]!.deletedAt).toBeInstanceOf(Date)
    await expect(service.remove('a')).rejects.toBeInstanceOf(NotFoundError)

    await expect(service.restore('a')).resolves.toEqual({ id: 'a', name: 'A' })
    expect(data[0]!.deletedAt).toBeNull()
  })

  it('biznes tekshiruvi o‘chirishdan OLDIN — yozuv o‘zgarmaydi', async () => {
    const data = rows()
    const { delegate, calls } = fakeDelegate(data)
    const service = new Service(delegate)
    service.deletable = false

    await expect(service.remove('a')).rejects.toMatchObject({ code: 'CATEGORY_IN_USE' })
    expect(calls.some((c) => c.op === 'update')).toBe(false)
    expect(data[0]!.deletedAt).toBeNull()
  })
})

function captureDomain(fn: () => unknown): DomainError {
  try {
    fn()
  } catch (err) {
    if (err instanceof DomainError) return err
    throw err
  }
  throw new Error('xato kutilgan edi')
}
