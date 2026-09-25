-- ═══════════════════════════════════════════════════════════════════
-- Xabarlar: har qabul qiluvchi uchun yuborish navbati (E9)
-- ═══════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX "messages_tenant_id_id_key" ON messages (tenant_id, id);

-- Bitta xabarning har bir qabul qiluvchisi. Bazadagi navbat (outbox):
-- yuborish so'rovni bloklamaydi, xato bo'lsa keyingi urinish vaqti bilan
-- qayta navbatga tushadi, jarayon o'chsa ham yo'qolmaydi. `next_attempt_at`
-- yuborilayotgan qatorda "ijara" vazifasini ham bajaradi.
CREATE TABLE message_recipients (
  id              uuid PRIMARY KEY,
  tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  message_id      uuid NOT NULL,
  client_id       uuid,
  phone           text NOT NULL,
  text            text NOT NULL,
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'logged')),
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_id     text,
  error           text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_recipients_message_id_same_tenant
    FOREIGN KEY (tenant_id, message_id) REFERENCES messages (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX "message_recipients_tenant_id_message_id_idx" ON message_recipients (tenant_id, message_id);
-- Navbat: faqat yuborilmaganlar (qisman indeks — yuborilganlar ko'payib ketsa ham kichik)
CREATE INDEX message_recipients_due ON message_recipients (tenant_id, next_attempt_at)
  WHERE status IN ('queued', 'sending');

ALTER TABLE message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_recipients FORCE ROW LEVEL SECURITY;
CREATE POLICY message_recipients_tenant_isolation ON message_recipients
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- Fon ishchisi uchun: navbatida muddati kelgan xabari bor tenantlar.
-- RLS ostidagi ilova roli boshqa tenant qatorini ko'rmaydi — funksiya faqat
-- tenant id'larini beradi (ma'lumot emas), keyin har tenant o'z
-- tranzaksiyasida qayta ishlanadi. Barcha tenantlarni aylanib chiqish kerak emas.
CREATE OR REPLACE FUNCTION tenants_with_due_messages()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT tenant_id FROM message_recipients
   WHERE status IN ('queued', 'sending') AND next_attempt_at <= now()
$$;
REVOKE ALL ON FUNCTION tenants_with_due_messages() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenants_with_due_messages() TO crm_app;
