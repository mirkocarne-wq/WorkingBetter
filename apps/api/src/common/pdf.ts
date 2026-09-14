import PDFDocument from 'pdfkit';

/**
 * Costruttore PDF minimale (pdfkit) per gli export di review e 360°: intestazione, sezioni, coppie chiave/valore,
 * tabelle, barre e radar vettoriale. Font standard Helvetica (nessun asset esterno), A4, italiano.
 */
export interface PdfBuilder {
  doc: PDFKit.PDFDocument;
  h1(text: string, sub?: string): void;
  h2(text: string): void;
  p(text: string, opts?: { muted?: boolean; size?: number }): void;
  kv(rows: [string, string | number | null | undefined][]): void;
  table(header: string[], rows: (string | number | null | undefined)[][], widths?: number[]): void;
  bar(label: string, value: number, max: number, right?: string): void;
  radar(axes: { label: string; values: (number | null)[] }[], series: { label: string; color: string }[], min: number, max: number): void;
  finish(): Promise<Buffer>;
}

const INK = '#1f2937';
const MUTED = '#6b7280';
const GRID = '#e5e7eb';
const BRAND = '#2563eb';
const fmt = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : String(v));

export function createPdf(meta: { title: string; author?: string }): PdfBuilder {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: meta.title, Author: meta.author ?? 'WorkingBetter', Creator: 'WorkingBetter' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  const width = () => doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const ensure = (h: number) => { if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage(); };
  const footer = () => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor(MUTED).text(`${meta.title} · pagina ${i - range.start + 1} di ${range.count} · generato il ${new Date().toLocaleDateString('it-IT')}`, doc.page.margins.left, doc.page.height - 36, { width: width(), align: 'center' });
    }
  };
  return {
    doc,
    h1(text, sub) {
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(text);
      if (sub) doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(sub);
      doc.moveDown(0.6);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + width(), doc.y).strokeColor(BRAND).lineWidth(1.5).stroke();
      doc.moveDown(0.8);
    },
    h2(text) { ensure(40); doc.moveDown(0.4); doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(text); doc.moveDown(0.3); },
    p(text, opts = {}) { ensure(20); doc.fillColor(opts.muted ? MUTED : INK).font('Helvetica').fontSize(opts.size ?? 10).text(text, { width: width() }); doc.moveDown(0.3); },
    kv(rows) {
      for (const [k, v] of rows) {
        ensure(16);
        const y = doc.y;
        doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(k, doc.page.margins.left, y, { width: 150 });
        doc.fillColor(INK).font('Helvetica').fontSize(10).text(fmt(v), doc.page.margins.left + 156, y, { width: width() - 156 });
        doc.moveDown(0.2);
      }
      doc.moveDown(0.4);
    },
    table(header, rows, widths) {
      const w = width();
      const cols = widths ?? header.map(() => w / header.length);
      const draw = (cells: (string | number | null | undefined)[], bold: boolean) => {
        ensure(18);
        const y = doc.y;
        let x = doc.page.margins.left;
        let maxH = 0;
        cells.forEach((c, i) => {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(bold ? MUTED : INK);
          const h = doc.heightOfString(fmt(c), { width: cols[i]! - 6 });
          doc.text(fmt(c), x + 3, y + 3, { width: cols[i]! - 6 });
          maxH = Math.max(maxH, h);
          x += cols[i]!;
        });
        doc.y = y + maxH + 7;
        doc.moveTo(doc.page.margins.left, doc.y - 1).lineTo(doc.page.margins.left + w, doc.y - 1).strokeColor(GRID).lineWidth(0.5).stroke();
      };
      draw(header, true);
      for (const r of rows) draw(r, false);
      doc.moveDown(0.5);
    },
    bar(label, value, max, right) {
      ensure(22);
      const y = doc.y;
      const w = width();
      doc.fillColor(INK).font('Helvetica').fontSize(9).text(label, doc.page.margins.left, y, { width: 170 });
      const bx = doc.page.margins.left + 176;
      const bw = w - 176 - 60;
      doc.rect(bx, y + 2, bw, 8).fillColor(GRID).fill();
      doc.rect(bx, y + 2, Math.max(0, Math.min(1, value / max)) * bw, 8).fillColor(BRAND).fill();
      doc.fillColor(MUTED).fontSize(9).text(right ?? fmt(value), bx + bw + 6, y, { width: 54, align: 'right' });
      doc.y = y + 16;
    },
    radar(axes, series, min, max) {
      const n = axes.length;
      if (n < 3) return;
      ensure(260);
      const size = 230;
      const cx = doc.page.margins.left + width() / 2;
      const cy = doc.y + size / 2 + 10;
      const r = size / 2 - 30;
      const span = Math.max(1, max - min);
      const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; const rr = (Math.max(0, Math.min(1, (v - min) / span))) * r; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)] as const; };
      for (let lvl = min + 1; lvl <= max; lvl++) { axes.forEach((_, i) => { const [x, y] = pt(i, lvl); if (i === 0) doc.moveTo(x, y); else doc.lineTo(x, y); }); doc.closePath().strokeColor(GRID).lineWidth(0.5).stroke(); }
      axes.forEach((a, i) => { const [x, y] = pt(i, max); doc.moveTo(cx, cy).lineTo(x, y).strokeColor(GRID).lineWidth(0.5).stroke(); const [lx, ly] = pt(i, max + span * 0.18); doc.fillColor(MUTED).fontSize(7).text(a.label, lx - 40, ly - 4, { width: 80, align: 'center' }); });
      series.forEach((s, si) => {
        let started = false;
        axes.forEach((a, i) => { const v = a.values[si]; if (v == null) return; const [x, y] = pt(i, v); if (!started) { doc.moveTo(x, y); started = true; } else doc.lineTo(x, y); });
        if (started) doc.closePath().strokeColor(s.color).lineWidth(1.5).stroke();
      });
      doc.y = cy + r + 30;
      let lx = doc.page.margins.left;
      series.forEach((s) => { doc.rect(lx, doc.y + 2, 10, 4).fillColor(s.color).fill(); doc.fillColor(MUTED).fontSize(8).text(s.label, lx + 14, doc.y, { width: 120 }); lx += 130; doc.y -= 10; });
      doc.moveDown(1.2);
    },
    async finish() {
      footer();
      doc.end();
      return done;
    },
  };
}
