"""Controllerlardan yo'l metama'lumoti: huquq, idempotentlik, If-Match, audit, rate limit ...

OpenAPI bu dekoratorlarni bilmaydi — `gen_docs.py` ularni shu yerdan oladi.
Qo'lda ishga tushirish (ro'yxatni ko'rish): `python3 scripts/api-docs/routes.py`
"""
import glob
import os
import re
from pathlib import Path


def collect(api_dir: Path) -> list[dict]:
    """`apps/api/src/modules/**/*.controller.ts` dagi har bir handler — bitta yozuv"""
    modules = str(api_dir / 'src' / 'modules')
    routes = []
    for f in sorted(glob.glob(f'{modules}/**/*.controller.ts', recursive=True)):
        s = open(f, encoding='utf-8').read()
        # Har bir controller klassi: @Controller(...) dan keyingi @Controller gacha
        starts = [m.start() for m in re.finditer(r"@Controller\(", s)]
        for idx, st in enumerate(starts):
            end = starts[idx + 1] if idx + 1 < len(starts) else len(s)
            # Klass dekoratorlari: oldingi controller tugagan joydan shu @Controller gacha
            prev_end = 0 if idx == 0 else s.rfind('\n}', 0, st)
            cls_head = s[prev_end:s.index('export class', st)]
            sect = s[st:end]
            prefix = re.match(r"@Controller\(\s*(?:'([^']*)')?", sect).group(1) or ''
            cls_public = '@Public()' in cls_head
            body = sect[sect.index('export class'):]
            # Metod imzolari (2 bo'sh joy chekinish)
            sigs = list(re.finditer(r"\n  (?:async\s+)?([a-zA-Z][a-zA-Z0-9]*)\(", body))
            last = 0
            for sm in sigs:
                name = sm.group(1)
                block = body[last:sm.start()]
                # Oldingi metod tanasi tugagan joydan boshlab
                cut = block.rfind('\n  }\n')
                if cut != -1:
                    block = block[cut + 4:]
                last = sm.end()
                hm = re.search(r"@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)", block)
                if not hm or name == 'constructor':
                    continue
                method = hm.group(1).upper()
                sub = hm.group(2) or ''
                perm = re.search(r"@RequirePermission\('([a-z]+)',\s*'([a-z]+)'\)", block)
                thr = re.search(r"@Throttle\((\{[^\n]*\})\)", block)
                http = re.search(r"@HttpCode\((\d+)\)", block)
                routes.append(dict(
                    file=os.path.relpath(f, modules),
                    method=method,
                    path='/api/v1/' + '/'.join(p for p in [prefix, sub] if p),
                    handler=name,
                    perm=f'{perm.group(1)}:{perm.group(2)}' if perm else None,
                    public=cls_public or '@Public()' in block,
                    idem='@Idempotent()' in block,
                    ifmatch='@ApiIfMatch()' in block,
                    audit=re.findall(r"@AuditAction\('([^']+)'\)", block)
                    or (['(serviceda)'] if '@AuditedInService()' in block else []),
                    readonly_ok='@AllowReadOnlyTenant()' in block,
                    manualtx='@ManualTransaction()' in block,
                    throttle=thr.group(1) if thr else None,
                    plan='@ApiPlanLimit()' in block,
                    http=http.group(1) if http else None,
                ))
    return routes


if __name__ == '__main__':
    found = collect(Path(__file__).resolve().parents[2] / 'apps' / 'api')
    print(len(found))
    for r in found:
        flags = ' '.join(k for k in ['public', 'idem', 'ifmatch', 'readonly_ok', 'manualtx', 'plan'] if r[k])
        print(f"{r['method']:6} {r['path']:48} {r['perm'] or '-':18} {flags} {r['throttle'] or ''}")
