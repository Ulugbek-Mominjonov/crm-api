-- ═══════════════════════════════════════════════════════════════════
-- Tariflar va karta orqali to'lov (T-148, T-149, Q126).
--
-- Narx — do'kon uchun (foydalanuvchi uchun emas); yangi do'kon sinov
-- muddati bilan ochiladi. Yuridik shaxs (MChJ/YaTT) hali yo'q — to'lov
-- egasining kartasiga o'tkazma: do'kon administratori «to'ladim» deydi
-- (karta oxirgi 4 raqami, vaqt, ixtiyoriy chek), egasi bankda ko'rib
-- tasdiqlaydi — tarif Payme/Click bilan bir xil `applyPayment` orqali
-- uzayadi.
-- ═══════════════════════════════════════════════════════════════════

-- Sinov muddati oxiri: ro'yxatdan o'tganda qo'yiladi, birinchi to'lov (yoki egasi bergan tarif)
-- tozalaydi — `NOT NULL` = hali to'lamagan, sinovdagi yoki sinovi tugagan do'kon
ALTER TABLE tenants ADD COLUMN trial_ends_at timestamptz;

-- Egasining to'lov kartasi: do'kon administratori to'lov oynasida ko'radi; raqam yo'q — karta usuli o'chiq
ALTER TABLE platform_settings
  ADD COLUMN payment_card_number text,
  ADD COLUMN payment_card_holder text,
  ADD CONSTRAINT platform_settings_card_number_check CHECK (payment_card_number ~ '^[0-9]{16}$');

-- Karta to'lovi da'vosi: to'lovchi kartasining oxirgi 4 raqami, izohi, o'tkazma vaqti, chek;
-- egasi rad etsa — sababi (do'kon ko'radi)
ALTER TABLE billing_invoices
  ADD COLUMN payer_card      text,
  ADD COLUMN payer_note      text,
  ADD COLUMN transferred_at  timestamptz,
  ADD COLUMN claimed_at      timestamptz,
  ADD COLUMN receipt_file_id uuid,
  ADD COLUMN reject_reason   text,
  ADD CONSTRAINT billing_invoices_payer_card_check CHECK (payer_card ~ '^[0-9]{4}$'),
  DROP CONSTRAINT billing_invoices_provider_check,
  ADD CONSTRAINT billing_invoices_provider_check CHECK (provider IN ('payme', 'click', 'card', 'cash', 'transfer', 'bonus')),
  -- Chek fayli o'chsa havola uziladi (GC bog'langan chekni o'chirmaydi). `SET NULL (ustun)` — PG15+:
  -- kompozit FK tenant ustunini emas, faqat havolani tozalaydi
  ADD CONSTRAINT "billing_invoices_receipt_file_id_same_tenant"
    FOREIGN KEY (tenant_id, receipt_file_id) REFERENCES files (tenant_id, id)
    ON DELETE SET NULL (receipt_file_id) ON UPDATE CASCADE;

-- Bir do'konda bir vaqtda bitta tekshiruvdagi karta to'lovi: ikki marta bosish yoki takroriy da'vo
-- egasini chalg'itmasin. Egasi panelidagi «tekshirish kerak» soni ham shu indeksdan o'qiladi
CREATE UNIQUE INDEX billing_invoices_card_review_key ON billing_invoices (tenant_id)
  WHERE state = 'pending' AND provider = 'card';

-- Egasi paneli: ro'yxatga da'vo maydonlari (qaytish turi o'zgargani uchun qayta yaratiladi)
DROP FUNCTION platform_invoices(uuid, "InvoiceState", text, timestamptz, timestamptz, int, int);
CREATE FUNCTION platform_invoices(p_tenant uuid, p_state "InvoiceState", p_provider text,
                                  p_from timestamptz, p_to timestamptz, p_limit int, p_offset int)
RETURNS TABLE (id uuid, tenant_id uuid, tenant_name text, plan text, months int, amount bigint,
               state "InvoiceState", provider text, note text, payer_card text, payer_note text,
               transferred_at timestamptz, claimed_at timestamptz, has_receipt boolean, reject_reason text,
               created_at timestamptz, paid_at timestamptz, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.tenant_id, t.name, i.plan, i.months, i.amount, i.state, i.provider, i.note, i.payer_card, i.payer_note,
         i.transferred_at, i.claimed_at, i.receipt_file_id IS NOT NULL, i.reject_reason, i.created_at, i.paid_at,
         count(*) OVER ()
    FROM billing_invoices i
    JOIN tenants t ON t.id = i.tenant_id
   WHERE (p_tenant IS NULL OR i.tenant_id = p_tenant)
     AND (p_state IS NULL OR i.state = p_state)
     AND (p_provider IS NULL OR i.provider = p_provider)
     AND (p_from IS NULL OR i.created_at >= p_from)
     AND (p_to IS NULL OR i.created_at < p_to)
   ORDER BY i.created_at DESC
   LIMIT p_limit OFFSET p_offset
$$;

-- Egasi tekshirishini kutayotgan karta to'lovlari — boshqaruv paneli va menyu belgisi
CREATE OR REPLACE FUNCTION platform_pending_payments()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM billing_invoices WHERE state = 'pending' AND provider = 'card'
$$;

REVOKE ALL ON FUNCTION platform_invoices(uuid, "InvoiceState", text, timestamptz, timestamptz, int, int),
  platform_pending_payments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_invoices(uuid, "InvoiceState", text, timestamptz, timestamptz, int, int),
  platform_pending_payments() TO crm_app;
