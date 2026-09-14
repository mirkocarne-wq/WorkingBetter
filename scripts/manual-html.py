#!/usr/bin/env python3
"""Compone docs/manuale/*.md in un unico HTML stampabile (copertina, indice, capitoli).

Uso: python3 scripts/manual-html.py [out.html]
Richiede: pip install markdown. Il PDF si genera poi con scripts/manual-pdf.mjs (Chromium via Playwright).
"""
import datetime as dt
import html
import re
import subprocess
import sys
from pathlib import Path

import markdown
from markdown.extensions.toc import TocExtension

import argparse

ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument('out', nargs='?')
ap.add_argument('--src', default=str(ROOT / 'docs' / 'manuale'))
ap.add_argument('--title', default='Manuale operativo')
ap.add_argument('--subtitle', default='Come si usa la piattaforma, per profilo, e quali regole HR il software applica da solo: visibilità, anonimato, approvazioni, calibrazione, tracciabilità.')
ARGS = ap.parse_args()
SRC = Path(ARGS.src)
OUT = Path(ARGS.out) if ARGS.out else SRC / '_build' / 'manuale.html'
# capitoli: README più i file NN-*.md in ordine
CHAPTERS = ['README.md'] + sorted(p.name for p in SRC.glob('[0-9][0-9]-*.md'))


def slug(s: str) -> str:
    s = re.sub(r'[^\w\s-]', '', s.lower()).strip()
    return re.sub(r'[\s_]+', '-', s)


def prefix_of(name: str) -> str:
    return 'ch-00' if name == 'README.md' else 'ch-' + name[:2]


def rewrite_links(md: str, this_prefix: str) -> str:
    def repl(m):
        label, target = m.group(1), m.group(2)
        if m.group(0).startswith('!'):
            # immagine: percorso relativo alla cartella del manuale, con didascalia
            return f'<figure><img src="../{target}" alt="{html.escape(label)}"><figcaption>{html.escape(label)}</figcaption></figure>'
        if target.startswith(('http://', 'https://', 'mailto:')):
            return m.group(0)
        if target.startswith('#'):
            return f'[{label}](#{this_prefix}-{target[1:]})'
        mm = re.match(r'^(README|\d\d-[a-z0-9-]+)\.md(?:#([\w-]+))?$', target)
        if mm:
            p = prefix_of(mm.group(1) + '.md')
            return f'[{label}](#{p}-{mm.group(2)})' if mm.group(2) else f'[{label}](#{p})'
        # riferimenti fuori dal manuale (specifiche, ADR, guide): restano come testo con il percorso
        clean = target.replace('../', 'docs/')
        return f'{label} (<span class="ref">{clean}</span>)'
    return re.sub(r'!?\[([^\]]*)\]\(([^)\s]+)\)', repl, md)


def render_chapter(name: str):
    text = (SRC / name).read_text(encoding='utf-8')
    prefix = prefix_of(name)
    if name == 'README.md':
        # l'indice del README duplica quello generato: si toglie dal PDF
        text = re.sub(r'^## Indice\n.*?(?=^## )', '', text, flags=re.S | re.M)
    # ancore esplicite {#id} → prefissate per evitare collisioni tra capitoli
    text = re.sub(r'\{#([\w-]+)\}', lambda m: '{#' + prefix + '-' + m.group(1) + '}', text)
    text = rewrite_links(text, prefix)
    md = markdown.Markdown(extensions=['tables', 'attr_list', 'fenced_code', 'sane_lists', TocExtension(slugify=lambda v, sep: prefix + '-' + slug(v), toc_depth='2-3')])
    body = md.convert(text)
    title = re.search(r'^# (.+)$', text, re.M).group(1)
    title = re.sub(r'\{#.*\}', '', title).strip()
    h2 = [(m.group(2).strip(), m.group(1)) for m in re.finditer(r'<h2 id="([^"]+)">(.*?)</h2>', body)]
    h2 = [(re.sub(r'<[^>]+>', '', t), i) for t, i in h2]
    # il titolo H1 diventa l'ancora del capitolo
    body = re.sub(r'<h1 id="[^"]+">', f'<h1 id="{prefix}">', body, count=1)
    return {'name': name, 'prefix': prefix, 'title': title, 'html': body, 'sections': h2}


def git_rev():
    try:
        return subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, text=True).strip()
    except Exception:
        return ''


