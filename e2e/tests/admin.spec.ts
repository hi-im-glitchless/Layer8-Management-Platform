import { test, expect } from '@playwright/test';
import { storageStateFor } from '../support/roles.js';

test.describe('Admin panel', () => {
  test.use({ storageState: storageStateFor('admin') });

  test('shows the three admin tabs', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sessions' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Audit' })).toBeVisible();
  });

  test('users tab lists the seeded E2E users', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Users' }).click();
    // The seeded admin user should appear somewhere in the users table.
    await expect(page.getByText('e2e_admin').first()).toBeVisible();
  });

  test('can switch to the Sessions tab', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Sessions' }).click();
    // Switching tabs should not navigate away or error out.
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('tab', { name: 'Sessions' })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  test('can switch to the Audit tab', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('tab', { name: 'Audit' }).click();
    await expect(page.getByRole('tab', { name: 'Audit' })).toHaveAttribute('data-state', 'active');
  });
});
