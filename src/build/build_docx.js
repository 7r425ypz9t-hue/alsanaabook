// Builds the Word edition of «كتاب السنع» from blocks.json — full RTL, Noto Naskh Arabic, blue/gold identity.
const fs = require('fs');
const path = require('path');
const D = require('docx');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, HeadingLevel, BorderStyle, LevelFormat, PageBreak, ImageRun, Footer,
  PageNumber, TableOfContents, ExternalHyperlink,
} = D;

const HERE = __dirname;
const blocks = JSON.parse(fs.readFileSync(path.join(HERE, 'blocks.json'), 'utf8'));
const FONT = 'Noto Naskh Arabic';
const F = { ascii: FONT, hAnsi: FONT, cs: FONT, eastAsia: FONT };
const NAVY = '1F4E79', GOLD = 'B8860B', INK = '1C2633', MUTED = '5D6A78';
const TINT = { asl: 'EAF1F8', mawruth: 'F8F1DF', law: 'EEF0F3', act: 'FFFFFF', edit: 'FBFAF6' };
const EDGE = { asl: NAVY, mawruth: GOLD, law: NAVY, act: GOLD, edit: 'BFC6CE' };
const TAGC = { asl: NAVY, mawruth: GOLD, law: NAVY, act: GOLD, edit: MUTED };
const CHIPC = { ok: '2E6B4A', warn: '8A5A00', bad: '9B2C2C', lv: NAVY };
const PAGE_W = 11906, MARGIN = 1134, CONTENT_W = PAGE_W - 2 * MARGIN; // A4, 2 cm margins

const run = (t, o = {}) => new TextRun({ text: t, font: F, rightToLeft: true, size: o.size || 24,
  bold: !!o.b, italics: !!o.i, color: o.color || INK });

function runsOf(rs, base = {}) {
  return rs.map(r => {
    if (r.chip) return run(r.t, { ...base, size: Math.max((base.size || 24) - 4, 16), b: true, color: CHIPC[r.chip] });
    if (r.mk) return run(r.t, { ...base, color: r.mk === 'r' ? GOLD : NAVY });
    if (r.link) return new ExternalHyperlink({ link: r.link, children: [run(r.t, { ...base, color: NAVY })] });
    return run(r.t, { ...base, b: r.b || base.b, i: r.i || base.i });
  });
}

const SPACERS = new Set();
const spacer = () => { const p = P([], { after: 120 }); SPACERS.add(p); return p; };
const P = (children, o = {}) => new Paragraph({ bidirectional: true, alignment: o.align || AlignmentType.RIGHT,
  spacing: o.line === null ? { after: o.after ?? 120, before: o.before ?? 0 } : { after: o.after ?? 120, before: o.before ?? 0, line: o.line ?? 360 }, children, ...o.extra });

const PSTYLE = {
  body: {}, eyebrow: { size: 22, b: true, color: GOLD }, lead: { size: 26, color: MUTED },
  quote: { size: 26, b: true }, verse: { size: 26, b: true }, small: { size: 20, color: MUTED },
};

let listInstance = 0;
function para(b, br) {
  const st = PSTYLE[b.style] || {};
  const align = b.style === 'verse' ? AlignmentType.CENTER : AlignmentType.RIGHT;
  return P(runsOf(b.runs, st), { align, extra: br ? { pageBreakBefore: true } : {} });
}

function heading(b, br) {
  const lvl = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 }[b.level];
  return new Paragraph({ heading: lvl, pageBreakBefore: !!br, bidirectional: true, alignment: AlignmentType.RIGHT, children: [run(b.text, {
    size: { 1: 40, 2: 30, 3: 26 }[b.level], b: true, color: NAVY })] });
}

const thinBorder = (c = 'DFE3E8') => ({ style: BorderStyle.SINGLE, size: 4, color: c });
const allBorders = c => ({ top: thinBorder(c), bottom: thinBorder(c), left: thinBorder(c), right: thinBorder(c) });

