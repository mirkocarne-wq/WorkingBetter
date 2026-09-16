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
    // editor visuale (APP-027): diagramma con i nodi delle fasi, pannello della fase al clic, simulazione (APP-008)
    await expect(page.getByRole('heading', { name: /^Processo/ })).toBeVisible();
    await expect(page.locator('.wf-node').first()).toBeVisible();
    await page.locator('.wf-node').first().click();
    await expect(page.locator('input[name="name"]').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Simula il processo/ })).toBeVisible();
    await page.getByRole('button', { name: 'Manager del soggetto' }).click();
    await expect(page.getByText(/passaggi ·/)).toBeVisible();
  });

  test('HR: scale riutilizzabili e costruttore con condizioni e valori calcolati', async ({ page }) => {
    await login(page, USERS.hr);
    await page.goto('/forms/scales');
    await expect(page.getByRole('heading', { level: 1, name: 'Scale riutilizzabili' })).toBeVisible();
    const key = `e2e_${Date.now().toString(36)}`;
    await page.getByLabel('Nome').fill('Accordo e2e');
    await page.getByLabel('Chiave').fill(key);
    await page.locator('textarea[name="labels"]').fill('1 = Per niente\n5 = Pienamente');
    await page.getByRole('button', { name: 'Crea scala' }).click();
    await expect(page.locator('td', { hasText: 'Accordo e2e' })).toBeVisible();
    await page.goto('/forms/new?kind=generic');
    await expect(page.getByRole('heading', { level: 1, name: 'Nuovo questionario' })).toBeVisible();
    // la scala appena creata è selezionabile per una domanda a scala
    await expect(page.locator('select option', { hasText: 'Accordo e2e' }).first()).toHaveCount(1);
    await page.getByRole('button', { name: '+ Valore calcolato' }).click();
    await expect(page.getByText('riporta su scala')).toBeVisible();
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

  test('personalizzazione (sprint 26): moduli, glossario e campi persona', async ({ page }) => {
    await login(page, USERS.admin);
    // moduli: spegnere Welfare lo toglie dal menu e le sue pagine rimandano alla Home
    await page.goto('/settings/modules');
    await expect(page.getByRole('heading', { level: 1, name: 'Moduli attivi' })).toBeVisible();
    await page.getByLabel(/^Welfare/).uncheck();
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByText('Moduli aggiornati')).toBeVisible();
    await expect(page.locator('nav.nav').getByRole('link', { name: 'Welfare' })).toHaveCount(0);
    await page.goto('/welfare');
    await page.waitForURL('**/dashboard**');
    await page.goto('/settings/modules');
    await page.getByLabel(/^Welfare/).check();
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByText('Moduli aggiornati')).toBeVisible();
    await expect(page.locator('nav.nav').getByRole('link', { name: 'Welfare' })).toBeVisible();
    // glossario: «Obiettivi» → «Priorità» nel menu e nel titolo di pagina
    await page.goto('/settings/glossary');
    await expect(page.getByRole('heading', { level: 1, name: 'Glossario aziendale' })).toBeVisible();
    await page.getByLabel('Obiettivo al singolare').fill('Priorità');
    await page.getByLabel('Obiettivo al plurale').fill('Priorità');
    await page.getByRole('button', { name: 'Salva glossario' }).click();
    await expect(page.getByText('Glossario aggiornato')).toBeVisible();
    await expect(page.locator('nav.nav').getByRole('link', { name: 'Priorità' })).toBeVisible();
    await page.goto('/objectives');
    await expect(page.getByRole('heading', { level: 1, name: 'Priorità' })).toBeVisible();
    await page.goto('/settings/glossary');
    await page.getByLabel('Obiettivo al singolare').fill('');
    await page.getByLabel('Obiettivo al plurale').fill('');
    await page.getByRole('button', { name: 'Salva glossario' }).click();
    await expect(page.getByText('Glossario aggiornato')).toBeVisible();
    await expect(page.locator('nav.nav').getByRole('link', { name: 'Obiettivi' })).toBeVisible();
    // campi persona: catalogo del seed e scheda persona compilabile dall'HR
    await page.goto('/login?tenant=acme');
    await login(page, USERS.hr);
    await page.goto('/settings/person-fields');
    await expect(page.getByRole('heading', { level: 1, name: 'Campi persona' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'contract_type' })).toBeVisible();
    await page.goto('/people');
    await page.getByRole('link', { name: 'Luca Bianchi' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: /Luca Bianchi/ })).toBeVisible();
    await expect(page.getByLabel(/Tipo di contratto/)).toHaveValue('perm');
    await page.getByLabel(/Centro di costo/).fill('CC-215');
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByText('Scheda aggiornata')).toBeVisible();
    await expect(page.getByLabel(/Centro di costo/)).toHaveValue('CC-215');
    // il collaboratore vede solo i campi «all»
    await page.goto('/login?tenant=acme');
    await login(page, USERS.employee);
    await page.goto('/people');
    await page.getByRole('link', { name: 'Luca Bianchi' }).first().click();
    await expect(page.getByText('Tipo di contratto')).toBeVisible();
    await expect(page.getByText('Centro di costo')).toHaveCount(0);
  });

  test('ruoli e permessi (sprint 27): personalizzazione di un predefinito, ripristino e ruolo custom', async ({ page }) => {
    await login(page, USERS.admin);
    await page.goto('/settings/roles?role=manager');
    await expect(page.getByRole('heading', { level: 1, name: 'Ruoli e permessi' })).toBeVisible();
    const surveysTeam = page.locator('input[name="permissions"][value="surveys:results:team"]');
    await expect(surveysTeam).toBeChecked();
    await surveysTeam.uncheck();
    await page.getByRole('button', { name: 'Salva permessi' }).click();
    await expect(page.getByText('Ruolo aggiornato')).toBeVisible();
    await page.goto('/settings/roles?role=manager');
    await expect(page.locator('input[name="permissions"][value="surveys:results:team"]')).not.toBeChecked();
    await page.getByRole('button', { name: 'Ripristina i default' }).click();
    await expect(page.locator('input[name="permissions"][value="surveys:results:team"]')).toBeChecked();
    // ruolo custom del seed: visibile nell'elenco e assegnabile dagli utenti
    await page.goto('/settings/roles?role=welfare_admin');
    await expect(page.getByRole('heading', { name: /Referente welfare/ })).toBeVisible();
    await expect(page.locator('input[name="permissions"][value="welfare:manage"]')).toBeChecked();
    await expect(page.locator('input[name="permissions"][value="reviews:manage"]')).not.toBeChecked();
    await page.goto('/people/users');
    await expect(page.locator('select[name="role"] option', { hasText: 'Referente welfare' }).first()).toBeAttached();
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
