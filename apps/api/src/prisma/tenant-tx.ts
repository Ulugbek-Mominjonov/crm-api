import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Joriy tenant tranzaksiyasi (so'rov yoki fon ishi davomida).
 *
 * RLS (3-qatlam) `app.tenant_id` ni faqat tranzaksiya ichida ko'radi:
 * ulanishlar puli ulashiladi, `SET LOCAL` tranzaksiya bilan tugaydi. Shuning
 * uchun tenant ma'lumotiga har murojaat SHU tranzaksiya orqali o'tadi.
 *
 * `tx` bu yerda `unknown`: aniq tip (`TenantTx`) Prisma mijozidan chiqariladi,
 * u esa tenant kengaytmasiga bog'liq — kengaytma ham shu modulni o'qiydi.
 * Tip aylanib qolmasligi uchun toraytirish faqat `PrismaService` da.
 */
export interface TenantTxState {
  tenantId: string
  tx: unknown
  /** COMMIT muvaffaqiyatli bo'lgandan KEYIN bajariladigan amallar (`onCommit`) */
  afterCommit: AfterCommitHook[]
}

export type AfterCommitHook = () => void | Promise<void>

const storage = new AsyncLocalStorage<TenantTxState>()

export function currentTenantTx(): TenantTxState | undefined {
  return storage.getStore()
}

/** Joriy tenant tranzaksiyasi; yo'q bo'lsa — dasturchi xatosi (pastga qarang) */
export function requireTenantTx(): TenantTxState {
  const state = storage.getStore()
  if (!state) throw new MissingTenantTransactionError()
  return state
}

export function runInTenantTx<T>(state: TenantTxState, fn: () => T): T {
  return storage.run(state, fn)
}

/**
 * Tranzaksiya COMMIT bo'lgandan keyin — realtime hodisa, navbatga ish.
 * Tranzaksiya bekor bo'lsa hech narsa bajarilmaydi: mijoz yoki ishchi
 * saqlanmagan ma'lumot haqida xabar olmaydi. Ichma-ich chaqiruvda eng
 * tashqi tranzaksiya tugashi kutiladi.
 */
export function onCommit(hook: AfterCommitHook): void {
  requireTenantTx().afterCommit.push(hook)
}

/**
 * Tenant ma'lumotiga tranzaksiyasiz murojaat — dasturchi xatosi.
 *
 * Jimgina davom etilmaydi: production'da (`crm_app` roli) bunday so'rov
 * RLS tufayli BO'SH natija qaytarardi va xato sezilmay qolardi.
 */
export class MissingTenantTransactionError extends Error {
  constructor() {
    super(
      'Tenant tranzaksiyasi yo‘q: so‘rov tashqarisida `prisma.inTenantTransaction()` ' +
        'ishlating (HTTP so‘rovida u avtomatik ochiladi).',
    )
    this.name = 'MissingTenantTransactionError'
  }
}
