"""Ma'lumotlar bazasi hujjati: docs/database/README.md — Mermaid ER diagrammalari va jadvallar tavsifi.

Tuzilma (ustunlar, turlar, kalitlar, bog'lanishlar, triggerlar, enumlar) — ishlab turgan bazaning
katalogidan (migratsiyalar qo'llangan bo'lishi kerak); ustun izohlari — schema.prisma dagi `///`;
"nima uchun" — tables.py (qo'lda).

  npm run services:up && npm run docs:db
  PSQL='psql postgresql://…' npm run docs:db     # boshqa baza
"""
import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from tables import COLUMNS, ENUM_LABELS, GROUPS, TABLES, VIEWS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / 'apps/api/prisma/schema.prisma'
OUT = ROOT / 'docs/database/README.md'
PSQL = os.environ.get('PSQL', 'docker exec -i crm-dev-db psql -U crm -d crm')

CATALOG_SQL = """
SELECT json_build_object(
  'relations', (SELECT json_agg(json_build_object(
      'name', c.relname, 'kind', c.relkind, 'rls', c.relrowsecurity, 'force', c.relforcerowsecurity,
      'columns', (SELECT json_agg(json_build_object(
          'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notnull', a.attnotnull,
          'generated', a.attgenerated <> '', 'default', pg_get_expr(d.adbin, d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
      'pk', (SELECT json_agg(a.attname) FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = c.oid AND i.indisprimary),
      'uniques', (SELECT json_agg((SELECT json_agg(a.attname ORDER BY a.attname) FROM pg_attribute a
          WHERE a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)))
        FROM pg_index i WHERE i.indrelid = c.oid AND i.indisunique AND NOT i.indisprimary AND i.indpred IS NULL)
    ) ORDER BY c.relname)
    FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')),
  'fks', (SELECT json_agg(json_build_object(
      'child', con.conrelid::regclass::text, 'parent', con.confrelid::regclass::text, 'on_delete', con.confdeltype,
      'cols', (SELECT json_agg(a.attname ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(n, ord)
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.n)))
    FROM pg_constraint con WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace),
  'triggers', (SELECT json_agg(json_build_object('table', tgrelid::regclass::text, 'name', tgname) ORDER BY tgname)
    FROM pg_trigger WHERE NOT tgisinternal),
  'enums', (SELECT json_object_agg(t.typname, (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder)
      FROM pg_enum e WHERE e.enumtypid = t.oid))
    FROM pg_type t WHERE t.typtype = 'e' AND t.typnamespace = 'public'::regnamespace)
)
"""

ON_DELETE = {'c': 'CASCADE', 'r': 'RESTRICT', 'n': 'SET NULL', 'a': 'NO ACTION'}
TRIGGERS = {
    'product_stock_sync': "`products.stock` ni ombor qoldiqlari yig'indisiga tenglaydi",
    'movements_no_update': "o'zgartirishni taqiqlaydi (jurnal)", 'movements_no_delete': "o'chirishni taqiqlaydi (jurnal)",
    'audit_no_update': "o'zgartirishni taqiqlaydi (jurnal)", 'audit_no_delete': "o'chirishni taqiqlaydi (jurnal)",
    'sales_report_dirty_insert': "orqa sanali chekda hisobotni \"eskirgan\" deb belgilaydi",
    'sales_report_dirty_update': "chek o'zgarsa (bekor qilish) hisobotni \"eskirgan\" deb belgilaydi",
}


