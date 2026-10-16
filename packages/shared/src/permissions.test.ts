import { describe, expect, it } from 'vitest'
import {
  effectivePermissions, hasPermission, isPermission, normalizePermissions, PERMISSION_CATALOG,
  PERMISSION_GROUPS, PERMISSIONS, SYSTEM_ROLES, type Permission,
} from './permissions'
import type { Role } from './types'

/**
 * T-134 gacha bo'lgan qat'iy matritsa. Tizim rollarining sukut ruxsatlari
 * aynan shu xatti-harakatni berishi kerak: mavjud do'konlarda hech kimning
 * huquqi o'zgarmaydi.
 */
type Legacy = 'products' | 'sales' | 'suppliers' | 'customers' | 'employees' | 'settings' | 'expenses' | 'finance' | 'users' | 'deliveries' | 'quotes'
type LegacyAction = 'view' | 'create' | 'edit' | 'delete'
const ALL: LegacyAction[] = ['view', 'create', 'edit', 'delete']
const VIEW: LegacyAction[] = ['view']
const NO_DELETE: LegacyAction[] = ['view', 'create', 'edit']
const LEGACY: Record<Exclude<Role, 'admin'>, Partial<Record<Legacy, LegacyAction[]>>> = {
  manager: {
    products: ALL, sales: ALL, suppliers: ALL, customers: ALL, employees: NO_DELETE, settings: ALL,
    expenses: ALL, finance: ALL, deliveries: ALL, quotes: ALL,
  },
  sotuvchi: {
    products: VIEW, sales: NO_DELETE, customers: ALL, suppliers: VIEW, finance: NO_DELETE, deliveries: NO_DELETE, quotes: NO_DELETE,
  },
  omborchi: { products: ALL, suppliers: ALL, sales: VIEW, customers: VIEW, deliveries: VIEW },
}

/** Yangi ruxsat avval qaysi tekshiruv bilan berilardi (endpoint dekoratori / maydon ro'yxati) */
const WAS: Record<Permission, (role: Exclude<Role, 'admin'>) => boolean> = Object.fromEntries(
  PERMISSIONS.map((p) => [p, legacyCheck(p)]),
) as Record<Permission, (role: Exclude<Role, 'admin'>) => boolean>

function legacyCheck(p: Permission): (role: Exclude<Role, 'admin'>) => boolean {
  const can = (resource: Legacy, action: LegacyAction) => (role: Exclude<Role, 'admin'>) =>
    LEGACY[role][resource]?.includes(action) ?? false
  const seesField = (hiddenFor: Role[]) => (role: Exclude<Role, 'admin'>) => !hiddenFor.includes(role)
  const map: Record<Permission, (role: Exclude<Role, 'admin'>) => boolean> = {
    'sales.view': can('sales', 'view'), 'sales.create': can('sales', 'create'),
    'sales.return': can('sales', 'create'), 'sales.cancel': can('sales', 'delete'),
    'quotes.view': can('quotes', 'view'), 'quotes.create': can('quotes', 'create'),
    'quotes.edit': can('quotes', 'edit'), 'quotes.delete': can('quotes', 'delete'),
    'deliveries.view': can('deliveries', 'view'), 'deliveries.create': can('deliveries', 'create'),
    'deliveries.edit': can('deliveries', 'edit'), 'deliveries.delete': can('deliveries', 'delete'),
    'products.view': can('products', 'view'), 'products.create': can('products', 'create'),
    'products.edit': can('products', 'edit'), 'products.delete': can('products', 'delete'),
    'stock.view': can('products', 'view'), 'stock.operate': can('products', 'edit'), 'stock.manage': can('products', 'edit'),
    'purchases.view': can('suppliers', 'view'), 'purchases.create': can('suppliers', 'create'),
    'purchases.edit': can('suppliers', 'edit'), 'purchases.receive': can('suppliers', 'edit'),
    'purchases.pay': can('finance', 'create'), 'purchases.delete': can('suppliers', 'delete'),
    'suppliers.view': can('suppliers', 'view'), 'suppliers.create': can('suppliers', 'create'),
    'suppliers.edit': can('suppliers', 'edit'), 'suppliers.delete': can('suppliers', 'delete'),
    'cash.view': can('finance', 'view'), 'cash.operate': can('finance', 'create'),
    'debts.view': can('finance', 'view'), 'debts.collect': can('finance', 'create'),
    'expenses.view': can('expenses', 'view'), 'expenses.create': can('expenses', 'create'),
    'expenses.edit': can('expenses', 'edit'), 'expenses.delete': can('expenses', 'delete'),
    'reports.view': can('finance', 'view'),
    'customers.view': can('customers', 'view'), 'customers.create': can('customers', 'create'),
    'customers.edit': can('customers', 'edit'), 'customers.delete': can('customers', 'delete'),
    'messages.view': can('customers', 'view'), 'messages.send': can('customers', 'create'),
    'employees.view': can('employees', 'view'), 'employees.create': can('employees', 'create'),
    'employees.edit': can('employees', 'edit'), 'employees.delete': can('employees', 'delete'),
    'users.view': can('users', 'view'), 'users.create': can('users', 'create'),
    'users.edit': can('users', 'edit'), 'users.delete': can('users', 'delete'),
    'audit.view': can('users', 'view'),
    // Rollarni boshqarish avval faqat administratorda edi
    'roles.view': () => false, 'roles.create': () => false, 'roles.edit': () => false, 'roles.delete': () => false,
    'settings.view': can('settings', 'view'), 'settings.edit': can('settings', 'edit'),
    'cost.view': seesField(['sotuvchi']),
    'wholesale.view': seesField(['sotuvchi']),
    'profit.view': seesField(['sotuvchi', 'omborchi']),
    'salary.view': seesField(['sotuvchi', 'omborchi']),
  }
  return map[p]
}

