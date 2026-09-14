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
    // export PDF del report (F360-024) tramite il proxy con la sessione del browser
    await expect(page.getByRole('link', { name: 'Esporta PDF' })).toBeVisible();
    const pdf = await page.request.get(`/api/export?report=f360-pdf&id=${page.url().split('/').pop()}`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF');
    await page.goto('/login?tenant=acme');
  });

  test('pre-boarding esterno: un link non valido mostra la pagina di cortesia senza sessione', async ({ page }) => {
    await page.goto('/onboarding/external/questo-token-non-esiste-affatto-xx');
    await expect(page.getByText('Link non valido o scaduto')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vai a WorkingBetter' })).toBeVisible();
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

  test('review: HR imposta la catena di approvazione nel template e apre la calibrazione dal ciclo', async ({ page }) => {
    await login(page, USERS.hr);
    await page.goto('/reviews?box=cycles');
    await expect(page.getByRole('heading', { name: /^Cicli di review/ })).toBeVisible();
    await expect(page.getByText('Catena di approvazione prima della condivisione')).toBeVisible();
    await expect(page.getByLabel('Manager del manager')).toBeVisible();
    await page.getByRole('link', { name: 'Apri' }).first().click();
    await expect(page.getByRole('heading', { name: /^Calibrazione/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apri sessione' })).toBeVisible();
  });
  test('avviamento guidato: promemoria in Home, guida per profilo con passi automatici e manuali', async ({ page }) => {
    await login(page, USERS.manager);
    await expect(page.getByRole('link', { name: 'Apri la guida' })).toBeVisible();
    await page.getByRole('link', { name: 'Guida' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: /Primi passi per il manager/ })).toBeVisible();
    await expect(page.getByText('Verifica il tuo team')).toBeVisible();
    await expect(page.getByText('Preparati alla calibrazione')).toBeVisible();
    // profilo inferiore consultabile
    await page.getByRole('link', { name: 'Collaboratore' }).click();
    await expect(page.getByText('Da verificare con la persona').first()).toBeVisible();
  });
  test('impostazioni: integrazioni (calendario, Slack, Teams) visibili con i collegamenti disponibili', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /^Integrazioni/ })).toBeVisible();
    await expect(page.getByText('Il mio calendario')).toBeVisible();
    await expect(page.getByText('Configurazione delle app OAuth e del webhook (amministratori)')).toBeVisible();
    // avvio del collegamento: la route web passa dall'API e rimanda al provider (o alle impostazioni con l'errore se non configurato)
    const r = await page.request.get('/api/integrations/connect?provider=google', { maxRedirects: 0 });
    expect(r.status()).toBe(302);
    expect(r.headers()['location']).toMatch(/accounts\.google\.com|integration_error=/);
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
