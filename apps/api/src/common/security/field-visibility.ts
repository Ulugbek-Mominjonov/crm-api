import type { Role } from '@prisma/client'

/**
 * Rolga ko'ra yashiriladigan maydonlar.
 *
 * Muammo: sotuvchi katalogni ko'radi, lekin TANNARX unga ko'rinmasligi
 * kerak. UI da yashirish yetarli emas — u so'rovni to'g'ridan-to'g'ri
 * yuborishi mumkin. Shuning uchun maydon JAVOBDAN olib tashlanadi.
 *
 * Manba: backend-tz/core/03-security.md §3.6
 */
const HIDDEN_BY_ROLE: Partial<Record<Role, readonly string[]>> = {
  sotuvchi: [
    'cost',        // tannarx
    'unitCost',
    'stockValue',  // ombor qiymati tannarxda
    'stockValueByCategory',
    'deadValue',   // sotilmayotgan tovar qiymati — tannarxda
    'wholesalePrice',
    'salary',
    'grossProfit',
    'netProfit', // = yalpi foyda − xarajat: undan yalpi foyda tiklanadi
    'profit',
    'cogs',
    'margin',
    'payables', // ta'minotchilarga qarz — xarid summasi (canSeePurchaseAmounts)
  ],
  omborchi: ['salary', 'grossProfit', 'netProfit', 'profit', 'cogs', 'margin'],
}

/** Hech qachon javobga chiqmaydigan maydonlar — roldan qat'i nazar */
const ALWAYS_HIDDEN = ['passwordHash', 'tokenHash', 'bodyHash'] as const

/** Do'kon sozlamasiga bog'liq ko'rinish (sukut — eng qattiq) */
export interface VisibilityPolicy {
  /** Sotuvchi ulgurji narxda sota oladi — demak ulgurji narxni ham ko'radi */
  sellerWholesale?: boolean
}

/** Siyosat do'kon sozlamasidan: ulgurji savdo yoqilgan VA sotuvchiga ochilgan */
export function visibilityPolicy(settings: {
  wholesaleEnabled: boolean
  sellerWholesaleEnabled: boolean
}): VisibilityPolicy {
  return { sellerWholesale: settings.wholesaleEnabled && settings.sellerWholesaleEnabled }
}

/** Shu rol uchun yashiriladigan maydonlar to'plami */
export function hiddenFieldsFor(role: Role, policy: VisibilityPolicy = {}): Set<string> {
  const hidden = new Set<string>([...ALWAYS_HIDDEN, ...(HIDDEN_BY_ROLE[role] ?? [])])
  if (policy.sellerWholesale) hidden.delete('wholesalePrice')
  return hidden
}

/** Rolga maydon ko'rinadimi? */
export function canSeeField(role: Role, field: string, policy?: VisibilityPolicy): boolean {
  return !hiddenFieldsFor(role, policy).has(field)
}

/**
 * Xarid pullari — kirim buyurtmasi summalari, ta'minotchi qarzi va unga
 * to'lovlar: bitta qatorli buyurtmada summa ÷ miqdor = tannarx. Kalit
 * nomlari (`total`, `paid`, `outstanding`, `debt`) sotuv va mijoz qarzida
 * ham bor, shuning uchun ular global ro'yxatda emas — xarid javobini
 * yasovchi servis shu qoidaga qarab ularni qo'shmaydi.
 */
export function canSeePurchaseAmounts(role: Role): boolean {
  return canSeeField(role, 'cost')
}

/**
 * Javobdan yashirin maydonlarni rekursiv olib tashlaydi.
 *
 * Chuqurlik cheklangan: aylanma havolada osilib qolmaslik uchun va
 * chuqur ichma-ich javoblar baribir bo'lmasligi kerak.
 */
export function stripHidden<T>(value: T, hidden: Set<string>, depth = 6): T {
  if (hidden.size === 0 || depth <= 0 || value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripHidden(v, hidden, depth - 1)) as unknown as T
  }
  // Faqat oddiy obyekt: sana, Buffer, fayl oqimi (`StreamableFile`) o'zgarmaydi
  const proto: unknown = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return value
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (hidden.has(key)) continue
    out[key] = stripHidden(v, hidden, depth - 1)
  }
  return out as T
}
