// Renderizza i mockup HTML in PNG. Uso: node render.mjs   (richiede playwright + Chromium preinstallato)
const { chromium } = await import(process.env.PLAYWRIGHT_PKG ?? 'playwright');
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const dir = new URL('.', import.meta.url).pathname;
const files = readdirSync(dir).filter(f => /^\d\d-.*\.html$/.test(f)).sort();
const browser = await chromium.launch();
for (const f of files) {
  const mobile = f.includes('mobile');
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await page.goto('file://' + resolve(dir, f));
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(dir, 'png', f.replace('.html', '.png')) });
  console.log('✓', f);
  await page.close();
}
await browser.close();
