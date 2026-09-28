"""docs/api tekshiruvi: fayllar orasidagi havolalar (anchor bilan) va jadval ustunlari.

GFM jadvalida kod ichidagi `|` ham ustunni bo'ladi — ustunlar soni sarlavhadan
farq qilsa, jadval buziladi. Muammo bo'lsa chiqish kodi 1.
"""
import re
import sys
from pathlib import Path

DOCS = Path(__file__).resolve().parents[2] / 'docs' / 'api'
FILES = ['README.md', 'endpoints.md', 'schemas.md']
PIPE = re.compile(r'(?<!\\)\|')
SEPARATOR = re.compile(r'^\|[\s:|-]+\|$')


def anchors(text: str) -> set[str]:
    found = set(re.findall(r'<a id="([^"]+)"></a>', text))
    for heading in re.findall(r'^#{1,6} (.+)$', text, re.M):
        slug = re.sub(r'<[^>]+>', '', heading).strip().lower()
        found.add(re.sub(r'[^\w\- ]', '', slug).replace(' ', '-'))
    return found


def broken_links(texts: dict[str, str]) -> list[str]:
    known = {name: anchors(text) for name, text in texts.items()}
    problems = []
    for name, text in texts.items():
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if target.startswith('http'):
                continue
            path, _, fragment = target.partition('#')
            dest = path or name
            if dest not in texts:
                problems.append(f'{name}: fayl yo‘q — {target}')
            elif fragment and fragment not in known[dest]:
                problems.append(f'{name}: anchor yo‘q — {target}')
    return problems


def broken_tables(name: str, text: str) -> list[str]:
    lines = text.split('\n')
    problems = []
    in_code = False
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith('```'):
            in_code = not in_code
        if not in_code and line.startswith('|') and i + 1 < len(lines) and SEPARATOR.match(lines[i + 1]):
            columns = len(PIPE.findall(line))
            j = i + 2
            while j < len(lines) and lines[j].startswith('|'):
                if len(PIPE.findall(lines[j])) != columns:
                    problems.append(f'{name}:{j + 1}: ustunlar soni {columns} emas — {lines[j][:80]}')
                j += 1
            i = j
            continue
        i += 1
    return problems


if __name__ == '__main__':
    texts = {name: (DOCS / name).read_text(encoding='utf-8') for name in FILES}
    issues = broken_links(texts) + [p for name, text in texts.items() for p in broken_tables(name, text)]
    for issue in issues:
        print(issue)
    print(f'docs/api: {len(issues)} ta muammo')
    sys.exit(1 if issues else 0)
