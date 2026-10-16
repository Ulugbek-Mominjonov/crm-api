-- ═══════════════════════════════════════════════════════════════════
-- Do'kon rollari (T-134): ruxsatlar ROLGA beriladi, foydalanuvchiga emas.
--
-- Har do'konda 4 ta tizim roli yaratiladi — ruxsatlari avvalgi qat'iy
-- matritsa bilan aynan bir xil (`@crm/shared` SYSTEM_ROLES; test bu
-- ro'yxatlarni u bilan solishtiradi), foydalanuvchi o'z rolining tizim
-- kalitiga bog'lanadi. Ya'ni migratsiyadan keyin hech kimning huquqi
-- o'zgarmaydi. `admin` ruxsatlari saqlanmaydi — doim katalogdagi hammasi.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE roles (
  id          uuid PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  key         "Role",
  name        text NOT NULL CONSTRAINT roles_name_check CHECK (char_length(name) BETWEEN 1 AND 50),
  permissions text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "roles_tenant_id_id_key" ON roles (tenant_id, id);
-- Har tizim roli do'konda bitta (do'kon yaratgan rollarda `key` NULL — cheklanmaydi)
CREATE UNIQUE INDEX "roles_tenant_id_key_key" ON roles (tenant_id, key);
-- Nom do'kon ichida noyob, katta-kichik harf farqsiz («Kassir» va «kassir» — bitta)
CREATE UNIQUE INDEX "roles_tenant_id_name_key" ON roles (tenant_id, lower(name));

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_tenant_isolation ON roles
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Mavjud do'konlarga tizim rollari (egasi — superuser, RLS'siz)
INSERT INTO roles (id, tenant_id, key, name, permissions)
SELECT gen_random_uuid(), t.id, r.key, r.name, r.permissions
  FROM tenants t
 CROSS JOIN (VALUES
   ('admin'::"Role", 'Administrator', '{}'::text[]),
   ('manager'::"Role", 'Menejer', ARRAY[
     'sales.view', 'sales.create', 'sales.return', 'sales.cancel',
     'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete',
     'deliveries.view', 'deliveries.create', 'deliveries.edit', 'deliveries.delete',
     'products.view', 'products.create', 'products.edit', 'products.delete',
     'stock.view', 'stock.operate', 'stock.manage',
     'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.receive', 'purchases.pay', 'purchases.delete',
     'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
     'cash.view', 'cash.operate', 'debts.view', 'debts.collect',
     'expenses.view', 'expenses.create', 'expenses.edit', 'expenses.delete', 'reports.view',
     'customers.view', 'customers.create', 'customers.edit', 'customers.delete', 'messages.view', 'messages.send',
     'employees.view', 'employees.create', 'employees.edit', 'settings.view', 'settings.edit',
     'cost.view', 'wholesale.view', 'profit.view', 'salary.view']),
   ('sotuvchi'::"Role", 'Sotuvchi', ARRAY[
     'sales.view', 'sales.create', 'sales.return',
     'quotes.view', 'quotes.create', 'quotes.edit',
     'deliveries.view', 'deliveries.create', 'deliveries.edit',
     'products.view', 'stock.view', 'purchases.view', 'purchases.pay', 'suppliers.view',
     'cash.view', 'cash.operate', 'debts.view', 'debts.collect', 'reports.view',
     'customers.view', 'customers.create', 'customers.edit', 'customers.delete', 'messages.view', 'messages.send']),
   ('omborchi'::"Role", 'Omborchi', ARRAY[
     'sales.view', 'deliveries.view',
     'products.view', 'products.create', 'products.edit', 'products.delete',
     'stock.view', 'stock.operate', 'stock.manage',
     'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.receive', 'purchases.delete',
     'suppliers.view', 'suppliers.create', 'suppliers.edit', 'suppliers.delete',
     'customers.view', 'messages.view', 'cost.view', 'wholesale.view'])
 ) AS r(key, name, permissions);

-- Foydalanuvchi → o'sha tizim roli. `updated_at` (versiya) ATAYLAB tegilmaydi
ALTER TABLE users ADD COLUMN role_id uuid;
UPDATE users u SET role_id = r.id FROM roles r WHERE r.tenant_id = u.tenant_id AND r.key = u.role;
ALTER TABLE users ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE users DROP COLUMN role;

ALTER TABLE users
  ADD CONSTRAINT "users_role_id_fkey"
  FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE RESTRICT ON UPDATE CASCADE;
-- Begona do'kon rolini berib bo'lmaydi
ALTER TABLE users
  ADD CONSTRAINT "users_role_id_same_tenant"
  FOREIGN KEY (tenant_id, role_id) REFERENCES roles (tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE;
-- Rol foydalanuvchilari soni, rolni o'chirishda ko'chirish, FK tekshiruvi
CREATE INDEX "users_tenant_id_role_id_idx" ON users (tenant_id, role_id);
