// Genera docs/05-api-inventario.md dal contratto OpenAPI pubblicato (packages/api-client/openapi.json).
// Uso: node scripts/api-inventory.mjs   (eseguito da `pnpm docs:generate`; la CI verifica che sia aggiornato)
import { readFileSync, writeFileSync } from 'node:fs';

const doc = JSON.parse(readFileSync(new URL('../packages/api-client/openapi.json', import.meta.url), 'utf8'));
const byTag = new Map();
let total = 0;
for (const [path, ops] of Object.entries(doc.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    const tag = op.tags?.[0] ?? 'altro';
    const isPublic = !(op.security && op.security.length);
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push({ method: method.toUpperCase(), path: path.replace(/^\/api\/v1/, ''), summary: op.summary ?? '', isPublic });
    total++;
  }
}
const tagOrder = ['system', 'auth', 'core', 'objectives', 'one-on-ones', 'feedback', 'notifications', 'forms', 'reviews', 'surveys', 'welfare', 'analytics', 'calendar', 'development'];
const tags = [...byTag.keys()].sort((a, b) => (tagOrder.indexOf(a) === -1 ? 99 : tagOrder.indexOf(a)) - (tagOrder.indexOf(b) === -1 ? 99 : tagOrder.indexOf(b)) || a.localeCompare(b));
const lines = [
  '# 05-bis — Inventario degli endpoint API',
  '',
  `> Generato da \`pnpm docs:generate\` a partire da \`packages/api-client/openapi.json\` (contratto OpenAPI, ADR-0009). **Non modificare a mano.** ${total} operazioni su ${Object.keys(doc.paths).length} percorsi, prefisso \`/api/v1\`. La documentazione interattiva con schemi di body, query e risposte è su \`/docs\` dell'API.`,
  '',
  'Le operazioni non marcate come pubbliche richiedono il Bearer token di sessione; i permessi per ruolo sono in `packages/shared/src/auth/roles.ts` e ogni rotta è verificata dal test di invarianti (docs/06).',
  '',
];
for (const tag of tags) {
  const ops = byTag.get(tag).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  lines.push(`## ${tag} (${ops.length})`, '', '| Metodo | Percorso | Descrizione | Accesso |', '|---|---|---|---|');
  for (const o of ops) lines.push(`| \`${o.method}\` | \`${o.path}\` | ${o.summary.replace(/\|/g, '\\|')} | ${o.isPublic ? 'pubblico' : 'sessione'} |`);
  lines.push('');
}
writeFileSync(new URL('../docs/05-api-inventario.md', import.meta.url), lines.join('\n'));
console.log(`[docs] 05-api-inventario.md: ${total} operazioni in ${tags.length} gruppi`);
