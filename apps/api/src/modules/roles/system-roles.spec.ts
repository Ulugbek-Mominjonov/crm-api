import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SYSTEM_ROLES, type Role } from '@crm/shared'
import { systemRoleRows } from './system-roles'

/**
 * Mavjud do'konlarga rollarni migratsiya SQL'i yozgan (T-134), yangilariga —
 * kod (`systemRoleRows`). Ikkalasi bitta manbadan farq qilsa, eski va yangi
 * do'konlarda bir xil rolning huquqi har xil bo'lib qolardi.
 */
const MIGRATION = join(__dirname, '../../../prisma/migrations/20261016000000_store_roles/migration.sql')

function migrationRoles(): Record<string, { name: string; permissions: string[] }> {
  const sql = readFileSync(MIGRATION, 'utf8')
  const rows = [...sql.matchAll(/\('(\w+)'::"Role", '([^']+)', (?:'\{\}'::text\[\]|ARRAY\[([^\]]*)\])\)/g)]
  return Object.fromEntries(
    rows.map(([, key, name, list]) => [
      key,
      { name: name!, permissions: list ? [...list.matchAll(/'([\w.]+)'/g)].map((m) => m[1]!) : [] },
    ]),
  )
}

describe('tizim rollari', () => {
  it('migratsiya SQL’i va kod sukut ruxsatlari bir xil', () => {
    const fromSql = migrationRoles()
    expect(Object.keys(fromSql).sort()).toEqual(Object.keys(SYSTEM_ROLES).sort())
    for (const key of Object.keys(SYSTEM_ROLES) as Role[]) {
      expect(fromSql[key], key).toEqual({ name: SYSTEM_ROLES[key].name, permissions: [...SYSTEM_ROLES[key].permissions] })
    }
  })

  it('yangi do‘konga to‘rtala tizim roli', () => {
    const rows = systemRoleRows('t1')
    expect(rows.map((r) => r.key)).toEqual(['admin', 'manager', 'sotuvchi', 'omborchi'])
    expect(rows.every((r) => r.tenantId === 't1')).toBe(true)
  })
})
