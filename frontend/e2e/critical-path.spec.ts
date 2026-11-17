import { expect, test } from '@playwright/test';

test('critical path: register -> workspace -> project -> task -> move -> comment', async ({
  page,
}) => {
  const unique = Date.now();
  const email = `e2e-${unique}@devflow.dev`;

  await page.goto('/register');
  await page.getByLabel(/full name/i).fill('E2E Tester');
  await page.getByLabel(/work email/i).fill(email);
  await page.getByLabel(/password/i).fill('TestPass123');
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel(/workspace name/i).fill(`E2E Studio ${unique}`);
  await page.getByRole('button', { name: /create workspace/i }).click();

  await expect(page).toHaveURL(/\/w\/e2e-studio/);
  await page.getByRole('button', { name: /new project/i }).click();
  await page.getByLabel(/project name/i).fill('Launch Board');
  await page.getByRole('button', { name: /create project/i }).click();

  await expect(page.getByRole('heading', { name: 'Launch Board' })).toBeVisible();

  // Create task in Backlog
  await page.getByRole('button', { name: /add task to backlog/i }).click();
  await page.getByLabel(/new task title for backlog/i).fill('Verify E2E flow');
  await page.getByLabel(/new task title for backlog/i).press('Enter');
  await expect(page.getByText('Verify E2E flow')).toBeVisible();

  // Move task to Done via accessible menu
  await page.getByRole('button', { name: /actions for/i }).first().click();
  await page.getByRole('menuitem', { name: 'Done' }).click();

  // Open task drawer and add comment
  await page.getByText('Verify E2E flow').click();
  await page.getByLabel(/write a comment/i).fill('Looks great in E2E!');
  await page.getByRole('button', { name: /^comment$/i }).click();
  await expect(page.getByText('Looks great in E2E!')).toBeVisible();
});

