-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'on_leave', 'fired');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'manager', 'sotuvchi', 'omborchi');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('individual', 'company');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('lead', 'active', 'inactive');

-- CreateEnum
CREATE TYPE "CustomerGroup" AS ENUM ('retail', 'wholesale', 'vip');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('dona', 'kg', 'metr', 'm2', 'm3', 'litr', 'qop', 'rulon');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('intake', 'writeoff', 'adjustment', 'sale', 'return', 'transfer_out', 'transfer_in');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('sale', 'return');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('completed', 'pending', 'cancelled');

-- CreateEnum
CREATE TYPE "PriceTier" AS ENUM ('retail', 'wholesale');

-- CreateEnum
CREATE TYPE "PayMethod" AS ENUM ('cash', 'bank');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "CashDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('rent', 'utilities', 'salary', 'transport', 'tax', 'other');

-- CreateEnum
CREATE TYPE "RecurrencePeriod" AS ENUM ('monthly', 'weekly');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('ordered', 'partial', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'converted');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'on_way', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "MessageTarget" AS ENUM ('customer', 'group', 'debtors', 'all');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_state" (
    "tenant_id" UUID NOT NULL,
    "cash_balance" BIGINT NOT NULL DEFAULT 0,
    "active_shift_id" UUID,
    "active_warehouse_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tenant_state_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "doc_counters" (
    "tenant_id" UUID NOT NULL,
    "prefix" TEXT NOT NULL,
    "last_no" BIGINT NOT NULL DEFAULT 1000,

    CONSTRAINT "doc_counters_pkey" PRIMARY KEY ("tenant_id","prefix")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "body_hash" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "parent_id" UUID,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "salary" BIGINT NOT NULL DEFAULT 0,
    "hired_at" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "tenant_id" UUID NOT NULL,
    "store_name" TEXT NOT NULL DEFAULT 'Qurilish Mollari',
    "currency" TEXT NOT NULL DEFAULT 'so''m',
    "tax_enabled" BOOLEAN NOT NULL DEFAULT true,
    "tax_rate" INTEGER NOT NULL DEFAULT 12,
    "wholesale_enabled" BOOLEAN NOT NULL DEFAULT true,
    "loyalty_enabled" BOOLEAN NOT NULL DEFAULT true,
    "loyalty_rate" INTEGER NOT NULL DEFAULT 1,
    "max_discount_pct" INTEGER NOT NULL DEFAULT 100,
    "receipt_phone" TEXT NOT NULL DEFAULT '',
    "receipt_address" TEXT NOT NULL DEFAULT '',
    "receipt_footer" TEXT NOT NULL DEFAULT '',
    "onboarded" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ClientType" NOT NULL DEFAULT 'individual',
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "status" "ClientStatus" NOT NULL DEFAULT 'lead',
    "group" "CustomerGroup" NOT NULL DEFAULT 'retail',
    "bonus_points" BIGINT NOT NULL DEFAULT 0,
    "credit_limit" BIGINT,
    "payment_term_days" INTEGER,
    "source" TEXT NOT NULL DEFAULT '',
    "company" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "contact_person" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "email" TEXT,
    "tin" TEXT,
    "payment_term_days" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "category_id" UUID,
    "unit" "ProductUnit" NOT NULL,
    "price" BIGINT NOT NULL,
    "wholesale_price" BIGINT NOT NULL,
    "cost" BIGINT NOT NULL,
    "stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "supplier_id" UUID,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "alt_unit" "ProductUnit",
    "alt_factor" DECIMAL(14,3),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_stocks" (
    "product_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "product_stocks_pkey" PRIMARY KEY ("product_id","warehouse_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "balance_after" DECIMAL(14,3) NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "counter_warehouse_id" UUID,
    "date" DATE NOT NULL,
    "note" TEXT,
    "supplier_id" UUID,
    "unit_cost" BIGINT,
    "ref_id" UUID,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "type" "SaleType" NOT NULL DEFAULT 'sale',
    "customer_id" UUID,
    "seller_id" UUID,
    "warehouse_id" UUID,
    "priceTier" "PriceTier" NOT NULL DEFAULT 'retail',
    "subtotal" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "tax_rate" INTEGER NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "delivery_fee" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "paid_cash" BIGINT NOT NULL DEFAULT 0,
    "paid_card" BIGINT NOT NULL DEFAULT 0,
    "paid_transfer" BIGINT NOT NULL DEFAULT 0,
    "debt_paid" BIGINT NOT NULL DEFAULT 0,
    "change" BIGINT NOT NULL DEFAULT 0,
    "status" "SaleStatus" NOT NULL DEFAULT 'completed',
    "date" DATE NOT NULL,
    "due_date" DATE,
    "related_sale_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "base_qty" DECIMAL(14,3) NOT NULL,
    "price" BIGINT NOT NULL,
    "cost" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "line_no" INTEGER NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "customer_id" UUID,
    "amount" BIGINT NOT NULL,
    "method" "PayMethod" NOT NULL,
    "date" DATE NOT NULL,
    "user_id" UUID,
    "shift_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_shifts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ NOT NULL,
    "opening_balance" BIGINT NOT NULL,
    "cash_in" BIGINT NOT NULL DEFAULT 0,
    "cash_out" BIGINT NOT NULL DEFAULT 0,
    "status" "ShiftStatus" NOT NULL DEFAULT 'open',
    "closed_at" TIMESTAMPTZ,
    "expected_balance" BIGINT,
    "counted_balance" BIGINT,
    "difference" BIGINT,
    "note" TEXT,
    "user_id" UUID,

    CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "shift_id" UUID NOT NULL,
    "direction" "CashDirection" NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "PayMethod" NOT NULL,
    "date" DATE NOT NULL,
    "note" TEXT,
    "user_id" UUID,
    "shift_id" UUID,
    "template_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "PayMethod" NOT NULL,
    "period" "RecurrencePeriod" NOT NULL,
    "day_of_period" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_run_key" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "expense_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID,
    "total" BIGINT NOT NULL,
    "paid" BIGINT NOT NULL DEFAULT 0,
    "status" "POStatus" NOT NULL DEFAULT 'ordered',
    "date" DATE NOT NULL,
    "received_date" DATE,
    "due_date" DATE,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "received_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "cost" BIGINT NOT NULL,

    CONSTRAINT "po_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "po_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "PayMethod" NOT NULL,
    "date" DATE NOT NULL,
    "user_id" UUID,
    "shift_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID,
    "seller_id" UUID,
    "subtotal" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "tax_rate" INTEGER NOT NULL DEFAULT 0,
    "tax" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'draft',
    "date" DATE NOT NULL,
    "valid_until" DATE,
    "note" TEXT,
    "sale_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quote_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "base_qty" DECIMAL(14,3) NOT NULL,
    "price" BIGINT NOT NULL,
    "cost" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,
    "line_no" INTEGER NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID,
    "customer_id" UUID,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "standalone_fee" BIGINT,
    "driver_id" UUID,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "scheduled_date" DATE NOT NULL,
    "note" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "target" "MessageTarget" NOT NULL,
    "recipient_label" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "template" TEXT,
    "delivery_status" TEXT NOT NULL DEFAULT 'queued',
    "user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "entity_type" TEXT,
    "entity_id" UUID,
    "diff" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "employees_tenant_id_deleted_at_idx" ON "employees"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_id_key" ON "employees"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_deleted_at_idx" ON "users"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_id_key" ON "users"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "clients_tenant_id_deleted_at_idx" ON "clients"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "clients_tenant_id_phone_idx" ON "clients"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "clients_tenant_id_id_key" ON "clients"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_deleted_at_idx" ON "suppliers"("tenant_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_id_key" ON "suppliers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_name_key" ON "categories"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_id_key" ON "categories"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "warehouses_tenant_id_archived_idx" ON "warehouses"("tenant_id", "archived");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_id_name_key" ON "warehouses"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_id_id_key" ON "warehouses"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "products_tenant_id_deleted_at_archived_idx" ON "products"("tenant_id", "deleted_at", "archived");

-- CreateIndex
CREATE INDEX "products_tenant_id_barcode_idx" ON "products"("tenant_id", "barcode");

-- CreateIndex
CREATE INDEX "products_tenant_id_category_id_idx" ON "products"("tenant_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_id_key" ON "products"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "product_stocks_tenant_id_warehouse_id_idx" ON "product_stocks"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_date_idx" ON "stock_movements"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_product_id_created_at_idx" ON "stock_movements"("tenant_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_warehouse_id_created_at_idx" ON "stock_movements"("tenant_id", "warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_ref_id_idx" ON "stock_movements"("tenant_id", "ref_id");

-- CreateIndex
CREATE INDEX "sales_tenant_id_date_idx" ON "sales"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "sales_tenant_id_status_date_idx" ON "sales"("tenant_id", "status", "date");

-- CreateIndex
CREATE INDEX "sales_tenant_id_customer_id_idx" ON "sales"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "sales_tenant_id_seller_id_date_idx" ON "sales"("tenant_id", "seller_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_number_key" ON "sales"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_id_key" ON "sales"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "sale_items_tenant_id_sale_id_idx" ON "sale_items"("tenant_id", "sale_id");

-- CreateIndex
CREATE INDEX "sale_items_tenant_id_product_id_idx" ON "sale_items"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "debt_payments_tenant_id_sale_id_idx" ON "debt_payments"("tenant_id", "sale_id");

-- CreateIndex
CREATE INDEX "debt_payments_tenant_id_date_idx" ON "debt_payments"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "cash_shifts_tenant_id_status_idx" ON "cash_shifts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "cash_shifts_tenant_id_opened_at_idx" ON "cash_shifts"("tenant_id", "opened_at");

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_shift_id_idx" ON "cash_movements"("tenant_id", "shift_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_date_idx" ON "expenses"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_category_date_idx" ON "expenses"("tenant_id", "category", "date");

-- CreateIndex
CREATE INDEX "expense_templates_tenant_id_active_idx" ON "expense_templates"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_status_idx" ON "purchase_orders"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_supplier_id_idx" ON "purchase_orders"("tenant_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_number_key" ON "purchase_orders"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_id_key" ON "purchase_orders"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "po_items_tenant_id_order_id_idx" ON "po_items"("tenant_id", "order_id");

-- CreateIndex
CREATE INDEX "supplier_payments_tenant_id_po_id_idx" ON "supplier_payments"("tenant_id", "po_id");

-- CreateIndex
CREATE INDEX "supplier_payments_tenant_id_date_idx" ON "supplier_payments"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_sale_id_key" ON "quotes"("sale_id");

-- CreateIndex
CREATE INDEX "quotes_tenant_id_status_idx" ON "quotes"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_tenant_id_number_key" ON "quotes"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "quote_items_tenant_id_quote_id_idx" ON "quote_items"("tenant_id", "quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_sale_id_key" ON "deliveries"("sale_id");

-- CreateIndex
CREATE INDEX "deliveries_tenant_id_status_scheduled_date_idx" ON "deliveries"("tenant_id", "status", "scheduled_date");

-- CreateIndex
CREATE INDEX "deliveries_tenant_id_driver_id_status_idx" ON "deliveries"("tenant_id", "driver_id", "status");

-- CreateIndex
CREATE INDEX "messages_tenant_id_created_at_idx" ON "messages"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_created_at_idx" ON "audit_log"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_action_created_at_idx" ON "audit_log"("tenant_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_tenant_id_user_id_created_at_idx" ON "audit_log"("tenant_id", "user_id", "created_at");

-- AddForeignKey
ALTER TABLE "tenant_state" ADD CONSTRAINT "tenant_state_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cash_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "cash_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "expense_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_items" ADD CONSTRAINT "po_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_items" ADD CONSTRAINT "po_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- Prisma ifodalay olmaydigan cheklovlar
-- Manba: backend-tz/core/02-data-modeling.md §2.2
-- ═══════════════════════════════════════════════════════════════════

-- I8: bir tenantda faqat BITTA ochiq smena.
-- Ikkinchi smenani ochishga urinish baza darajasida rad etiladi —
-- servisdagi tekshiruv poyga holatida (race) o'tkazib yuborishi mumkin.
CREATE UNIQUE INDEX one_open_shift_per_tenant
  ON cash_shifts (tenant_id)
  WHERE status = 'open';

-- Bir tenantda faqat bitta sukut ombor
CREATE UNIQUE INDEX one_default_warehouse
  ON warehouses (tenant_id)
  WHERE is_default = true;

-- I2: qoldiq manfiy bo'lmaydi. Bu OXIRGI to'siq — asosiy tekshiruv
-- servisda (aniq xato xabari bilan), lekin baza ham himoyalanadi.
ALTER TABLE product_stocks
  ADD CONSTRAINT stock_not_negative CHECK (qty >= 0);

-- Pul manfiy bo'lmasin
ALTER TABLE sales ADD CONSTRAINT sale_amounts_non_negative
  CHECK (subtotal >= 0 AND discount >= 0 AND tax >= 0
         AND delivery_fee >= 0 AND total >= 0
         AND paid_cash >= 0 AND paid_card >= 0
         AND paid_transfer >= 0 AND debt_paid >= 0 AND change >= 0);

ALTER TABLE debt_payments      ADD CONSTRAINT debt_payment_positive     CHECK (amount > 0);
ALTER TABLE supplier_payments  ADD CONSTRAINT supplier_payment_positive CHECK (amount > 0);
ALTER TABLE cash_movements     ADD CONSTRAINT cash_movement_positive    CHECK (amount > 0);
ALTER TABLE expenses           ADD CONSTRAINT expense_positive          CHECK (amount > 0);
ALTER TABLE products           ADD CONSTRAINT product_prices_non_negative
  CHECK (price >= 0 AND wholesale_price >= 0 AND cost >= 0 AND min_stock >= 0);

-- I14: to'langan summa chek summasidan oshmaydi
ALTER TABLE sales ADD CONSTRAINT paid_not_over_total
  CHECK (paid_cash + paid_card + paid_transfer + debt_paid <= total);

-- I19: qabul buyurtmadan oshmaydi
ALTER TABLE po_items ADD CONSTRAINT received_within_ordered
  CHECK (received_qty >= 0 AND received_qty <= qty AND qty > 0);

-- I15: nasiya (pending) sotuv uchun mijoz SHART
ALTER TABLE sales ADD CONSTRAINT credit_requires_customer
  CHECK (status <> 'pending' OR type <> 'sale' OR customer_id IS NOT NULL);

-- Ombor ko'chirishda ikki tomon har xil bo'lsin
ALTER TABLE stock_movements ADD CONSTRAINT transfer_warehouses_differ
  CHECK (counter_warehouse_id IS NULL OR counter_warehouse_id <> warehouse_id);

-- Xarajat shabloni kuni to'g'ri oraliqda (I21)
ALTER TABLE expense_templates ADD CONSTRAINT day_of_period_range
  CHECK ((period = 'monthly' AND day_of_period BETWEEN 1 AND 28)
      OR (period = 'weekly'  AND day_of_period BETWEEN 1 AND 7));

-- Foizlar 0..100
ALTER TABLE settings ADD CONSTRAINT settings_pct_range
  CHECK (tax_rate BETWEEN 0 AND 100
     AND loyalty_rate BETWEEN 0 AND 100
     AND max_discount_pct BETWEEN 0 AND 100);
ALTER TABLE sales ADD CONSTRAINT sale_tax_rate_range CHECK (tax_rate BETWEEN 0 AND 100);

-- Sodiqlik balansi manfiy bo'lmaydi (I17)
ALTER TABLE clients ADD CONSTRAINT bonus_not_negative CHECK (bonus_points >= 0);

-- D3: yetkazish narxi faqat chekka bog'lanmagan yetkazishda bo'ladi
ALTER TABLE deliveries ADD CONSTRAINT standalone_fee_only_without_sale
  CHECK (standalone_fee IS NULL OR sale_id IS NULL);
