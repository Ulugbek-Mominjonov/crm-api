import { Prisma } from '@prisma/client'
import { DomainError, NotFoundError } from '@/common/errors/domain.error'
import type { ErrorCodeName } from '@/common/errors/error-catalog'

export interface PrismaErrorContext {
  /** Xato xabari uchun resurs nomi: 'Mijoz' */
  resource: string
  id?: string
  /** Noyob ustun → maxsus kod (sukut: `ALREADY_EXISTS`). Masalan `{ sku: 'DUPLICATE_SKU' }` */
  unique?: Readonly<Record<string, ErrorCodeName>>
}

/**
 * Prisma xatosini domen xatosiga o'giradi; boshqa xatoni o'zgartirmay
 * qayta tashlaydi.
 *
 * Baza cheklovi — oxirgi va poyga holatiga (race) chidamli to'siq: servis
 * oldindan so'rov bilan tekshirmaydi, cheklov buzilsa shu yerda aniq xatoga
 * aylantiriladi. Ichki kod (`P2002`) mijozga hech qachon chiqmaydi (12 §12.3).
 */
export function rethrowAsDomain(err: unknown, ctx: PrismaErrorContext): never {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) throw err

  switch (err.code) {
    // Yangilanadigan yozuv topilmadi — boshqa tenantniki ham shu yerga tushadi
    case 'P2025':
      throw new NotFoundError(ctx.resource, ctx.id)

    case 'P2002': {
      // RLS yoqilgan jadvalda Postgres xatoda kalitni YASHIRADI va Prisma
      // `target: null` beradi. Aniq maydon uchun servislar noyoblikni
      // yozishdan oldin tekshiradi; bu yer — poyga holati uchun zaxira
      const field = err.meta?.target ? uniqueField(err.meta.target) : soleField(ctx.unique)
      const code = (field && ctx.unique?.[field]) || 'ALREADY_EXISTS'
      throw new DomainError(code, `${ctx.resource}: qiymat band`, [
        { ...(field && { field }), code },
      ])
    }

    // Tashqi kalit: yo'q yoki BOSHQA tenantga tegishli yozuvga havola
    // (kompozit FK — 02 §2.3). Mavjudlik oshkor qilinmaydi.
    case 'P2003': {
      const field = referenceField(err.meta?.constraint)
      throw new DomainError('REFERENCE_NOT_FOUND', `${ctx.resource}: «${field}» topilmadi`, [
        { field, code: 'REFERENCE_NOT_FOUND' },
      ])
    }

    // Xom SQL xatosi: Postgres SQLSTATE `meta.code` da, cheklov nomi — matnda
    case 'P2010': {
      const pgCode = String(err.meta?.code ?? '')
      const message = String(err.meta?.message ?? '')
      if (pgCode === FOREIGN_KEY_VIOLATION) {
        const field = referenceField(/constraint "([^"]+)"/.exec(message)?.[1])
        throw new DomainError('REFERENCE_NOT_FOUND', `${ctx.resource}: «${field}» topilmadi`, [
          { field, code: 'REFERENCE_NOT_FOUND' },
        ])
      }
      throw err
    }

    default:
      throw err
  }
}

/** Yangilanadigan/o'chiriladigan yozuv shartga mos kelmadi (Prisma `P2025`) */
export function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
}

/** Postgres SQLSTATE: tashqi kalit buzildi */
const FOREIGN_KEY_VIOLATION = '23503'

/** Resursda bitta noyob maydon bo'lsa — xato aynan o'shaniki */
function soleField(unique?: Readonly<Record<string, ErrorCodeName>>): string | undefined {
  const fields = Object.keys(unique ?? {})
  return fields.length === 1 ? fields[0] : undefined
}

/** `['tenant_id', 'sku']` → `sku` (tenant ustuni har noyob indeksda bor) */
export function uniqueField(target: unknown): string {
  const columns = Array.isArray(target) ? target.map(String) : [String(target ?? '')]
  const own = columns.filter((c) => c !== 'tenant_id')
  return (own.length ? own : columns).map(camelCase).join(',')
}

/** `products_category_id_same_tenant` / `products_category_id_fkey` → `categoryId` */
export function referenceField(constraint: unknown): string {
  const parts = String(constraint ?? '')
    .replace(/_(fkey|same_tenant)$/, '')
    .split('_')
  // Tashqi kalit ustunlari `<nom>_id` ko'rinishida — oxirgi ikki bo'lak
  return parts.length >= 2 && parts.at(-1) === 'id'
    ? camelCase(parts.slice(-2).join('_'))
    : camelCase(parts.join('_'))
}

function camelCase(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase())
}
