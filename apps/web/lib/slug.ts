/** Chiave stabile (minuscole, numeri, underscore) da un'etichetta: "Qualità tecnica" → "qualita_tecnica". */
export function slugKey(label: string, fallback = 'campo'): string {
  const s = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return /^[a-z]/.test(s) ? s : `${fallback}${s ? `_${s}` : ''}`;
}
