"""Turn the book HTML into a JSON block list for the Word builder, and rasterize SVG figures."""
import json, os, re
from bs4 import BeautifulSoup, NavigableString, Tag
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
html = open(os.path.join(HERE, 'sanaa-book.html'), encoding='utf-8').read()
soup = BeautifulSoup(html, 'html.parser')

CHIP = {'ok': 'ok', 'warn': 'warn', 'bad': 'bad', 'lv': 'lv'}
MK = {'f': '●', 'h': '◐', 'r': '○'}


def runs(node, bold=False, italic=False):
    """Inline content -> list of runs {t, b, i, chip}"""
    out = []
    for c in node.children:
        if isinstance(c, NavigableString):
            t = str(c)
            if t:
                out.append({'t': t, 'b': bold, 'i': italic})
        elif isinstance(c, Tag):
            cls = c.get('class') or []
            if c.name in ('b', 'strong'):
                out += runs(c, True, italic)
            elif c.name == 'i':
                out += runs(c, bold, True)
            elif c.name == 'span' and 'chip' in cls:
                kind = next((CHIP[k] for k in cls if k in CHIP), 'lv')
                out.append({'t': ' [' + c.get_text(strip=True) + '] ', 'chip': kind})
            elif c.name == 'span' and 'mk' in cls:
                k = next((k for k in ('f', 'h', 'r') if k in cls), 'f')
                out.append({'t': MK[k], 'mk': k})
            elif c.name == 'a':
                out.append({'t': c.get_text(), 'link': c.get('href'), 'b': bold})
            elif c.name in ('div', 'ul', 'ol', 'details', 'svg'):
                continue
            else:
                out += runs(c, bold, italic)
    # collapse whitespace
    for r in out:
        r['t'] = re.sub(r'\s+', ' ', r['t'])
    return out


def norm(rs):
    rs = [r for r in rs if r['t'] != '']
    if rs:
        rs[0]['t'] = rs[0]['t'].lstrip()
        rs[-1]['t'] = rs[-1]['t'].rstrip()
    return [r for r in rs if r['t'] != '']


fig_n = [0]
figs = []
blocks = []


def table_rows(tbl):
    rows = []
    for tr in tbl.find_all('tr'):
        cells = []
        for td in tr.find_all(['th', 'td']):
            cells.append({'h': td.name == 'th', 'runs': norm(runs(td)), 'c': 'c' in (td.get('class') or [])})
        rows.append(cells)
    return rows


