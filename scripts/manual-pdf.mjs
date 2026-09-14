#!/usr/bin/env node
/**
 * Genera il PDF del manuale operativo: docs/manuale/*.md → HTML (scripts/manual-html.py) → PDF con Chromium.
 * Uso: node scripts/manual-pdf.mjs [out.pdf]
 * Richiede: python3 con `markdown` (pip install markdown) e Playwright (`PLAYWRIGHT_PKG` oppure il pacchetto installato in apps/web).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Uso: node scripts/manual-pdf.mjs [--src docs/manuale] [--title "…"] [--subtitle "…"] [--header "…"] [out.pdf]
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const src = path.resolve(root, opt('src', 'docs/manuale'));
const title = opt('title', 'Manuale operativo');
const header = opt('header', `WorkingBetter · ${title}`);
const out = path.resolve(positional[0] ?? path.join(src, `WorkingBetter-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`));
const htmlPath = path.join(src, '_build', 'manuale.html');

const pyArgs = [path.join(root, 'scripts', 'manual-html.py'), htmlPath, '--src', src, '--title', title];
if (opt('subtitle')) pyArgs.push('--subtitle', opt('subtitle'));
execFileSync('python3', pyArgs, { stdio: 'inherit' });

async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_PKG) return import(pathToFileURL(process.env.PLAYWRIGHT_PKG).href);
  const req = createRequire(path.join(root, 'apps', 'web', 'package.json'));
  try { return await import(pathToFileURL(req.resolve('playwright')).href); } catch { /* fallthrough */ }
  return import(pathToFileURL(req.resolve('@playwright/test')).href);
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });
mkdirSync(path.dirname(out), { recursive: true });
await page.pdf({
  path: out,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  margin: { top: '22mm', right: '18mm', bottom: '20mm', left: '18mm' },
  headerTemplate: `<div style="font-size:8px;color:#6b7686;width:100%;padding:0 18mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>${header}</span><span class="date"></span></div>`,
  footerTemplate: '<div style="font-size:8px;color:#6b7686;width:100%;padding:0 18mm;text-align:right;font-family:Arial,sans-serif">pagina <span class="pageNumber"></span> di <span class="totalPages"></span></div>',
});
await browser.close();
console.log(`[manuale] PDF: ${out} (${Math.round(statSync(out).size / 1024)} KB)`);
if (!existsSync(out)) process.exit(1);
