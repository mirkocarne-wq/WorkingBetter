import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Password!2026';
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
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}