def walk(node, ctx=None):
    for c in node.children:
        if not isinstance(c, Tag):
            continue
        cls = c.get('class') or []
        n = c.name
        if n == 'svg' and 'sadu' in cls:
            continue
        if n in ('style', 'title', 'link', 'nav', 'footer'):
            if n == 'footer':
                blocks.append({'type': 'p', 'style': 'small', 'runs': norm(runs(c))})
            continue
        if n == 'header' and 'cover' in cls:
            inner = c.find(class_='inner')
            blocks.append({'type': 'cover',
                           'eyebrow': inner.find(class_='eyebrow').get_text(strip=True),
                           'title': inner.find('h1').get_text(strip=True),
                           'sub': inner.find(class_='sub').get_text(strip=True),
                           'motto': inner.find(class_='motto').get_text(strip=True),
                           'meta': [[d.find('dt').get_text(strip=True), d.find('dd').get_text(strip=True)] for d in inner.find_all('div') if d.find('dt')]})
            continue
        if n == 'section':
            blocks.append({'type': 'pagebreak'})
            walk(c)
            continue
        if 'part-head' in cls:
            num = c.find(class_='unit-num')
            eb = c.find(class_='eyebrow')
            h2 = c.find('h2')
            lead = c.find(class_='lead')
            if eb:
                blocks.append({'type': 'p', 'style': 'eyebrow', 'runs': [{'t': (num.get_text() + ' · ' if num else '') + eb.get_text(strip=True)}]})
            blocks.append({'type': 'h', 'level': 1, 'text': h2.get_text(' ', strip=True)})
            if lead:
                blocks.append({'type': 'p', 'style': 'lead', 'runs': norm(runs(lead))})
            continue
        if n in ('h3', 'h4', 'h5'):
            blocks.append({'type': 'h', 'level': {'h3': 2, 'h4': 3, 'h5': 3}[n], 'text': c.get_text(' ', strip=True)})
            continue
        if n == 'p':
            st = 'body'
            if 'verse' in cls: st = 'verse'
            elif 'quote' in cls: st = 'quote'
            elif 'src' in cls or 'small' in cls: st = 'small'
            blocks.append({'type': 'p', 'style': st, 'runs': norm(runs(c))})
            continue
        if n in ('ul', 'ol'):
            ordered = n == 'ol'
            check = 'checklist' in cls
            for li in c.find_all('li', recursive=False):
                if 'grp' in (li.get('class') or []):
                    continue
                item = {'type': 'li', 'ordered': ordered, 'check': check, 'runs': norm(runs(li))}
                opts = li.find(class_='opts')
                if opts:
                    item['opts'] = [s.get_text(strip=True) for s in opts.find_all('span')]
                blocks.append(item)
            blocks.append({'type': 'listend'})
            continue
        if 'tbl' in cls or n == 'table':
            t = c if n == 'table' else c.find('table')
            blocks.append({'type': 'table', 'rows': table_rows(t)})
            continue
        if n == 'figure':
            fig_n[0] += 1
            fid = f'fig{fig_n[0]}'
            c['data-fig'] = fid
            figs.append(fid)
            cap = c.find('figcaption')
            blocks.append({'type': 'fig', 'id': fid, 'caption': cap.get_text(strip=True) if cap else ''})
            continue
        if 'box' in cls:
            kind = next((k for k in ('asl', 'mawruth', 'law', 'act', 'edit') if k in cls), 'edit')
            tag = c.find(class_='tag')
            start = len(blocks)
            sub = BeautifulSoup('', 'html.parser')
            walk_children = [x for x in c.children if isinstance(x, Tag) and 'tag' not in (x.get('class') or [])]
            holder = blocks
            inner = []
            globals()['blocks'] = inner
            for x in walk_children:
                wrapper = BeautifulSoup('<div></div>', 'html.parser').div
                wrapper.append(x.__copy__())
                walk(wrapper)
            globals()['blocks'] = holder
            holder.append({'type': 'box', 'kind': kind, 'tag': tag.get_text(' ', strip=True) if tag else '', 'content': inner})
            continue
        if 'levels' in cls:
            cols = []
            for lv in c.find_all(class_='lvl', recursive=False):
                cols.append({'title': lv.find('h5').get_text(' ', strip=True),
                             'note': (lv.find('p').get_text(strip=True) if lv.find('p') else ''),
                             'items': [li.get_text(' ', strip=True) for li in lv.find_all('li')]})
            blocks.append({'type': 'levels', 'cols': cols})
            continue
        if 'grid2' in cls or 'prose' in cls or 'unit-band' in cls:
            walk(c)
            continue
        if 'assess' in cls:
            blocks.append({'type': 'assess_start'})
            walk(c)
            blocks.append({'type': 'assess_end'})
            continue
        if n == 'details':
            blocks.append({'type': 'h', 'level': 3, 'text': c.find('summary').get_text(strip=True)})
            walk(c.find('div'))
            continue
        if n in ('div', 'main', 'figure'):
            walk(c)
            continue


main = soup.find('main')
cover = soup.find('header', class_='cover')
walk(main)
if blocks and blocks[0]['type'] == 'cover':
    pass
json.dump(blocks, open(os.path.join(HERE, 'blocks.json'), 'w', encoding='utf-8'), ensure_ascii=False)

# rasterize figures in light theme at 2x
open(os.path.join(HERE, 'figsrc.html'), 'w', encoding='utf-8').write(
    '<!doctype html><html lang="ar"><head><meta charset="utf-8"></head><body>' + str(soup).replace(
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@400;500;600;700&amp;display=swap"/>', '') + '</body></html>')
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 900, 'height': 900}, device_scale_factor=2)
    pg.emulate_media(color_scheme='light')
    pg.goto('file://' + os.path.join(HERE, 'figsrc.html'))
    pg.wait_for_timeout(1000)
    for fid in figs:
        el = pg.locator(f'figure[data-fig="{fid}"] svg')
        el.screenshot(path=os.path.join(HERE, f'{fid}.png'), omit_background=False)
    b.close()
print(len(blocks), 'blocks;', len(figs), 'figures')