function tableOf(rows) {
  const n = Math.max(...rows.map(r => r.length));
  // first column a bit wider when many columns of marks (matrix)
  let widths;
  const isMatrix = n >= 7;
  if (isMatrix) { const first = 3000; const rest = Math.floor((CONTENT_W - first) / (n - 1)); widths = [first, ...Array(n - 1).fill(rest)]; widths[0] = CONTENT_W - rest * (n - 1); }
  else { const w = Math.floor(CONTENT_W / n); widths = Array(n).fill(w); widths[0] = CONTENT_W - w * (n - 1); }
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, visuallyRightToLeft: true,
    rows: rows.map((r, ri) => new TableRow({ tableHeader: ri === 0 && r.every(c => c.h), cantSplit: true,
      children: r.map((c, ci) => new TableCell({
        width: { size: widths[ci], type: WidthType.DXA }, borders: allBorders(c.h ? NAVY : 'DFE3E8'),
        shading: c.h ? { fill: NAVY, type: ShadingType.CLEAR, color: 'auto' } : (ri % 2 === 0 ? { fill: 'FBFAF6', type: ShadingType.CLEAR, color: 'auto' } : undefined),
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        children: [P(runsOf(c.runs, c.h ? { b: true, color: 'FFFFFF', size: 22 } : { size: 22 }), {
          align: c.c ? AlignmentType.CENTER : AlignmentType.RIGHT, after: 0, line: 300 })],
      })) })),
  });
}

function boxOf(b) {
  const inner = [];
  if (b.tag) inner.push(P([run(b.tag, { size: 20, b: true, color: TAGC[b.kind] })], { after: 60 }));
  inner.push(...render(b.content, true));
  const edge = EDGE[b.kind];
  const borders = b.kind === 'act'
    ? { top: { style: BorderStyle.DASHED, size: 6, color: GOLD }, bottom: { style: BorderStyle.DASHED, size: 6, color: GOLD }, left: { style: BorderStyle.DASHED, size: 6, color: GOLD }, right: { style: BorderStyle.DASHED, size: 6, color: GOLD } }
    : { top: thinBorder(TINT[b.kind]), bottom: thinBorder(TINT[b.kind]), left: thinBorder(TINT[b.kind]), right: { style: BorderStyle.SINGLE, size: 18, color: edge } };
  return [new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W], visuallyRightToLeft: true,
    rows: [new TableRow({ cantSplit: false, children: [new TableCell({ width: { size: CONTENT_W, type: WidthType.DXA }, borders,
      shading: { fill: TINT[b.kind], type: ShadingType.CLEAR, color: 'auto' }, margins: { top: 120, bottom: 120, left: 200, right: 220 },
      children: inner })] })] }), spacer()];
}

function levelsOf(b) {
  const w = Math.floor(CONTENT_W / b.cols.length);
  const widths = b.cols.map((_, i) => i === 0 ? CONTENT_W - w * (b.cols.length - 1) : w);
  return [new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, visuallyRightToLeft: true,
    rows: [new TableRow({ cantSplit: true, children: b.cols.map((c, i) => new TableCell({ width: { size: widths[i], type: WidthType.DXA },
      borders: allBorders('DFE3E8'), margins: { top: 100, bottom: 100, left: 120, right: 140 },
      children: [P([run(c.title, { b: true, color: NAVY, size: 22 })], { after: 40 }),
        ...(c.note ? [P([run(c.note, { size: 18, color: MUTED })], { after: 40 })] : []),
        ...c.items.map(t => new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, numbering: { reference: 'bul', level: 0 },
          spacing: { after: 40, line: 300 }, children: [run(t, { size: 21 })] }))] })) })] }), spacer()];
}

function pngSize(file) { const buf = fs.readFileSync(file); return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), buf }; }
function figOf(b) {
  const { w, h, buf } = pngSize(path.join(HERE, b.id + '.png'));
  const maxW = 600; // px at 96dpi ≈ 15.9 cm
  const scale = Math.min(1, maxW / (w / 2));
  const W = Math.round((w / 2) * scale), H = Math.round((h / 2) * scale);
  return [P([new ImageRun({ type: 'png', data: buf, transformation: { width: W, height: H } })], { align: AlignmentType.CENTER, after: 60, line: null }),
    P([run(b.caption, { size: 19, color: MUTED })], { align: AlignmentType.CENTER, after: 200 })];
}

