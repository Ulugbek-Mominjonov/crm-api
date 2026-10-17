import type { Role } from './types'

/**
 * Ruxsatlar katalogi (T-134): bo'lim (modul) → amallar. Ruxsat — `bo'lim.amal`
 * satri (`sales.return`). Do'kon roliga shu ro'yxatdan tanlab beriladi;
 * server endpointni, mijoz menyu va tugmani AYNI kalit bilan tekshiradi.
 *
 * Tartib — rol tahrirlash oynasidagi tartib. Nomlar — mijozdagi tarjima
 * yo'q bo'lsa ko'rsatiladigan o'zbekcha matn.
 */
const CATALOG = {
  sales: {
    group: 'sales',
    label: 'Sotuvlar',
    actions: {
      view: 'Sotuvlar tarixi va cheklar',
      create: 'Sotish (kassa)',
      return: 'Qaytarish',
      cancel: 'Chekni bekor qilish',
      belowCost: 'Minimal narxdan (tannarx + marja) past sotish',
    },
  },
  quotes: {
    group: 'sales',
    label: 'Takliflar (smeta)',
    actions: { view: 'Ko‘rish', create: 'Yaratish', edit: 'Tahrirlash', delete: 'O‘chirish' },
  },
  deliveries: {
    group: 'sales',
    label: 'Yetkazib berish',
    actions: { view: 'Ko‘rish (haydovchi — o‘ziga biriktirilganlar holati)', create: 'Yaratish', edit: 'Tahrirlash va istalganining holati', delete: 'O‘chirish' },
  },
  products: {
    group: 'stock',
    label: 'Mahsulotlar',
    actions: { view: 'Katalog, qoldiq va omborlar ro‘yxati', create: 'Qo‘shish va import', edit: 'Tahrirlash va narxlar', delete: 'Arxivlash' },
  },
  stock: {
    group: 'stock',
    label: 'Ombor',
    actions: { view: 'Harakatlar jurnali va buyurtma tavsiyasi', operate: 'Kirim, hisobdan chiqarish, inventarizatsiya, ko‘chirish', manage: 'Ombor qo‘shish, tahrirlash, arxivlash' },
  },
  purchases: {
    group: 'stock',
    label: 'Xaridlar (kirim buyurtmalari)',
    actions: { view: 'Ko‘rish', create: 'Yaratish', edit: 'Tahrirlash va bekor qilish', receive: 'Qabul qilish (omborga kirim)', pay: 'Ta’minotchiga to‘lash', delete: 'O‘chirish' },
  },
  suppliers: {
    group: 'stock',
    label: 'Ta’minotchilar',
    actions: { view: 'Ko‘rish', create: 'Qo‘shish', edit: 'Tahrirlash', delete: 'O‘chirish' },
  },
  cash: {
    group: 'finance',
    label: 'Kassa',
    actions: { view: 'Smenalar va kassa harakatlari', operate: 'Smena ochish/yopish, naqd kirim-chiqim' },
  },
  debts: {
    group: 'finance',
    label: 'Qarzlar',
    actions: { view: 'Mijozlar qarzi va to‘lovlari', collect: 'Qarz to‘lovini qabul qilish' },
  },
  expenses: {
    group: 'finance',
    label: 'Xarajatlar',
    actions: { view: 'Ko‘rish', create: 'Qo‘shish', edit: 'Tahrirlash', delete: 'O‘chirish' },
  },
  reports: {
    group: 'finance',
    label: 'Hisobotlar',
    actions: { view: 'Boshqaruv paneli, hisobotlar va tahlil' },
  },
  customers: {
    group: 'customers',
    label: 'Mijozlar',
    actions: { view: 'Ko‘rish', create: 'Qo‘shish', edit: 'Tahrirlash va Telegram’ga ulash', delete: 'O‘chirish' },
  },
  messages: {
    group: 'customers',
    label: 'Xabarlar (SMS, Telegram)',
    actions: { view: 'Yuborilganlar jurnali', send: 'Yuborish' },
  },
  employees: {
    group: 'admin',
    label: 'Xodimlar',
    actions: { view: 'Ko‘rish', create: 'Qo‘shish', edit: 'Tahrirlash', delete: 'O‘chirish' },
  },
  users: {
    group: 'admin',
    label: 'Foydalanuvchilar (kirish hisoblari)',
    actions: { view: 'Ko‘rish', create: 'Qo‘shish', edit: 'Tahrirlash, rol berish, parolni tiklash', delete: 'O‘chirish' },
  },
  roles: {
    group: 'admin',
    label: 'Rollar va ruxsatlar',
    actions: { view: 'Ko‘rish', create: 'Yaratish', edit: 'Ruxsat berish va olib tashlash, nomini o‘zgartirish', delete: 'O‘chirish' },
  },
  audit: {
    group: 'admin',
    label: 'Amallar jurnali',
    actions: { view: 'Ko‘rish' },
  },
  settings: {
    group: 'admin',
    label: 'Sozlamalar',
    actions: { view: 'Fayl saqlash hajmi', edit: 'O‘zgartirish (brend, chek, QQS …)' },
  },
  cost: {
    group: 'data',
    label: 'Tannarx',
    actions: { view: 'Tannarx, ombor qiymati, xarid summalari, ta’minotchi qarzi' },
  },
  wholesale: {
    group: 'data',
    label: 'Ulgurji narx',
    actions: { view: 'Ulgurji narxni ko‘rish va shu narxda sotish' },
  },
  profit: {
    group: 'data',
    label: 'Foyda',
    actions: { view: 'Yalpi va sof foyda, marja (tannarxsiz bo‘lmaydi)' },
  },
  salary: {
    group: 'data',
    label: 'Maosh',
    actions: { view: 'Xodimlar maoshi' },
  },
} as const satisfies Record<string, ResourceSpec>

