// Scansione delle rotte GET dell'API (docs/14 §5, docs/15 §5.5): chiama ogni GET senza parametri di percorso del contratto
// OpenAPI con i profili disponibili e segnala le risposte 5xx. Complementa scripts/smoke.mjs: non verifica i contenuti,
// verifica che nessuna rotta esploda sul database e sulla configurazione reali (es. differenze tra PGlite dei test e PostgreSQL).
// Uso: node scripts/api-sweep.mjs https://api.esempio.it
//   credenziali tenant: SMOKE_TENANT, SMOKE_EMAIL, SMOKE_PASSWORD (login con password) oppure SWEEP_DEV_LOGIN=1 (AUTH_MODE=dev)
//   altri profili facoltativi: SWEEP_EXTRA_EMAILS="manager@x.it,dip@x.it" (stessa password)
//   console: PLATFORM_EMAIL, PLATFORM_PASSWORD (facoltativi: senza, le rotte /platform vengono saltate)
const api = (process.argv[2] ?? 'http://localhost:4000').replace(/\/$/, '');
const tenant = process.env.SMOKE_TENANT ?? 'acme';
const password = process.env.SMOKE_PASSWORD ?? 'Password!2026';
const emails = [process.env.SMOKE_EMAIL ?? 'chiara.moretti@acme.test', ...(process.env.SWEEP_EXTRA_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean)];
const json = async (res) => { const text = await res.text(); try { return JSON.parse(text); } catch { return text; } };
const post = (path, body) => fetch(`${api}/api/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function tenantToken(email) {
  const r = process.env.SWEEP_DEV_LOGIN ? await post('/auth/dev-login', { tenantSlug: tenant, email }) : await post('/auth/login', { tenantSlug: tenant, email, password });
  if (!r.ok) throw new Error(`login ${email}: HTTP ${r.status}`);
  const b = await json(r);
  if (!b.accessToken) throw new Error(`login ${email}: ${b.mfaRequired ? 'richiede MFA (usa un utente senza MFA per la scansione)' : 'nessun accessToken'}`);
  return b.accessToken;
}
const profiles = [];
for (const email of emails) profiles.push({ label: email, token: await tenantToken(email) });
if (process.env.PLATFORM_EMAIL && process.env.PLATFORM_PASSWORD) {
  const r = await post('/platform/auth/login', { email: process.env.PLATFORM_EMAIL, password: process.env.PLATFORM_PASSWORD });
  if (!r.ok) throw new Error(`login piattaforma: HTTP ${r.status}`);
  profiles.push({ label: `piattaforma ${process.env.PLATFORM_EMAIL}`, token: (await json(r)).accessToken, platform: true });
}
const spec = await json(await fetch(`${api}/docs/openapi.json`));
const paths = Object.entries(spec.paths ?? {}).filter(([p, ops]) => ops.get && !p.includes('{')).map(([p]) => p);
// rotte che per natura non rispondono 2xx senza un contesto esterno (redirect verso un provider, download con parametri)
const skip = [/\/auth\/oidc\//];
let calls = 0;
const failures = [];
const statuses = new Map();
for (const path of paths) {
  if (skip.some((re) => re.test(path))) continue;
  const isPlatform = path.includes('/platform/');
  for (const pr of profiles) {
    if (isPlatform !== !!pr.platform) continue;
    calls++;
    let code;
    try {
      const r = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${pr.token}` }, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
      code = r.status;
    } catch (e) { code = `errore di rete: ${String(e.message ?? e).slice(0, 60)}`; }
    statuses.set(code, (statuses.get(code) ?? 0) + 1);
    if (typeof code !== 'number' || code >= 500) failures.push({ path, profile: pr.label, code });
  }
}
console.log(`${paths.length} rotte GET · ${profiles.length} profili · ${calls} chiamate`);
console.log('risposte:', [...statuses.entries()].map(([k, v]) => `${k}×${v}`).join('  '));
for (const f of failures) console.log(`KO  ${f.path}  [${f.profile}]  → ${f.code}`);
console.log(failures.length ? `\n${failures.length} rotte con errore server` : '\nNessuna rotta con errore server');
process.exit(failures.length ? 1 : 0);