def catalog():
    try:
        out = subprocess.run(shlex.split(PSQL) + ['-At', '-v', 'ON_ERROR_STOP=1'], input=CATALOG_SQL,
                             capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        sys.exit(f"Bazaga ulanib bo'lmadi ({PSQL}): {getattr(e, 'stderr', '') or e}\n"
                 "Servislar ishlayaptimi? `npm run services:up` (yoki PSQL='psql <url>')")
    return json.loads(out)


def prisma_comments():
    """(jadval, ustun) → schema.prisma dagi `///` izoh"""
    notes, model_fields, table, doc, fields = {}, {}, None, [], []
    for line in SCHEMA.read_text().splitlines():
        s = line.strip()
        if s.startswith('///'):
            doc.append(s[3:].strip())
            continue
        if re.match(r'^model\s+\w+\s*\{', s):
            fields, table, doc = [], None, []
            continue
        m = re.match(r'@@map\("([^"]+)"\)', s)
        if m:
            table = m.group(1)
            model_fields[table] = fields
            continue
        if s == '}':
            doc = []
            continue
        f = re.match(r'^(\w+)\s+(\S+)', s)
        if f and not s.startswith('@@') and not s.startswith('//'):
            col = re.search(r'@map\("([^"]+)"\)', s)
            fields.append((col.group(1) if col else f.group(1), ' '.join(doc)))
        doc = []
    for table, cols in model_fields.items():
        for col, text in cols:
            if text:
                notes[(table, col)] = text
    return notes


def short_type(t):
    t = t.replace('timestamp(3) with time zone', 'timestamptz').replace('timestamp(3) without time zone', 'timestamp')
    t = t.replace('timestamp with time zone', 'timestamptz').replace('character varying', 'varchar')
    t = t.replace('double precision', 'float8').replace('"', '')
    return t


def mermaid_type(t):
    t = short_type(t)
    t = re.sub(r'\(.*\)', '', t).replace('[]', '_arr')
    return re.sub(r'[^A-Za-z0-9_]', '_', t)


def relations(fks):
    """Tenant bo'yicha tarkibiy va oddiy FK'lar juftligi — bitta bog'lanish: (child, ustun) → parent"""
    rels = {}
    for fk in fks:
        cols = [c for c in fk['cols'] if c != 'tenant_id'] or ['tenant_id']
        key = (fk['child'], ','.join(cols), fk['parent'])
        prev = rels.get(key)
        # Oddiy FK (tenant'siz) harakati odatda aniqroq (SET NULL) — shuni ko'rsatamiz
        if prev is None or len(fk['cols']) < prev['n']:
            rels[key] = {'child': fk['child'], 'col': ','.join(cols), 'parent': fk['parent'],
                         'on_delete': fk['on_delete'], 'n': len(fk['cols'])}
    return list(rels.values())


def cardinality(rel, rels_by_name):
    child = rels_by_name[rel['child']]
    col = next((c for c in child['columns'] if c['name'] == rel['col']), None)
    optional = col is not None and not col['notnull']
    uniques = [sorted(u) for u in (child.get('uniques') or [])] + [sorted(child.get('pk') or [])]
    one = sorted([rel['col']]) in uniques or sorted(['tenant_id', rel['col']]) in uniques
    return ('|o' if optional else '||') + '--' + ('o|' if one else 'o{')


def diagram(tables, rels, rels_by_name, with_columns=True):
    lines = ['```mermaid', 'erDiagram']
    shown = set(tables)
    for r in sorted(rels, key=lambda r: (r['parent'], r['child'], r['col'])):
        if r['parent'] == 'tenants' and r['col'] == 'tenant_id' and 'tenants' not in shown:
            continue
        # Guruh diagrammasi: guruh jadvallari va ular murojaat qiladigan tashqi jadvallar (bo'sh quti);
        # umumiy ko'rinish — faqat ro'yxatdagi jadvallar orasidagi bog'lanishlar
        if r['child'] in shown and (with_columns or r['parent'] in shown):
            lines.append(f"    {r['parent']} {cardinality(r, rels_by_name)} {r['child']} : \"{r['col']}\"")
    if with_columns:
        fk_cols = {(r['child'], c) for r in rels for c in r['col'].split(',')}
        for t in tables:
            rel = rels_by_name[t]
            pk = set(rel.get('pk') or [])
            lines.append(f'    {t} {{')
            for c in rel['columns']:
                keys = [k for k, on in (('PK', c['name'] in pk), ('FK', (t, c['name']) in fk_cols or
                                        (c['name'] == 'tenant_id' and t != 'tenants'))) if on]
                lines.append(f"        {mermaid_type(c['type'])} {c['name']}{(' ' + ', '.join(keys)) if keys else ''}")
            lines.append('    }')
    lines.append('```')
    return '\n'.join(lines)


def cell(text):
    return (text or '').replace('|', '\\|').replace('\n', ' ')


def column_table(name, rel, rels, notes, enums):
    fk_of = {(r['child'], r['col']): r['parent'] for r in rels}
    pk = set(rel.get('pk') or [])
    rows = ['| Ustun | Tur | Bo‘sh bo‘lishi mumkin | Izoh |', '|-------|-----|----|------|']
    for c in rel['columns']:
        bits = []
        if c['name'] in pk:
            bits.append('**PK**')
        parent = fk_of.get((name, c['name']))
        if parent:
            bits.append(f'→ `{parent}`')
        elif c['name'] == 'tenant_id' and name != 'tenants':
            bits.append('→ `tenants` (RLS)')
        if c['generated']:
            bits.append('**GENERATED** — bazaning o‘zi hisoblaydi')
        t = short_type(c['type'])
        if t in enums:
            t = f'`{t}` (enum)'
        note = notes.get((name, c['name'])) or COLUMNS.get(c['name'], '')
        rows.append(f"| `{c['name']}` | {t} | {'—' if c['notnull'] else 'ha'} | "
                    f"{cell(' · '.join(bits + ([note] if note else [])))} |")
    return '\n'.join(rows)


def main():
    cat = catalog()
    rels_by_name = {r['name']: r for r in cat['relations']}
    tables = {n for n, r in rels_by_name.items() if r['kind'] in ('r', 'p')}
    views = {n for n, r in rels_by_name.items() if r['kind'] in ('v', 'm')}
    grouped = [t for g in GROUPS for t in g[3]]
    missing = (tables - set(grouped)) | (tables - set(TABLES)) | (views - set(VIEWS))
    extra = set(grouped) - tables
    if missing or extra:
        sys.exit(f"tables.py bazaga mos emas — tavsifsiz: {sorted(missing)}; bazada yo'q: {sorted(extra)}")

    rels = relations(cat['fks'] or [])
    notes = prisma_comments()
    enums = cat['enums'] or {}
    triggers = {}
    for tr in cat['triggers'] or []:
        triggers.setdefault(tr['table'], []).append(tr['name'])

    out = [
        '# Ma’lumotlar bazasi — tuzilma va jadvallar',
        '',
        '> Generatsiya qilingan: `npm run docs:db` (`scripts/db-docs/`). Tuzilma — ishlab turgan bazadan '
        '(migratsiyalar qo‘llangan), ustun izohlari — `apps/api/prisma/schema.prisma`, jadvallar vazifasi — '
        '`scripts/db-docs/tables.py`. Bu faylni qo‘lda tahrirlamang.',
        '',
        f'PostgreSQL 16 · {len(tables)} jadval · {len(views)} ko‘rinish · {len(enums)} enum. Diagrammalar — '
        '[Mermaid](https://mermaid.js.org) (GitHub va VS Code o‘zi chizadi). DBeaver’da ham: `public` sxemasi → '
        '**View Diagram**.',
        '',
        '## Umumiy qoidalar',
        '',
        '- **Do‘kon (tenant) ajratilishi.** Deyarli har jadvalda `tenant_id`; Row Level Security (FORCE) ilova '
        'roliga (`crm_app`) faqat joriy do‘kon qatorlarini ko‘rsatadi. Bog‘lanishlar `(tenant_id, x_id) → '
        '(tenant_id, id)` ko‘rinishida — bir do‘kon yozuvi boshqasinikiga bog‘lana olmaydi. RLS’siz: `tenants`, '
        '`refresh_tokens`, `report_refresh_state`, `_prisma_migrations`.',
        '- **Kalitlar** — UUID (v7, vaqt bo‘yicha tartiblangan), ilova yaratadi.',
        '- **Pul** — `bigint`, butun so‘m. **Miqdor** — `numeric`, 3 kasr xonagacha.',
        '- **Yumshoq o‘chirish** — `deleted_at` to‘lsa yozuv yashiriladi, lekin saqlanadi (tiklash mumkin). '
        'Omborlar va mahsulotlar — `archived`.',
        '- **Versiya** — `updated_at`: tahrirda `If-Match` bilan bir vaqtdagi o‘zgarishlar to‘qnashuvi aniqlanadi.',
        '- **Nusxa (snapshot)** — chek va hujjat qatorlarida nom, narx, tannarx sotuv paytidagicha saqlanadi.',
        '- **Hisoblangan (denormalizatsiya) maydonlar** — `products.stock` (trigger), `tenant_state.cash_balance`, '
        '`purchase_orders.paid` va `received_value`, `sales.debt_paid`; `sales.outstanding` va '
        '`purchase_orders.outstanding` — GENERATED. Har kecha invariant tekshiruvi ularni noldan qayta '
        'hisoblab solishtiradi.',
        '- **Faqat qo‘shiladigan jurnallar** — `audit_log`, `stock_movements`: UPDATE va DELETE trigger bilan '
        'taqiqlangan.',
        '- **O‘chirish harakati** (bog‘lanishlarda): CASCADE — ota o‘chsa, bola ham o‘chadi; RESTRICT va NO '
        'ACTION — bola bor ekan, ota o‘chmaydi; SET NULL — havola bo‘shatiladi.',
        '- **FK’siz havolalar** — `user_id` (kim qildi), `stock_movements.ref_id` (turli hujjat) va '
        '`counter_warehouse_id`, `sales.related_sale_id` (qaytarishdan asl chekka), `sale_items.return_of_id`, '
        '`message_recipients.client_id`: tarix buzilmasin (yozuv o‘chsa ham qoladi).',
        '',
        '## Umumiy ko‘rinish',
        '',
        'Faqat bog‘lanishlar (`tenants` ga bog‘lanish ko‘rsatilmagan — u hamma jadvalda bor). `||--o{` — bittaga '
        'ko‘p, `|o` — ota ixtiyoriy (havola bo‘sh bo‘lishi mumkin), `o|` — birga bir.',
        '',
        diagram(sorted(tables - {'_prisma_migrations', 'tenants'}), rels, rels_by_name, with_columns=False),
        '',
    ]

    for key, title, intro, members in GROUPS:
        out += [f'## {title}', '', intro, '']
        if key != 'service':
            out += [diagram(members, rels, rels_by_name), '']
        for t in members:
            rel = rels_by_name[t]
            out += [f'### `{t}`', '', TABLES[t], '']
            facts = []
            if t in tables and rel['rls']:
                facts.append('RLS: ' + ('majburiy (FORCE)' if rel['force'] else 'yoqilgan'))
            links = sorted((r for r in rels if r['child'] == t and not (r['parent'] == 'tenants')),
                           key=lambda r: r['col'])
            if links:
                facts.append('Bog‘lanishlar: ' + '; '.join(
                    f"`{r['col']}` → `{r['parent']}` ({ON_DELETE[r['on_delete']]})" for r in links))
            for tr in triggers.get(t, []):
                facts.append(f"Trigger `{tr}`: {TRIGGERS.get(tr, '')}".rstrip(': '))
            out += [f'- {f}' for f in facts] + ([''] if facts else [])
            out += [column_table(t, rel, rels, notes, enums), '']

    out += ['## Ko‘rinishlar (VIEW) va materiallashgan ko‘rinishlar', '',
            'Hisobotlar uchun. Materiallashgan ko‘rinish har kecha yangilanadi (`refresh_report_views()`); '
            'bugungi kun va eskirgan kunlar jonli ko‘rinishdan olinadi.', '']
    for v in sorted(views):
        rel = rels_by_name[v]
        kind = 'MATERIALIZED VIEW' if rel['kind'] == 'm' else 'VIEW'
        cols = ', '.join(f"`{c['name']}`" for c in rel['columns'])
        out += [f'### `{v}` ({kind})', '', VIEWS[v], '', f'Ustunlar: {cols}.', '']

    out += ['## Enumlar (qiymatlar ro‘yxati)', '', '| Enum | Qiymatlar |', '|------|-----------|']
    for name in sorted(enums):
        labels = ENUM_LABELS.get(name, {})
        vals = ', '.join(f'`{v}`' + (f' — {labels[v]}' if v in labels else '') for v in enums[name])
        out.append(f'| `{name}` | {cell(vals)} |')
    out += ['', '## Ma’lumotlar bazasi rollari', '',
            '| Rol | Kim ishlatadi | Huquq |', '|-----|---------------|-------|',
            '| `crm` | Migratsiyalar (jadval egasi) | Superuser — faqat migratsiya va favqulodda |',
            '| `crm_app` | API | Faqat joriy do‘kon qatorlari (RLS), jurnallarni o‘zgartira olmaydi |',
            '| `crm_readonly` | DBeaver — ko‘rish | Barcha do‘konlar, faqat o‘qish |',
            '| `crm_admin` | DBeaver — to‘liq | Barcha do‘konlar: o‘qish, qo‘shish, o‘zgartirish, o‘chirish (TRUNCATE va tuzilma o‘zgarishisiz) |',
            '']
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text('\n'.join(out))
    print(f'{OUT.relative_to(ROOT)}: {len(tables)} jadval, {len(views)} ko‘rinish, {len(rels)} bog‘lanish, '
          f'{len(enums)} enum')


if __name__ == '__main__':
    main()
