import type { Role } from './types'

/** Tizim resurslari (bo'limlar) */
export type Resource =
  | 'products'
  | 'sales'
  | 'suppliers'
  | 'customers'
  | 'employees'
  | 'settings'
  | 'expenses'
  | 'finance' // kassa, qarzlar, hisobotlar
  | 'users' // foydalanuvchilar boshqaruvi
  | 'deliveries' // yetkazib berish
  | 'quotes' // takliflar / smeta

/** Resurs ustidagi amallar */
export type Action = 'view' | 'create' | 'edit' | 'delete'

const ALL: Action[] = ['view', 'create', 'edit', 'delete']
const VIEW: Action[] = ['view']
const NO_DELETE: Action[] = ['view', 'create', 'edit']

/**
 * Rol → resurs → ruxsat etilgan amallar.
 * admin barcha narsaga ega (matritsada alohida hisoblanadi).
 */
const matrix: Record<Role, Partial<Record<Resource, Action[]>>> = {
  admin: {
    products: ALL,
    sales: ALL,
    suppliers: ALL,
    customers: ALL,
    employees: ALL,
    settings: ALL,
    expenses: ALL,
    finance: ALL,
    users: ALL,
    deliveries: ALL,
    quotes: ALL,
  },
  manager: {
    products: ALL,
    sales: ALL,
    suppliers: ALL,
    customers: ALL,
    employees: NO_DELETE,
    settings: ALL,
    expenses: ALL,
    finance: ALL,
    deliveries: ALL,
    quotes: ALL,
  },
  // Sotuvchi / kassir — savdo qiladi, mijoz qo'shadi, kassa/qarz bilan ishlaydi
  sotuvchi: {
    products: VIEW,
    sales: NO_DELETE,
    customers: ALL,
    suppliers: VIEW,
    finance: NO_DELETE, // kassa smenasi, qarz to'lovi, hisobotlar
    deliveries: NO_DELETE,
    quotes: NO_DELETE,
  },
  // Omborchi — mahsulot va kirim/ombor bilan ishlaydi
  omborchi: {
    products: ALL,
    suppliers: ALL,
    sales: VIEW,
    customers: VIEW,
    deliveries: VIEW,
  },
}

/** Rolning resurs ustida amalni bajarishga ruxsati bormi? */
export function hasPermission(
  role: Role,
  resource: Resource,
  action: Action,
): boolean {
  if (role === 'admin') return true
  return matrix[role]?.[resource]?.includes(action) ?? false
}
