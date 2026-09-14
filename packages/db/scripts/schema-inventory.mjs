// Genera docs/04-modello-dati-inventario.md dallo schema Drizzle compilato (packages/db/dist).
// Uso: node packages/db/scripts/schema-inventory.mjs   (dopo `pnpm --filter @wb/db build`; eseguito da `pnpm docs:generate`)
import { writeFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/pg-core';

const schema = await import('../dist/schema/index.js');
const modules = [
  ['Core', ['tenants', 'org_units', 'persons', 'users', 'person_history', 'role_assignments', 'naming_overrides', 'audit_log']],
  ['Obiettivi (OKR)', ['cycles', 'objectives', 'key_results', 'check_ins', 'objective_contributors']],
  ['1:1 (ONE)', ['one_on_one_relations', 'meetings', 'talking_points', 'meeting_notes', 'action_items']],
  ['Feedback e riconoscimenti (FBK)', ['company_values', 'feedback', 'feedback_requests', 'feedback_request_recipients', 'recognitions', 'recognition_recipients', 'recognition_values', 'recognition_reactions']],
  ['Notifiche e job (INT)', ['notifications', 'notification_preferences', 'email_outbox', 'job_runs']],
  ['Form engine (APP)', ['form_definitions', 'form_responses', 'form_answers']],
  ['Performance review (REV)', ['review_templates', 'review_cycles', 'reviews']],
  ['Survey (ENG)', ['surveys', 'survey_invitations', 'survey_responses']],
  ['Welfare (WEL)', ['welfare_plans', 'welfare_budget_sources', 'welfare_movements', 'welfare_categories', 'welfare_thresholds', 'welfare_catalog_items', 'welfare_requests', 'welfare_declarations', 'welfare_initiatives', 'welfare_initiative_members', 'welfare_payroll_batches', 'welfare_payroll_items']],
  ['Reportistica (ANA)', ['mart_person_facts', 'saved_reports']],
  ['Sviluppo e carriera (DEV)', ['competencies', 'job_profiles', 'competency_assessments', 'development_plans', 'development_actions', 'talent_assessments']],
  ['Feedback 360° (F360)', ['f360_campaigns', 'f360_subjects', 'f360_requests', 'f360_responses']],
];
const tables = new Map();
for (const v of Object.values(schema)) {
  if (v && typeof v === 'object' && Symbol.for('drizzle:Name') in v) {
    try { const c = getTableConfig(v); tables.set(c.name, c); } catch { /* non è una tabella */ }
  }
}
const seen = new Set();
const lines = [
  '# 04-bis — Inventario delle tabelle',
  '',
  `> Generato da \`pnpm docs:generate\` dallo schema Drizzle (\`packages/db/src/schema\`). **Non modificare a mano.** ${tables.size} tabelle; ogni tabella con \`tenant_id\` ha Row-Level Security e policy \`tenant_isolation\` (verificato da \`packages/db/src/rls.test.ts\`). Le migrazioni SQL sono in \`packages/db/drizzle\`.`,
  '',
  'Colonne comuni alle tabelle multi-tenant: `id` (uuid), `tenant_id`, `created_at`, `updated_at`, `created_by`.',
  '',
];
const common = new Set(['id', 'tenant_id', 'created_at', 'updated_at', 'created_by']);
const typeOf = (col) => col.getSQLType().replace(/timestamp with time zone/, 'timestamptz');
for (const [title, names] of modules) {
  lines.push(`## ${title}`, '');
  for (const name of names) {
    const c = tables.get(name);
    if (!c) { lines.push(`- \`${name}\`: **non trovata nello schema**`, ''); continue; }
    seen.add(name);
    const cols = c.columns.filter((x) => !common.has(x.name) || !c.columns.some((y) => y.name === 'tenant_id'));
    const idx = c.indexes.map((i) => i.config.name).filter(Boolean);
    lines.push(`### \`${name}\``, '', '| Colonna | Tipo | Note |', '|---|---|---|');
    for (const col of cols) lines.push(`| \`${col.name}\` | ${typeOf(col)} | ${[col.notNull ? 'not null' : '', col.hasDefault ? 'default' : '', col.primary ? 'PK' : ''].filter(Boolean).join(', ')} |`);
    if (idx.length) lines.push('', `Indici: ${idx.map((i) => `\`${i}\``).join(', ')}`);
    lines.push('');
  }
}
const rest = [...tables.keys()].filter((n) => !seen.has(n)).sort();
if (rest.length) {
  lines.push('## Altre tabelle', '');
  for (const name of rest) lines.push(`- \`${name}\``);
  lines.push('');
}
writeFileSync(new URL('../../../docs/04-modello-dati-inventario.md', import.meta.url), lines.join('\n'));
console.log(`[docs] 04-modello-dati-inventario.md: ${tables.size} tabelle (${rest.length} fuori mappa: ${rest.join(', ') || 'nessuna'})`);
