import { expect, test } from '@playwright/test';
import { USERS, login } from './helpers';

test.describe('accesso', () => {
  test('password errata mostra un errore, password corretta porta alla dashboard', async ({ page }) => {
    await page.goto('/login?tenant=acme');
    await page.getByLabel('Email').fill(USERS.employee);
    await page.getByLabel('Password').fill('sbagliata-sbagliata');
    await page.getByRole('button', { name: 'Entra' }).click();
    await expect(page.locator('.error')).toBeVisible();
    await login(page, USERS.employee);
    await expect(page.getByText('Luca Bianchi')).toBeVisible();
  });

  test('le pagine protette senza sessione rimandano al login', async ({ page }) => {
    await page.goto('/objectives');
    await page.waitForURL('**/login**');
  });

  test('Esci chiude la sessione', async ({ page }) => {
    await login(page, USERS.employee);
    await page.getByRole('button', { name: 'Esci' }).click();
    await page.waitForURL('**/login**');
    await page.goto('/dashboard');
    await page.waitForURL('**/login**');
  });
});
