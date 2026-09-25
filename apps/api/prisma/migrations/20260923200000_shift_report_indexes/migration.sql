-- Z-hisobot (T-061) har pul hujjatini smena bo'yicha yig'adi: indekssiz
-- tenantning BUTUN xarajat/to'lov tarixi o'qilardi
CREATE INDEX "expenses_tenant_id_shift_id_idx"          ON expenses (tenant_id, shift_id);
CREATE INDEX "debt_payments_tenant_id_shift_id_idx"     ON debt_payments (tenant_id, shift_id);
CREATE INDEX "supplier_payments_tenant_id_shift_id_idx" ON supplier_payments (tenant_id, shift_id);
