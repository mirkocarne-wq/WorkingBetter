/** CSV RFC 4180 con separatore `;` (apre correttamente in Excel con locale italiano) e BOM UTF-8. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v == null) return '';
    const s = typeof v === 'number' ? v.toLocaleString('it-IT', { maximumFractionDigits: 4 }) : String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}
