#!/usr/bin/env bash
# PLAN.md dagi vazifani bajarilgan deb belgilaydi va epik hisobini yangilaydi.
#   ./scripts/task.sh done T-007        -> [x] qiladi
#   ./scripts/task.sh status            -> umumiy holat
set -euo pipefail
PLAN="$(cd "$(dirname "$0")/.." && pwd)/PLAN.md"

recount() {
  python3 - "$PLAN" <<'PY'
import re, sys, pathlib
p = pathlib.Path(sys.argv[1]); lines = p.read_text(encoding='utf-8').splitlines()
counts, ep = {}, None
for ln in lines:
    m = re.match(r'^## (E\d+) —', ln)
    if m: ep = m.group(1); counts.setdefault(ep, [0, 0])
    if ep and re.match(r'^- \[[ x]\] \*\*T-', ln):
        counts[ep][1] += 1
        if ln.startswith('- [x]'): counts[ep][0] += 1
out, td, tt = [], 0, 0
for ln in lines:
    m = re.match(r'^\| (E\d+) \| (.+?) \| (\d+) \| \d+/\d+ \| (\w+) \|$', ln)
    if m and m.group(1) in counts:
        d, t = counts[m.group(1)]; td += d; tt += t
        ln = f"| {m.group(1)} | {m.group(2)} | {t} | {d}/{t} | {m.group(4)} |"
    out.append(ln)
out = [re.sub(r'^\| \| \*\*Jami\*\* \| \*\*\d+\*\* \| \*\*\d+/\d+\*\* \| \|$',
              f'| | **Jami** | **{tt}** | **{td}/{tt}** | |', ln) for ln in out]
p.write_text('\n'.join(out) + '\n', encoding='utf-8')
print(f'holat: {td}/{tt} vazifa bajarildi')
PY
}

case "${1:-status}" in
  done)
    id="${2:?vazifa raqami kerak, masalan T-007}"
    grep -q -- "- \[ \] \*\*${id} " "$PLAN" || { echo "topilmadi yoki allaqachon belgilangan: $id"; exit 1; }
    sed -i "s|^- \[ \] \*\*${id} |- [x] **${id} |" "$PLAN"
    echo "✓ ${id} belgilandi"; recount ;;
  undone)
    id="${2:?vazifa raqami kerak}"
    sed -i "s|^- \[x\] \*\*${id} |- [ ] **${id} |" "$PLAN"
    echo "○ ${id} qaytarildi"; recount ;;
  status) recount ;;
  next) grep -m1 -- '- \[ \] \*\*T-' "$PLAN" ;;
  *) echo "foydalanish: $0 {done|undone|status|next} [T-NNN]"; exit 1 ;;
esac
