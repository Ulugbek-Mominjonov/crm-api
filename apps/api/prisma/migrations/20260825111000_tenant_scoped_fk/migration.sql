-- ═══════════════════════════════════════════════════════════════════
-- Tenant izolyatsiyasi — baza darajasida
--
-- Muammo: oddiy tashqi kalit faqat `id` ni tekshiradi. Ya'ni nazariy
-- jihatdan A do'konining cheki B do'konining mahsulotiga havola qilishi
-- mumkin — va bu hech qayerda ushlanmaydi.
--
-- Yechim: KOMPOZIT tashqi kalit (tenant_id, X_id). Endi havola faqat
-- AYNI tenant ichida bo'lishi mumkin.
-- Manba: backend-tz/core/02-data-modeling.md §2.2
-- ═══════════════════════════════════════════════════════════════════

-- Ota jadvallarda (tenant_id, id) noyob bo'lishi shart
CREATE UNIQUE INDEX "cash_shifts_tenant_id_id_key"       ON "cash_shifts" ("tenant_id", "id");
CREATE UNIQUE INDEX "expense_templates_tenant_id_id_key" ON "expense_templates" ("tenant_id", "id");
CREATE UNIQUE INDEX "quotes_tenant_id_id_key"            ON "quotes" ("tenant_id", "id");

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_sale_id_same_tenant"
  FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales" ("tenant_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_product_id_same_tenant"
  FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quote_items"
  ADD CONSTRAINT "quote_items_quote_id_same_tenant"
  FOREIGN KEY ("tenant_id", "quote_id") REFERENCES "quotes" ("tenant_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_items"
  ADD CONSTRAINT "quote_items_product_id_same_tenant"
  FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "po_items"
  ADD CONSTRAINT "po_items_order_id_same_tenant"
  FOREIGN KEY ("tenant_id", "order_id") REFERENCES "purchase_orders" ("tenant_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "po_items"
  ADD CONSTRAINT "po_items_product_id_same_tenant"
  FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_stocks"
  ADD CONSTRAINT "product_stocks_product_id_same_tenant"
  FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products" ("tenant_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_stocks"
  ADD CONSTRAINT "product_stocks_warehouse_id_same_tenant"
  FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouses" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_product_id_same_tenant"
  FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_warehouse_id_same_tenant"
  FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouses" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_supplier_id_same_tenant"
  FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "suppliers" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_customer_id_same_tenant"
  FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "clients" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_seller_id_same_tenant"
  FOREIGN KEY ("tenant_id", "seller_id") REFERENCES "employees" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_warehouse_id_same_tenant"
  FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouses" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "debt_payments"
  ADD CONSTRAINT "debt_payments_sale_id_same_tenant"
  FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "debt_payments"
  ADD CONSTRAINT "debt_payments_customer_id_same_tenant"
  FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "clients" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "debt_payments"
  ADD CONSTRAINT "debt_payments_shift_id_same_tenant"
  FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shifts" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "cash_movements"
  ADD CONSTRAINT "cash_movements_shift_id_same_tenant"
  FOREIGN KEY ("tenant_id", "shift_id") REFERENCES "cash_shifts" ("tenant_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_template_id_same_tenant"
  FOREIGN KEY ("tenant_id", "template_id") REFERENCES "expense_templates" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_supplier_id_same_tenant"
  FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "suppliers" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_warehouse_id_same_tenant"
  FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "warehouses" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_po_id_same_tenant"
  FOREIGN KEY ("tenant_id", "po_id") REFERENCES "purchase_orders" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_supplier_id_same_tenant"
  FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "suppliers" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_customer_id_same_tenant"
  FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "clients" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_seller_id_same_tenant"
  FOREIGN KEY ("tenant_id", "seller_id") REFERENCES "employees" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_sale_id_same_tenant"
  FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_sale_id_same_tenant"
  FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_customer_id_same_tenant"
  FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "clients" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "deliveries"
  ADD CONSTRAINT "deliveries_driver_id_same_tenant"
  FOREIGN KEY ("tenant_id", "driver_id") REFERENCES "employees" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "products"
  ADD CONSTRAINT "products_category_id_same_tenant"
  FOREIGN KEY ("tenant_id", "category_id") REFERENCES "categories" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "products"
  ADD CONSTRAINT "products_supplier_id_same_tenant"
  FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "suppliers" ("tenant_id", "id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "users"
  ADD CONSTRAINT "users_employee_id_same_tenant"
  FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "employees" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_user_id_same_tenant"
  FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users" ("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

