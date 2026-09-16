#!/usr/bin/env node
/**
 * Schermate del manuale utente (docs/manuale-utente/img) dall'ambiente dimostrativo (seed «acme»).
 * Prerequisiti: API su :4000 e web su :3000 con il seed caricato; Playwright (PLAYWRIGHT_PKG o apps/web).
 * Uso: PLAYWRIGHT_PKG=… node scripts/manual-screenshots.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'manuale-utente', 'img');
mkdirSync(out, { recursive: true });
const base = process.env.WEB_URL ?? 'http://localhost:3000';
const api = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const PASSWORD = 'Password!2026';
const U = { admin: 'anna.colombo@acme.test', hr: 'chiara.moretti@acme.test', manager: 'giulia.ferri@acme.test', employee: 'luca.bianchi@acme.test', newcomer: 'elena.parisi@acme.test' };

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_PKG) return import(pathToFileURL(process.env.PLAYWRIGHT_PKG).href);
  const req = createRequire(path.join(root, 'apps', 'web', 'package.json'));
  try { return await import(pathToFileURL(req.resolve('playwright')).href); } catch { return import(pathToFileURL(req.resolve('@playwright/test')).href); }
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const texts = {};

// ---- preparazione dati via API: una review in attesa di approvazione (Andrea) per mostrare «Da approvare» ----
async function token(email) { const r = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tenantSlug: 'acme', email, password: PASSWORD }) }); return (await r.json()).accessToken; }
async function call(tok, method, p, body) { const r = await fetch(`${api}${p}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); return r.json(); }
try {
  const g = await token(U.manager);
  const team = await call(g, 'GET', '/reviews?box=team');
  const andrea = team.find((r) => r.subject?.firstName === 'Andrea' && r.status === 'pending_self');
  if (andrea) {
    // la self-review di Andrea (altrimenti la review resta in attesa della self)
    const at = await token('andrea.russo@acme.test');
    const mine = await call(at, 'GET', `/reviews/${andrea.id}`);
    if (mine.selfResponse && !mine.selfSubmittedAt) await call(at, 'POST', `/form-responses/${mine.selfResponse.id}/submit`, { answers: { highlights: 'Suite di regressione automatizzata al 60% e tempi di rilascio dimezzati.', ostacoli: 'Ambienti di test instabili nelle prime settimane.', supporto: ['tempo'], autovalutazione: 4 } });
    const d = await call(g, 'GET', `/reviews/${andrea.id}`);
    await call(g, 'POST', `/form-responses/${d.managerResponse.id}/submit`, { answers: { ownership: 4, ownership_note: 'Ha preso in carico la suite di regressione e la porta avanti in autonomia.', comunicazione: 3, qualita: 4, obiettivi_nota: 'Automazione al 60%: in linea con il piano.', punti_forza: 'Rigore tecnico e attenzione ai dettagli.', sviluppo: 'Condividere di più lo stato del lavoro con il team.' } });
    console.log('prep: review di Andrea inviata → in approvazione');
  }
} catch (e) { console.log('prep saltata:', e.message); }
// ---- preparazione: una sessione di calibrazione sul ciclo attivo (perimetro Prodotto), se non esiste ----
try {
  const h = await token(U.hr);
  const sessions = await call(h, 'GET', '/calibration-sessions');
  if (Array.isArray(sessions) && sessions.length === 0) {
    const cycles = await call(h, 'GET', '/review-cycles');
    const cycle = (Array.isArray(cycles) ? cycles : cycles.items ?? []).find((c) => c.status === 'active') ?? (Array.isArray(cycles) ? cycles : [])[0];
    const units = await call(h, 'GET', '/org-units?tree=true');
    const find = (nodes) => { for (const u of nodes) { if (u.name === 'Prodotto') return u; const f = find(u.children ?? []); if (f) return f; } return null; };
    const prodotto = find(units);
    const giulia = (await call(h, 'GET', '/people?q=giulia')).items?.[0];
    if (cycle && prodotto && giulia) {
      await call(h, 'POST', `/review-cycles/${cycle.id}/calibration-sessions`, { name: 'Calibrazione Prodotto Q3', orgUnitIds: [prodotto.id], participantPersonIds: [giulia.id], facilitatorPersonId: giulia.id, expectedDistribution: { 1: 5, 2: 20, 3: 50, 4: 20, 5: 5 } });
      console.log('prep: sessione di calibrazione creata');
    }
  }
} catch (e) { console.log('prep calibrazione saltata:', e.message); }
// ---- preparazione: un'app in bozza (template «proposta di promozione») per l'editor visuale, e una scala riutilizzabile ----
let draftAppId = null;
try {
  const h = await token(U.hr);
  const all = await call(h, 'GET', '/apps?scope=all');
  let draft = (Array.isArray(all) ? all : []).find((a) => a.status === 'draft');
  if (!draft) { const src = (Array.isArray(all) ? all : []).find((a) => a.status === 'published' && a.key === 'promotion_proposal') ?? (Array.isArray(all) ? all : []).find((a) => a.status === 'published'); if (src) { draft = await call(h, 'POST', `/apps/${src.id}/versions`); console.log('prep: nuova versione in bozza di', src.name); } }
  draftAppId = draft?.id ?? null;
  const scales = await call(h, 'GET', '/form-scales');
  if (Array.isArray(scales) && scales.length === 0) { await call(h, 'POST', '/form-scales', { key: 'accordo_5', name: 'Accordo (Likert 5)', min: 1, max: 5, labels: { 1: 'Per niente d’accordo', 3: 'Neutrale', 5: 'Del tutto d’accordo' } }); await call(h, 'POST', '/form-scales', { key: 'frequenza_5', name: 'Frequenza', min: 1, max: 5, labels: { 1: 'Raramente', 5: 'Sempre' }, allowNa: true }); console.log('prep: scale create'); }
} catch (e) { console.log('prep app/scale saltata:', e.message); }

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.25, locale: 'it-IT', timezoneId: 'Europe/Rome' });
  const page = await ctx.newPage();
  await page.goto(`${base}/login?tenant=acme`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', PASSWORD);
  await page.click('button.btn.p');
  await page.waitForURL('**/dashboard', { timeout: 20000 });
  return page;
}
async function shot(page, name, { url, click, clickText, clickLast, element, full = true, wait = 900, maxHeight = 2400 } = {}) {
  try {
    if (url) await page.goto(`${base}${url}`, { waitUntil: 'networkidle' });
    if (click) { const loc = page.locator(click).first(); await loc.waitFor({ timeout: 8000 }); await loc.click(); await page.waitForLoadState('networkidle'); }
    if (clickLast) { const loc = page.locator(clickLast).last(); await loc.waitFor({ timeout: 8000 }); await loc.click(); await page.waitForLoadState('networkidle'); }
    if (clickText) { const loc = page.locator('main .tabs a', { hasText: clickText }).first(); await loc.waitFor({ timeout: 8000 }); await loc.click(); await page.waitForLoadState('networkidle'); }
    await page.waitForTimeout(wait);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    const opts = { path: `${out}/${name}.jpg`, type: 'jpeg', quality: 72 };
    if (element) { await page.locator(element).first().scrollIntoViewIfNeeded(); await page.locator(element).first().screenshot(opts); }
    else {
      if (full && h > 800) Object.assign(opts, { clip: { x: 0, y: 0, width: 1280, height: Math.min(h, maxHeight) }, fullPage: true });
      await page.screenshot(opts);
    }
    texts[name] = { url: page.url().replace(base, ''), h1: await page.locator('main h1').first().textContent().catch(() => '') };
    console.log('ok', name);
  } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); }
}

