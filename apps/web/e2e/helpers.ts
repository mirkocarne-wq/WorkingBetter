import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Password!2026';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
export const USERS = {
  admin: 'anna.colombo@acme.test',
  hr: 'chiara.moretti@acme.test',
  manager: 'giulia.ferri@acme.test',
  employee: 'luca.bianchi@acme.test',
};

/** Login con password dal form reale (tenant demo "acme" del seed). */
export async function login(page: Page, email: string) {
  await page.goto('/login?tenant=acme');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entra' }).click();
  // l'API limita i tentativi di login per IP (20 al minuto): quando la suite li esaurisce, il test entra con il dev-login
  // (stesso token di sessione, AUTH_MODE=dev) invece di aspettare un minuto e sforare il timeout del test.
  const outcome = await Promise.race([
    page.waitForURL('**/dashboard').then(() => 'ok' as const),
    page.getByText(/Riprova tra \d+ second/).waitFor({ timeout: 20_000 }).then(() => 'limited' as const).catch(() => 'ok' as const),
  ]);
  if (outcome === 'limited') {
    const res = await page.request.post(`${API_URL}/api/v1/auth/dev-login`, { data: { tenantSlug: 'acme', email } });
    expect(res.ok()).toBeTruthy();
    const { accessToken } = (await res.json()) as { accessToken: string };
    await page.context().addCookies([{ name: 'wb_token', value: accessToken, url: BASE_URL, httpOnly: true, sameSite: 'Lax' }]);
    await page.goto('/dashboard');
  }
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}
