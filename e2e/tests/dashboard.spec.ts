import { test, expect } from '@playwright/test';
import { storageStateFor } from '../support/roles.js';

test.describe('Dashboard', () => {
  test.use({ storageState: storageStateFor('normal') });

  test('renders the authenticated dashboard shell', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/);
    // Dashboard sections (see Dashboard.tsx). The greeting h1 and 'Your Schedule'
    // are always rendered; the 'Recent Activity' section and the Template/Report
    // action cards are intentionally commented out ('hidden for now'), so the shell
    // check asserts the level-1 greeting heading instead.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your Schedule' })).toBeVisible();
  });
});