// ---- accesso ----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.25, locale: 'it-IT' });
  const page = await ctx.newPage();
  await page.goto(`${base}/login?tenant=acme`); await page.waitForTimeout(500); await page.screenshot({ path: `${out}/00-login.jpg`, type: 'jpeg', quality: 72 });
  await page.goto(`${base}/forgot-password?tenant=acme`); await page.waitForTimeout(400); await page.screenshot({ path: `${out}/00-forgot.jpg`, type: 'jpeg', quality: 72 });
  await ctx.close();
}
// ---- collaboratore ----
let page = await login(U.employee);
await shot(page, 'emp-home', { url: '/dashboard' });
await shot(page, 'emp-guida', { url: '/inizia' });
await shot(page, 'emp-obiettivi', { url: '/objectives' });
await shot(page, 'emp-obiettivi-checkin', { url: '/objectives?view=mine', click: 'main .obj details summary' });
await shot(page, 'emp-obiettivo-nuovo', { url: '/objectives/new' });
await shot(page, 'emp-1to1', { url: '/one-on-ones' });
await shot(page, 'emp-1to1-incontro', { url: '/one-on-ones', click: 'main tbody tr a.who, main a[href^="/one-on-ones/"]' });
await shot(page, 'emp-feedback', { url: '/feedback' });
await shot(page, 'emp-feedback-ricevuti', { url: '/feedback?tab=received' });
await shot(page, 'emp-review', { url: '/reviews' });
await shot(page, 'emp-review-dettaglio', { url: '/reviews?box=mine', click: 'main tbody tr a[href^="/reviews/"]' });
await shot(page, 'emp-survey', { url: '/surveys' });
await shot(page, 'emp-survey-compila', { url: '/surveys', click: 'main a[href^="/surveys/"]' });
await shot(page, 'emp-f360', { url: '/f360' });
await shot(page, 'emp-f360-richiesta', { url: '/f360', click: 'main a[href^="/f360/requests/"]' });
await shot(page, 'emp-f360-miei', { url: '/f360?tab=mine' });
await shot(page, 'emp-f360-report', { url: '/f360?tab=mine', click: 'main a.btn:has-text("Apri il report")' });
await shot(page, 'emp-sviluppo', { url: '/development' });
await shot(page, 'emp-welfare', { url: '/welfare' });
await shot(page, 'emp-welfare-catalogo', { url: '/welfare', clickText: 'Catalogo' });
await shot(page, 'emp-welfare-richieste', { url: '/welfare', clickText: 'Richieste' });
await shot(page, 'emp-welfare-movimenti', { url: '/welfare', clickText: 'Movimenti' });
await shot(page, 'emp-processi-avvia', { url: '/apps?tab=launch' });
await shot(page, 'emp-processi-mie', { url: '/apps?tab=mine' });
await shot(page, 'emp-form', { url: '/forms' });
await shot(page, 'emp-form-compila', { url: '/forms', click: 'main a[href^="/forms/responses/"]' });
await shot(page, 'emp-notifiche', { url: '/notifications' });
await shot(page, 'emp-notifiche-preferenze', { url: '/notifications?tab=prefs' });
await shot(page, 'emp-impostazioni', { url: '/settings' });
await shot(page, 'emp-persone', { url: '/people' });
await shot(page, 'emp-persona-scheda', { url: '/people', click: 'main tbody a[href^="/people/"]:has-text("Luca Bianchi")' });
await page.context().close();
page = await login(U.newcomer);
await shot(page, 'emp-onboarding-percorso', { url: '/onboarding', maxHeight: 2000 });
await page.context().close();
// ---- manager ----
page = await login(U.manager);
await shot(page, 'mgr-home', { url: '/dashboard' });
await shot(page, 'mgr-guida', { url: '/inizia' });
await shot(page, 'mgr-obiettivi-team', { url: '/objectives?view=team' });
await shot(page, 'mgr-obiettivi-albero', { url: '/objectives?view=tree' });
await shot(page, 'mgr-1to1', { url: '/one-on-ones' });
await shot(page, 'mgr-1to1-incontro', { url: '/one-on-ones', click: 'main tbody tr a.who, main a[href^="/one-on-ones/"]' });
await shot(page, 'mgr-feedback', { url: '/feedback' });
await shot(page, 'mgr-review-team', { url: '/reviews?box=team' });
await shot(page, 'mgr-review-scrivi', { url: '/reviews?box=team', click: 'main tbody tr a.btn.p' });
await shot(page, 'mgr-review-luca', { url: '/reviews/4a643ba4-a913-4824-9616-9ab72484603a' });
await shot(page, 'mgr-review-calibrazione-list', { url: '/reviews?box=calibration' });
await shot(page, 'mgr-calibrazione', { url: '/reviews?box=calibration', click: 'main a[href^="/reviews/calibration/"]' });
await shot(page, 'mgr-sviluppo-team', { url: '/development?tab=team' });
await shot(page, 'mgr-sviluppo-persona', { url: '/development?tab=team', click: 'main a[href^="/development/people/"]' });
await shot(page, 'mgr-f360-team', { url: '/f360?tab=team' });
await shot(page, 'mgr-onboarding', { url: '/onboarding' });
await shot(page, 'mgr-onboarding-team', { url: '/onboarding?tab=team' });
await shot(page, 'mgr-onboarding-percorso', { url: '/onboarding?tab=team', click: 'main a[href^="/onboarding/journeys/"]', maxHeight: 2000 });
await shot(page, 'mgr-processi-dafare', { url: '/apps' });
await shot(page, 'mgr-processi-istanza', { url: '/apps', click: 'main a[href^="/apps/instances/"]' });
await shot(page, 'mgr-report', { url: '/analytics' });
await page.context().close();
// ---- approvatore (manager del manager) ----
page = await login(U.admin);
await shot(page, 'mgr-review-approva', { url: '/reviews?box=approvals' });
await shot(page, 'mgr-review-approva-dettaglio', { url: '/reviews?box=approvals', click: 'main tbody tr a[href^="/reviews/"]' });
// ---- amministratore: personalizzazione del tenant (sprint 26) ----
await shot(page, 'adm-impostazioni', { url: '/settings' });
await shot(page, 'adm-moduli', { url: '/settings/modules' });
await shot(page, 'adm-glossario', { url: '/settings/glossary' });
await shot(page, 'adm-ruoli', { url: '/settings/roles?role=manager', maxHeight: 1800 });
await shot(page, 'adm-ruolo-custom', { url: '/settings/roles?role=welfare_admin', maxHeight: 1800 });
await page.context().close();
// ---- HR ----
page = await login(U.hr);
await shot(page, 'hr-guida', { url: '/inizia' });
await shot(page, 'hr-persone', { url: '/people' });
await shot(page, 'hr-persona-scheda', { url: '/people', click: 'main tbody a[href^="/people/"]:has-text("Luca Bianchi")' });
await shot(page, 'hr-campi-persona', { url: '/settings/person-fields' });
await shot(page, 'hr-persone-import', { url: '/people/import' });
await shot(page, 'hr-utenti', { url: '/people/users' });
await shot(page, 'hr-obiettivi-nuovo', { url: '/objectives/new' });
await shot(page, 'hr-form', { url: '/forms' });
await shot(page, 'hr-form-nuovo', { url: '/forms/new?kind=review' });
await shot(page, 'hr-review-cicli', { url: '/reviews?box=cycles' });
await shot(page, 'hr-review-ciclo', { url: '/reviews?box=cycles', click: 'main tbody tr a[href^="/reviews/cycles/"]' });
await shot(page, 'hr-review-dettaglio', { url: '/reviews/4a643ba4-a913-4824-9616-9ab72484603a' });
await shot(page, 'hr-calibrazione', { url: '/reviews?box=calibration', click: 'main a[href^="/reviews/calibration/"]' });
await shot(page, 'hr-survey-gestione', { url: '/surveys', clickText: 'Gestione' });
await shot(page, 'hr-survey-risultati', { url: '/surveys?box=manage', clickLast: 'main a[href$="/results"]' });
await shot(page, 'hr-survey-risultati-pulse', { url: '/surveys?box=manage', click: 'main a[href$="/results"]' });
await shot(page, 'hr-f360-campagne', { url: '/f360?tab=campaigns' });
await shot(page, 'hr-f360-campagna', { url: '/f360?tab=campaigns', click: 'main a[href^="/f360/campaigns/"]' });
await shot(page, 'hr-f360-soggetto', { url: '/f360?tab=campaigns', click: 'main a[href^="/f360/campaigns/"]' }).then(() => shot(page, 'hr-f360-soggetto', { click: 'main a[href^="/f360/subjects/"]' }));
await shot(page, 'hr-sviluppo-admin', { url: '/development/admin' });
await shot(page, 'hr-sviluppo-competenze', { url: '/development/admin?tab=competencies' });
await shot(page, 'hr-sviluppo-profili', { url: '/development/admin?tab=profiles' });
await shot(page, 'hr-onboarding-persone', { url: '/onboarding?tab=team' });
await shot(page, 'hr-onboarding-template', { url: '/onboarding?tab=templates' });
await shot(page, 'hr-onboarding-template-dettaglio', { url: '/onboarding?tab=templates', click: 'main a[href^="/onboarding/templates/"]', maxHeight: 2000 });
await shot(page, 'hr-welfare-richieste', { url: '/welfare/admin' });
await shot(page, 'hr-welfare-piani', { url: '/welfare/admin', clickText: 'Piani' });
await shot(page, 'hr-welfare-catalogo', { url: '/welfare/admin', clickText: 'Catalogo' });
await shot(page, 'hr-welfare-soglie', { url: '/welfare/admin', clickText: 'Categorie e soglie' });
await shot(page, 'hr-welfare-payroll', { url: '/welfare/admin', clickText: 'Payroll' });
await shot(page, 'hr-processi-studio', { url: '/apps?tab=studio' });
await shot(page, 'hr-processi-app', { url: '/apps?tab=studio', click: 'main tbody tr a[href^="/apps/"]' , maxHeight: 2000 });
if (draftAppId) {
  await shot(page, 'hr-processi-editor', { url: `/apps/${draftAppId}`, click: 'main .wf-node', maxHeight: 1500 });
  await shot(page, 'hr-processi-simula', { url: `/apps/${draftAppId}`, clickText: null, element: 'main section:has(h3:has-text("Simula il processo"))' });
}
await shot(page, 'hr-form-scale', { url: '/forms/scales' });
await shot(page, 'hr-automazioni', { url: '/apps/automations' });
await shot(page, 'hr-automazione', { url: '/apps/automations', click: 'main tbody a[href^="/apps/automations/"]', maxHeight: 2000 });
await shot(page, 'hr-processi-nuova', { url: '/apps/new' });
await shot(page, 'hr-processi-istanze', { url: '/apps?tab=instances' });
await shot(page, 'hr-processi-istanza', { url: '/apps?tab=instances', click: 'main a[href^="/apps/instances/"]' });
await shot(page, 'hr-report', { url: '/analytics' });
await shot(page, 'hr-report-salvati', { url: '/analytics/reports' });
await shot(page, 'hr-report-salvato', { url: '/analytics/reports', click: 'main a[href^="/analytics/reports/"]:not([href$="/new"])' });
await shot(page, 'hr-report-nuovo', { url: '/analytics/reports/new' });
await shot(page, 'hr-report-processo', { url: '/analytics', click: 'main a[href^="/analytics/process/"]' });
await shot(page, 'hr-feedback-valori', { url: '/feedback' });
await page.context().close();
await browser.close();
writeFileSync(path.join(root, 'docs', 'manuale-utente', '_build', 'screenshots.json'), JSON.stringify(texts, null, 1));
console.log('done', Object.keys(texts).length);
