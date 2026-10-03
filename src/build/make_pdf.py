"""A4 print edition: book HTML + print stylesheet, rendered with headless Chromium (needs Noto Naskh Arabic installed)."""
import os
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
html = open(os.path.join(HERE, 'sanaa-book.html'), encoding='utf-8').read()
html = html.replace('<details class="key">', '<details class="key" open>')
css = open(os.path.join(HERE, 'print.css.html'), encoding='utf-8').read()
html = html.replace('</style>', '</style>' + css, 1)
tmp = os.path.join(HERE, '_print.html')
open(tmp, 'w', encoding='utf-8').write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body>' + html + '</body></html>')
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.emulate_media(media='print', color_scheme='light')
    pg.goto('file://' + tmp); pg.wait_for_timeout(1500)
    pg.pdf(path=os.path.join(HERE, 'sanaa-book.pdf'), format='A4', print_background=True, display_header_footer=True,
           header_template='<div></div>',
           footer_template='<div style="width:100%;font-size:8pt;color:#5d6a78;text-align:center;font-family:Noto Naskh Arabic">كتاب السنع · <span class="pageNumber"></span></div>',
           margin={'top': '16mm', 'bottom': '18mm', 'left': '15mm', 'right': '15mm'})
    b.close()
os.remove(tmp)
