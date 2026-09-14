import { expect, test } from '@playwright/test';
import { USERS, login } from './helpers';

test.describe('moduli principali (seed Acme)', () => {
  test('manager: dashboard con il team, obiettivi e 1:1 con agenda', async ({ page }) => {
    await login(page, USERS.manager);
    await expect(page.getByRole('heading', { name: /Il tuo team/ })).toBeVisible();
    await page.getByRole('link', { name: 'Obiettivi' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Obiettivi' })).toBeVisible();
    await expect(page.locator('.obj').first()).toBeVisible();
    await page.getByRole('link', { name: '1:1' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: '1:1' })).toBeVisible();
    await page.locator('tbody tr a.who').first().click();
    await expect(page.getByRole('heading', { name: /^Agenda/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Quando/ })).toBeVisible();
  });

  test('HR: report, report salvati e amministrazione welfare', async ({ page }) => {
    await login(page, USERS.hr);
    await page.goto('/analytics');
    await expect(page.getByRole('heading', { level: 1, name: 'Report' })).toBeVisible();
    await expect(page.locator('.kpi').first()).toBeVisible();
    await page.getByRole('link', { name: 'Report salvati' }).click();
    await expect(page.getByRole('heading', { name: 'Report salvati' })).toBeVisible();
    await page.locator('tbody tr a').first().click();
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await page.goto('/welfare/admin');
    await expect(page.getByRole('heading', { name: /Coda di verifica/ })).toBeVisible();
  });

  test('collaboratore: welfare, sviluppo e survey', async ({ page }) => {
    await login(page, USERS.employee);
    await page.goto('/welfare');
    await expect(page.locator('.kpi .l', { hasText: 'Disponibile' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Categorie e soglie/ })).toBeVisible();
    await page.goto('/development');
    await expect(page.getByRole('heading', { name: 'Sviluppo e carriera' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Piano di sviluppo/ })).toBeVisible();
    await page.goto('/surveys');
    await expect(page.getByRole('heading', { level: 1, name: 'Survey' })).toBeVisible();
  });

  test('feedback 360°: richieste da compilare, report rilasciato con radar e campagna HR', async ({ page }) => {
    await login(page, USERS.employee);
    await page.goto('/f360');
    await expect(page.getByRole('heading', { level: 1, name: 'Feedback 360°' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Richieste ricevute/ })).toBeVisible();
    await page.getByRole('link', { name: 'Compila', exact: true }).first().click();
    await expect(page.getByRole('button', { name: 'Invia le risposte' })).toBeVisible();
    await page.goto('/f360?tab=mine');
    await page.getByRole('link', { name: 'Apri il report' }).first().click();
    await expect(page.getByRole('heading', { name: /Punti di forza/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /Radar 360°/ })).toBeVisible();
    await page.goto('/login?tenant=acme');
  });

  test('onboarding: la persona vede il proprio percorso; HR vede la dashboard', async ({ page }) => {
    await login(page, USERS.employee);
    await page.goto('/onboarding');
    await expect(page.getByRole('heading', { level: 1, name: 'Onboarding' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /I miei task di onboarding/ })).toBeVisible();
    await page.goto('/login?tenant=acme');
    await login(page, USERS.hr);
    await page.goto('/onboarding?tab=team');
    await expect(page.locator('.kpi .l', { hasText: 'Percorsi in corso' })).toBeVisible();
    await page.getByRole('link', { name: 'Apri', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: /^Percorso/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Survey di onboarding/ })).toBeVisible();
  });

  test('processi (App Studio): il manager approva una richiesta di formazione; HR vede lo studio', async ({ page }) => {
    await login(page, USERS.manager);
    await page.goto('/apps');
    await expect(page.getByRole('heading', { level: 1, name: 'Processi' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Da fare/ })).toBeVisible();
    await page.getByRole('link', { name: 'Decidi', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: /^Fasi/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approva' })).toBeVisible();
    await page.goto('/login?tenant=acme');
    await login(page, USERS.hr);
    await page.goto('/apps?tab=studio');
    await expect(page.getByRole('heading', { name: /^Le app del tenant/ })).toBeVisible();
    await page.getByRole('link', { name: 'Apri', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: /^Fasi/ })).toBeVisible();
  });

  test('HR: campagna 360° con avanzamento per soggetto', async ({ page }) => {
    await login(page, USERS.hr);
    await page.goto('/f360?tab=campaigns');
    await expect(page.getByRole('heading', { name: /^Campagne 360°/ })).toBeVisible();
    await page.getByRole('link', { name: 'Apri' }).first().click();
    await expect(page.getByRole('heading', { name: /Avanzamento per soggetto/ })).toBeVisible();
  });

  test('impostazioni: calendario, verifica in due passaggi e (admin) aspetto', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /^Verifica in due passaggi/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Calendario/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Aspetto/ })).toBeVisible();
    await page.goto('/settings/design');
    await expect(page.getByRole('heading', { name: 'Guida di stile' })).toBeVisible();
  });

  test('API: health e contratto OpenAPI pubblicati', async ({ request }) => {
    const health = await request.get('http://localhost:4000/health');
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).status).toBe('ok');
    const doc = await request.get('http://localhost:4000/docs/openapi.json');
    expect(doc.ok()).toBeTruthy();
    expect(Object.keys((await doc.json()).paths).length).toBeGreaterThan(150);
  });
});