function render(list, inCell = false) {
  const out = [];
  let inList = false;
  let pending = false;
  for (const b of list) {
    switch (b.type) {
      case 'cover': {
        out.push(P([], { after: 1800 }));
        out.push(P([run(b.eyebrow, { size: 24, b: true, color: GOLD })], { after: 700 }));
        out.push(P([run(b.title, { size: 96, b: true, color: NAVY })], { before: 0, after: 300, line: null }));
        out.push(P([run(b.sub, { size: 32 })], { after: 200 }));
        out.push(P([run(b.motto, { size: 24, color: MUTED })], { after: 600,
          extra: { border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: GOLD, space: 12 } } } }));
        for (const [k, v] of b.meta) out.push(P([run(k + ': ', { size: 22, color: MUTED }), run(v, { size: 22, b: true })], { after: 80 }));
        out.push(new Paragraph({ children: [new PageBreak()] }));
        out.push(P([run('فهرس الكتاب', { size: 36, b: true, color: NAVY })], { after: 200 }));
        out.push(new TableOfContents('فهرس الكتاب', { hyperlink: true, headingStyleRange: '1-2' }));
        break;
      }
      case 'pagebreak': pending = true; while (out.length && SPACERS.has(out[out.length - 1])) out.pop(); break;
      case 'h': out.push(heading(b, pending)); pending = false; break;
      case 'p': if (b.runs.length) { out.push(para(b, pending)); pending = false; } break;
      case 'li': {
        if (!inList) { listInstance++; inList = true; }
        const prefix = b.check ? [run('☐ ', { b: true, color: GOLD })] : [];
        const num = b.check ? undefined : (b.ordered ? { reference: 'num', level: 0, instance: listInstance } : { reference: 'bul', level: 0 });
        out.push(new Paragraph({ bidirectional: true, alignment: AlignmentType.RIGHT, numbering: num,
          spacing: { after: b.opts ? 20 : 80, line: 340 }, children: [...prefix, ...runsOf(b.runs)] }));
        if (b.opts) out.push(P([run(b.opts.join('     '), { size: 22, color: INK })], { after: 100,
          extra: { indent: { right: 720 } } }));
        break;
      }
      case 'listend': inList = false; break;
      case 'table': out.push(tableOf(b.rows), spacer()); break;
      case 'box': out.push(...boxOf(b)); break;
      case 'levels': out.push(...levelsOf(b)); break;
      case 'fig': out.push(...figOf(b)); break;
      case 'assess_start': out.push(P([], { before: 200, after: 120, extra: { border: { top: { style: BorderStyle.SINGLE, size: 18, color: GOLD, space: 6 } } } })); break;
      case 'assess_end': break;
    }
  }
  return out;
}

const doc = new Document({
  creator: 'د. ماجد عبدالله بوشليبي', title: 'كتاب السنع', description: 'منهج تعليمي متدرج للصفوف ٦–١٢',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: F, size: 24, rightToLeft: true }, paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: F, size: 40, bold: true, color: NAVY, rightToLeft: true }, paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { before: 120, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DFE3E8', space: 8 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: F, size: 30, bold: true, color: NAVY, rightToLeft: true }, paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { before: 280, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: F, size: 26, bold: true, color: NAVY, rightToLeft: true }, paragraph: { bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { before: 200, after: 100 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.RIGHT,
      style: { paragraph: { indent: { right: 500, hanging: 300 } }, run: { color: GOLD } } }] },
    { reference: 'num', levels: [{ level: 0, format: LevelFormat.ARABIC_ABJADI === undefined ? LevelFormat.DECIMAL : LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.RIGHT,
      style: { paragraph: { indent: { right: 560, hanging: 360 } }, run: { color: NAVY, bold: true } } }] },
  ] },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } }, bidi: true },
    footers: { default: new Footer({ children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.CENTER,
      children: [run('كتاب السنع · ', { size: 18, color: MUTED }), new TextRun({ children: [PageNumber.CURRENT], font: F, size: 18, color: MUTED })] })] }) },
    children: render(blocks),
  }],
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync(path.join(HERE, 'sanaa-book.docx'), buf); console.log('docx', buf.length); });
