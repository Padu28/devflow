import { expect, test } from '@playwright/test';

test('demo login opens Acme Labs workspace and Kanban board', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /try the live demo/i }).click();

  await expect(page).toHaveURL(/\/w\/acme-labs/);
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();

  await page.getByRole('link', { name: /website relaunch/i }).first().click();
  await expect(page.getByRole('heading', { name: 'Website Relaunch' })).toBeVisible();
});