interface ResourceSpec {
  group: PermissionGroup
  label: string
  /** `view` — doim bor: bo'limning boshqa amali uni nazarda tutadi */
  actions: { view: string } & Record<string, string>
}

/** Rol tahrirlash oynasidagi guruhlar (tartib bilan) */
export const PERMISSION_GROUPS = {
  sales: 'Savdo',
  stock: 'Ombor',
  finance: 'Moliya',
  customers: 'Mijozlar',
  admin: 'Boshqaruv',
  data: 'Maxfiy ma’lumotlar',
} as const

export type PermissionGroup = keyof typeof PERMISSION_GROUPS

/** Tizim resurslari (bo'limlar) */
export type Resource = keyof typeof CATALOG

/** Bo'limdagi amallar */
export type ActionOf<R extends Resource> = keyof (typeof CATALOG)[R]['actions'] & string

/** Har qanday bo'limdagi amal */
export type Action = { [R in Resource]: ActionOf<R> }[Resource]

/** Ruxsat kaliti: `products.edit` */
export type Permission = { [R in Resource]: `${R}.${ActionOf<R>}` }[Resource]

/** Rolning ruxsatlar to'plami (administrator — barchasi) */
export type PermissionSet = ReadonlySet<Permission>

export const RESOURCES = Object.keys(CATALOG) as Resource[]

/** Barcha ruxsatlar — katalog tartibida */
export const PERMISSIONS: readonly Permission[] = RESOURCES.flatMap((resource) =>
  Object.keys(CATALOG[resource].actions).map((action) => `${resource}.${action}` as Permission),
)

const KNOWN = new Set<string>(PERMISSIONS)

export function isPermission(value: string): value is Permission {
  return KNOWN.has(value)
}

/** Katalog (mijoz rol tahrirlash oynasini shundan quradi) */
export interface CatalogResource {
  key: Resource
  group: PermissionGroup
  label: string
  actions: { key: string; permission: Permission; label: string }[]
}

export const PERMISSION_CATALOG: readonly CatalogResource[] = RESOURCES.map((key) => ({
  key,
  group: CATALOG[key].group,
  label: CATALOG[key].label,
  actions: Object.entries(CATALOG[key].actions).map(([action, label]) => ({
    key: action,
    permission: `${key}.${action}` as Permission,
    label,
  })),
}))

/** Rolning resurs ustida amalni bajarishga ruxsati bormi? */
export function hasPermission<R extends Resource>(
  permissions: PermissionSet,
  resource: R,
  action: ActionOf<R>,
): boolean {
  return permissions.has(`${resource}.${action}` as Permission)
}

/**
 * Sahifa ishlashi uchun kerak bo'lgan boshqa ruxsat: kassa katalogsiz,
 * ombor mahsulotlarsiz, xarid ta'minotchisiz, xabar mijozlarsiz ochilmaydi;
 * foydadan tannarx tiklanadi. Shunda «yarim ishlaydigan» rol bo'lmaydi.
 */