describe('ruxsatlar katalogi', () => {
  it('kalitlar noyob, har bo‘limda `view` bor, guruh ma’lum', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length)
    for (const resource of PERMISSION_CATALOG) {
      expect(resource.actions[0]?.key, resource.key).toBe('view')
      expect(Object.keys(PERMISSION_GROUPS)).toContain(resource.group)
    }
  })

  it('isPermission — faqat katalogdagi kalit', () => {
    expect(isPermission('sales.return')).toBe(true)
    expect(isPermission('sales.fly')).toBe(false)
    expect(isPermission('finance.view')).toBe(false)
  })

  it('normalizePermissions: takrorsiz, katalog tartibida, `view` va bog‘liqliklar qo‘shiladi', () => {
    expect(normalizePermissions(['sales.return', 'products.edit', 'sales.return'])).toEqual(['sales.view', 'sales.return', 'products.view', 'products.edit'])
    expect(normalizePermissions(['profit.view'])).toEqual(['cost.view', 'profit.view'])
    // Kassa — katalogsiz ishlamaydi; xarid — ta'minotchi va mahsulotsiz; zanjir: operate → view → products.view
    expect(normalizePermissions(['sales.create'])).toEqual(['sales.view', 'sales.create', 'products.view'])
    expect(normalizePermissions(['purchases.pay'])).toEqual(['products.view', 'purchases.view', 'purchases.pay', 'suppliers.view'])
    expect(normalizePermissions(['stock.operate'])).toEqual(['products.view', 'stock.view', 'stock.operate'])
    expect(normalizePermissions(['messages.send'])).toEqual(['customers.view', 'messages.view', 'messages.send'])
    expect(normalizePermissions(['users.edit'])).toEqual(['users.view', 'users.edit', 'roles.view'])
    expect(normalizePermissions([])).toEqual([])
  })

  it('administrator — saqlangan ro‘yxatdan qat’i nazar hammasi; boshqalar — faqat ma’lum kalitlar', () => {
    expect(effectivePermissions('admin', [])).toEqual(PERMISSIONS)
    expect(effectivePermissions(null, ['cash.view', 'finance.view', 'sales.view'])).toEqual(['sales.view', 'cash.view'])
  })

  it('hasPermission', () => {
    const set = new Set<Permission>(['sales.view', 'sales.create'])
    expect(hasPermission(set, 'sales', 'create')).toBe(true)
    expect(hasPermission(set, 'sales', 'cancel')).toBe(false)
  })
})

describe('tizim rollari', () => {
  it('sukut ruxsatlari — avvalgi qat’iy matritsa bilan aynan bir xil', () => {
    for (const role of ['manager', 'sotuvchi', 'omborchi'] as const) {
      const granted = new Set(SYSTEM_ROLES[role].permissions)
      for (const p of PERMISSIONS) expect(granted.has(p), `${role}: ${p}`).toBe(WAS[p](role))
    }
  })

  it('sukut ro‘yxatlar normallashtirilgan (bazaga shu holida yoziladi)', () => {
    for (const { permissions } of Object.values(SYSTEM_ROLES)) {
      expect(normalizePermissions(permissions)).toEqual(permissions)
    }
    expect(SYSTEM_ROLES.admin.permissions).toEqual([])
  })
})