CSS = """
@page { size: A4; margin: 22mm 18mm 20mm 18mm; }
:root { --ink: #1c2430; --ink2: #3c4858; --muted: #6b7686; --grid: #e3e8ef; --brand: #1f5fbf; --brand-soft: #e8f0fb; --warn-soft: #fff3d6; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.5 'Segoe UI', 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif; color: var(--ink); margin: 0; }
h1, h2, h3, h4 { color: var(--ink); line-height: 1.25; break-after: avoid; page-break-after: avoid; }
h1 { font-size: 24pt; margin: 0 0 6mm; padding-bottom: 3mm; border-bottom: 3px solid var(--brand); }
h2 { font-size: 15pt; margin: 9mm 0 3mm; color: var(--brand); }
h3 { font-size: 12pt; margin: 6mm 0 2mm; }
h4 { font-size: 10.5pt; margin: 4mm 0 1mm; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
p { margin: 0 0 2.6mm; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1mm; }
li > ul, li > ol { margin-top: 1mm; }
a { color: var(--brand); text-decoration: none; }
code { font: 9pt/1.3 'JetBrains Mono', 'Fira Mono', Consolas, 'Liberation Mono', monospace; background: #f3f5f8; padding: 0 3px; border-radius: 3px; }
pre { background: #f3f5f8; padding: 3mm; border-radius: 4px; overflow: hidden; white-space: pre-wrap; }
blockquote { margin: 0 0 4mm; padding: 2.5mm 4mm; border-left: 4px solid var(--brand); background: var(--brand-soft); color: var(--ink2); }
blockquote p { margin: 0; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 9.2pt; page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; break-inside: avoid; }
th, td { border: 1px solid var(--grid); padding: 1.6mm 2.2mm; vertical-align: top; text-align: left; }
th { background: #f3f5f8; font-weight: 600; }
hr { border: 0; border-top: 1px solid var(--grid); margin: 6mm 0; }
.ref { font-family: Consolas, 'Liberation Mono', monospace; font-size: 8.5pt; color: var(--muted); }
.chapter { page-break-before: always; break-before: page; }
figure { margin: 3mm 0 5mm; break-inside: avoid; page-break-inside: avoid; }
figure img { display: block; max-width: 100%; max-height: 190mm; width: auto; margin: 0 auto; border: 1px solid var(--grid); border-radius: 4px; }
figcaption { font-size: 8.8pt; color: var(--muted); text-align: center; margin-top: 1.5mm; }
.steps li { margin-bottom: 1.6mm; }
.note { border-left: 4px solid #17a389; background: #e9f7f3; padding: 2.5mm 4mm; margin: 0 0 4mm; color: var(--ink2); }
.cover { height: 250mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
.cover .kicker { color: var(--brand); font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 10pt; }
.cover h1 { border: 0; font-size: 34pt; margin: 4mm 0 2mm; }
.cover .sub { font-size: 14pt; color: var(--ink2); max-width: 140mm; }
.cover .meta { margin-top: 18mm; color: var(--muted); font-size: 9.5pt; }
.cover .brand { position: absolute; top: 0; left: 0; width: 18mm; height: 18mm; border-radius: 5mm; background: linear-gradient(135deg, #1f5fbf, #17a389); }
.toc { page-break-after: always; }
.toc h1 { font-size: 20pt; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc > ol > li { margin: 0 0 3mm; font-weight: 600; font-size: 11pt; }
.toc ol ol { margin: 1mm 0 0 6mm; }
.toc ol ol li { font-weight: 400; font-size: 9.6pt; color: var(--ink2); margin: 0 0 .6mm; }
.toc a { color: inherit; }
"""


def main():
    chapters = [render_chapter(n) for n in CHAPTERS]
    today = dt.date.today().strftime('%d/%m/%Y')
    rev = git_rev()
    toc = '<section class="toc"><h1>Indice</h1><ol>'
    for c in chapters:
        toc += f'<li><a href="#{c["prefix"]}">{html.escape(c["title"])}</a>'
        if c['sections']:
            toc += '<ol>' + ''.join(f'<li><a href="#{i}">{html.escape(t)}</a></li>' for t, i in c['sections']) + '</ol>'
        toc += '</li>'
    toc += '</ol></section>'
    body = ''.join(f'<section class="chapter" id="sec-{c["prefix"]}">{c["html"]}</section>' for c in chapters)
    cover = f"""<section class="cover" style="position:relative"><div class="brand"></div>
<div class="kicker">WorkingBetter</div><h1>{html.escape(ARGS.title)}</h1>
<div class="sub">{html.escape(ARGS.subtitle)}</div>
<div class="meta">Versione del {today}{(' · revisione ' + rev) if rev else ''} · generato da <span class="ref">{SRC.relative_to(ROOT).as_posix()}/</span></div></section>"""
    doc = f'<!doctype html><html lang="it"><head><meta charset="utf-8"><title>WorkingBetter · {html.escape(ARGS.title)}</title><style>{CSS}</style></head><body>{cover}{toc}{body}</body></html>'
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(doc, encoding='utf-8')
    print(f'[manuale] {OUT} ({len(chapters)} capitoli, {sum(len(c["sections"]) for c in chapters)} sezioni)')


if __name__ == '__main__':
    main()