const IMPLIES: Partial<Record<Permission, readonly Permission[]>> = {
  'sales.create': ['products.view'],
  // Minimal narxdan past sotish — sotish huquqisiz ma'nosiz (T-141)
  'sales.belowCost': ['sales.create'],
  'quotes.create': ['products.view'],
  'quotes.edit': ['products.view'],
  'stock.view': ['products.view'],
  'purchases.view': ['suppliers.view', 'products.view'],
  // Xabar — mijozlarga: auditoriya tanlash va bot holati (`GET /telegram`) mijozlar bo'limida
  'messages.view': ['customers.view'],
  // Hisobga rol berish — rollar ro'yxatisiz bo'lmaydi
  'users.create': ['roles.view'],
  'users.edit': ['roles.view'],
  'profit.view': ['cost.view'],
}

/**
 * Rolga saqlanadigan ko'rinish: takrorsiz, katalog tartibida, bog'liqliklar
 * bilan — bo'limning istalgan amali uning `view` ini va `IMPLIES` dagilarni
 * qo'shadi (zanjir bo'yicha oxirigacha).
 */
export function normalizePermissions(input: Iterable<Permission>): Permission[] {
  const set = new Set<Permission>()
  const pending = [...input]
  for (let p = pending.pop(); p !== undefined; p = pending.pop()) {
    if (set.has(p)) continue
    set.add(p)
    pending.push(`${p.split('.')[0]}.view` as Permission, ...(IMPLIES[p] ?? []))
  }
  return PERMISSIONS.filter((p) => set.has(p))
}

/** Saqlangan ruxsatlar → amaldagi to'plam: administrator katalogdagi HAMMA ruxsatga ega */
export function effectivePermissions(key: Role | null, stored: readonly string[]): Permission[] {
  if (key === 'admin') return [...PERMISSIONS]
  return PERMISSIONS.filter((p) => stored.includes(p))
}

/** Sukut rollarga berilmaydigan ruxsatlar — administrator rol oynasida aniq beradi (T-141) */
const OWNER_DECIDES: readonly Permission[] = ['sales.belowCost']

const ALL_OF = (resource: Resource): Permission[] =>
  PERMISSIONS.filter((p) => p.startsWith(`${resource}.`) && !OWNER_DECIDES.includes(p))

/**
 * Tizim rollari — har do'konda yaratiladi. Ruxsatlari sukut (T-134 gacha
 * qat'iy matritsa bilan AYNI), administrator tahrirlay oladi; `admin`
 * ruxsatlari saqlanmaydi — doim hammasi.
 */
export const SYSTEM_ROLES: Readonly<Record<Role, { name: string; permissions: readonly Permission[] }>> = {
  admin: { name: 'Administrator', permissions: [] },
  manager: {
    name: 'Menejer',
    permissions: normalizePermissions([
      ...(['sales', 'quotes', 'deliveries', 'products', 'stock', 'purchases', 'suppliers'] as const).flatMap(ALL_OF),
      ...(['cash', 'debts', 'expenses', 'reports', 'customers', 'messages', 'settings'] as const).flatMap(ALL_OF),
      'employees.create', 'employees.edit',
      'cost.view', 'wholesale.view', 'profit.view', 'salary.view',
    ]),
  },
  // Sotuvchi / kassir — savdo qiladi, mijoz qo'shadi, kassa/qarz bilan ishlaydi
  sotuvchi: {
    name: 'Sotuvchi',
    permissions: normalizePermissions([
      'sales.create', 'sales.return',
      'quotes.create', 'quotes.edit',
      'deliveries.create', 'deliveries.edit',
      'products.view', 'stock.view',
      'suppliers.view', 'purchases.pay',
      'cash.operate', 'debts.collect', 'reports.view',
      ...ALL_OF('customers'), 'messages.send',
    ]),
  },
  // Omborchi — mahsulot va kirim/ombor bilan ishlaydi
  omborchi: {
    name: 'Omborchi',
    permissions: normalizePermissions([
      ...ALL_OF('products'), ...ALL_OF('stock'), ...ALL_OF('suppliers'),
      'purchases.create', 'purchases.edit', 'purchases.receive', 'purchases.delete',
      'sales.view', 'customers.view', 'messages.view', 'deliveries.view',
      'cost.view', 'wholesale.view',
    ]),
  },
}
