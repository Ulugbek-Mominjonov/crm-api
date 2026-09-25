import { AsyncLocalStorage } from 'node:async_hooks'
import { Prisma } from '@prisma/client'
import { tryContext } from '@/common/context/request-context'
import {
  CREATE_OPS, GLOBAL_MODELS, MUTATE_OPS, READ_OPS, TENANT_MODELS,
} from './tenant-models'
import { currentTenantTx } from './tenant-tx'

/**
 * Tenant izolyatsiyasining IKKINCHI qatlami (birinchisi — so'rov konteksti,
 * uchinchisi — RLS).
 *
 * Har bir so'rovga `tenantId` AVTOMATIK qo'shiladi. Dasturchi uni yozishni
 * unutsa ham ma'lumot chiqib ketmaydi — bu eng katta xavf edi
 * (backend-tz/core/01-architecture.md §1.4).
 */

/** Tizim ishlari uchun: tenant hali yo'q yoki bir nechta tenant bilan ishlanadi */
const systemStorage = new AsyncLocalStorage<true>()

/**
 * Tenant filtrisiz ishlashga ATAYLAB ruxsat beradi.
 *
 * Faqat: yangi tenant yaratish, migratsiya, cron va zaxira uchun.
 * So'rov ishlov berish yo'lida ishlatilmaydi.
 *
 * DIQQAT: Prisma so'rovlari kechiktirilgan (`PrismaPromise` faqat `.then`
 * chaqirilganda bajariladi). Shuning uchun ular SHU funksiya ichida
 * `await` qilinishi kerak — promise'ni tashqariga qaytarib, keyin kutish
 * kontekstni yo'qotadi.
 */
export async function runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
  return systemStorage.run(true, async () => fn())
}

export function isSystemScope(): boolean {
  return systemStorage.getStore() === true
}

export class MissingTenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant konteksti yo‘q: ${model}.${operation}. ` +
        'So‘rov ichida bo‘lsa — middleware ishlamagan; tizim ishi bo‘lsa — ' +
        'runAsSystem() bilan o‘rang.',
    )
    this.name = 'MissingTenantScopeError'
  }
}

export class UnknownTenantModelError extends Error {
  constructor(model: string) {
    super(
      `"${model}" modeli tenant ro‘yxatlarida yo‘q. ` +
        'Uni TENANT_MODELS yoki GLOBAL_MODELS ga qo‘shing.',
    )
    this.name = 'UnknownTenantModelError'
  }
}

type Args = Record<string, unknown>

/**
 * `data` bitta obyekt ham, massiv ham bo'lishi mumkin (createMany).
 *
 * `tenantId` OXIRIDA qo'yiladi — shunda chaqiruvchi uni ataylab yoki
 * xato bilan boshqa qiymatga o'rnatgan bo'lsa ham, kontekstdagi qiymat
 * ustun keladi. Aks holda mijozdan kelgan `tenantId` izolyatsiyani buzardi.
 */
function injectIntoData(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => ({ ...(row as Args), tenantId }))
  }
  if (data && typeof data === 'object') {
    return { ...(data as Args), tenantId }
  }
  return data
}

/**
 * `$allOperations` parametrlari.
 *
 * Prisma bu qo'l bilan yozilgan kengaytmalarda `query` ni `never` deb
 * chiqaradi (u har bir model uchun alohida tip kutadi), shuning uchun
 * shakl bu yerda aniq e'lon qilinadi.
 */
interface AllOperationsParams {
  model?: string
  operation: string
  args: unknown
  query: (args: unknown) => Promise<unknown>
}

export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-scope',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }: AllOperationsParams) {
        if (!model) return query(args)

        if (GLOBAL_MODELS.has(model)) return query(args)
        if (!TENANT_MODELS.has(model)) throw new UnknownTenantModelError(model)

        // Tizim ishi — filtr qo'shilmaydi (chaqiruvchi javobgar)
        if (isSystemScope()) return query(args)

        // Tranzaksiya tenant'i ustun: so'rovda u kontekstdagi bilan bir xil,
        // login va fon ishlarida esa (kontekstda tenant yo'q) faqat u bor
        const tenantId = currentTenantTx()?.tenantId ?? tryContext()?.tenantId
        if (!tenantId) throw new MissingTenantScopeError(model, operation)

        const next = { ...(args as Args) }

        if (READ_OPS.has(operation) || MUTATE_OPS.has(operation)) {
          // tenantId OXIRIDA: chaqiruvchi bergan qiymat uni bekor qila olmaydi
          next.where = { ...((next.where as Args) ?? {}), tenantId }
        }
        if (CREATE_OPS.has(operation)) {
          next.data = injectIntoData(next.data, tenantId)
        }
        if (operation === 'upsert') {
          next.create = injectIntoData(next.create, tenantId)
        }

        return query(next)
      },
    },
  },
})
