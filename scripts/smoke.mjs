// Smoke test post-deploy (docs/14): verifica health, login, contratto OpenAPI e qualche endpoint per ruolo.
// Uso: node scripts/smoke.mjs https://api.esempio.it [https://app.esempio.it]  (credenziali via SMOKE_TENANT, SMOKE_EMAIL, SMOKE_PASSWORD)
const api = (process.argv[2] ?? 'http://localhost:4000').replace(/\/$/, '');
const web = (process.argv[3] ?? '').replace(/\/$/, '');
const tenant = process.env.SMOKE_TENANT ?? 'acme';
const email = process.env.SMOKE_EMAIL ?? 'chiara.moretti@acme.test';
const password = process.env.SMOKE_PASSWORD ?? 'Password!2026';
const results = [];
const check = async (name, fn) => {
  const t0 = Date.now();
  try { const detail = await fn(); results.push({ name, ok: true, ms: Date.now() - t0, detail: detail ?? '' }); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, detail: String(e.message ?? e) }); }
};
const json = async (res) => { const text = await res.text(); try { return JSON.parse(text); } catch { return text; } };
const expectOk = (res, what) => { if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`); return res; };

let token = null;
await check('API /health', async () => { const h = await json(expectOk(await fetch(`${api}/health`), 'health')); if (h.db !== 'ok') throw new Error(`db=${h.db}`); return `v${h.version} · db ${h.dbLatencyMs} ms · job: ${(h.jobs ?? []).map((j) => `${j.job}=${j.status}`).join(' ')}`; });
await check('API /health/ready', async () => { expectOk(await fetch(`${api}/health/ready`), 'ready'); });
await check('OpenAPI pubblicato', async () => { const d = await json(expectOk(await fetch(`${api}/docs/openapi.json`), 'openapi')); return `${Object.keys(d.paths ?? {}).length} percorsi`; });
await check('Login con password', async () => {
  const r = await fetch(`${api}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantSlug: tenant, email, password }) });
  const b = await json(expectOk(r, 'login'));
  token = b.accessToken; if (!token) throw new Error('nessun accessToken');
  return `${email} @ ${tenant}`;
});
const auth = { authorization: `Bearer ${token}` };
for (const [name, path] of [['/me', '/me'], ['Persone', '/people?limit=5'], ['Obiettivi', '/objectives?limit=5'], ['Notifiche', '/notifications?limit=5'], ['Report', '/analytics/metrics'], ['Integrazioni', '/integrations'], ['Processi', '/apps/instances?box=todo']]) {
  await check(`GET ${name}`, async () => { if (!token) throw new Error('login fallito'); const r = expectOk(await fetch(`${api}/api/v1${path}`, { headers: auth }), path); const b = await json(r); return Array.isArray(b) ? `${b.length} righe` : b.items ? `${b.items.length} righe` : 'ok'; });
}
await check('Header di sicurezza', async () => { const r = await fetch(`${api}/health`); for (const h of ['x-content-type-options', 'x-frame-options']) if (!r.headers.get(h)) throw new Error(`manca ${h}`); return 'nosniff, frame-options'; });
await check('Rotta protetta senza token → 401', async () => { const r = await fetch(`${api}/api/v1/me`); if (r.status !== 401) throw new Error(`atteso 401, ricevuto ${r.status}`); });
if (web) {
  await check('Web /login', async () => { const r = expectOk(await fetch(`${web}/login?tenant=${tenant}`), 'web login'); const html = await r.text(); if (!/WorkingBetter/.test(html)) throw new Error('pagina inattesa'); });
  await check('Web pagina protetta → redirect', async () => { const r = await fetch(`${web}/dashboard`, { redirect: 'manual' }); if (![302, 307].includes(r.status)) throw new Error(`atteso redirect, ricevuto ${r.status}`); });
}
const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.ok ? 'OK ' : 'KO '} ${r.name.padEnd(width)}  ${String(r.ms).padStart(5)} ms  ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} controlli falliti` : `\nTutti i ${results.length} controlli superati`);
process.exit(failed ? 1 : 0);
