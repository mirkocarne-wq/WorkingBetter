import { expect, test } from '@playwright/test';
import { USERS, login } from './helpers';

test('mobile: il menu è un cassetto e le pagine non scorrono in orizzontale', async ({ page }) => {
  await login(page, USERS.employee);
  const burger = page.getByRole('button', { name: 'Apri il menu' });
  await expect(burger).toBeVisible();
  await burger.click();
  await expect(page.getByRole('link', { name: 'Welfare' })).toBeVisible();
  await page.getByRole('link', { name: 'Welfare' }).click();
  await page.waitForURL('**/welfare**');
  await expect(page.locator('.kpi .l', { hasText: 'Disponibile' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
