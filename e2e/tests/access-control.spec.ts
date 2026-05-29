import { test, expect } from '@playwright/test';
import { storageStateFor } from '../support/roles.js';

// Role-based access control: ADMIN-only routes must be reachable by ADMIN and
// blocked for NORMAL (RoleProtectedRoute redirects non-admins back to "/").

test.describe('Admin route — as NORMAL (denied)', () => {
  test.use({ storageState: storageStateFor('normal') });

  test('cannot access the Admin Panel', async ({ page }) => {
    await page.goto('/admin');
    // Redirected away from /admin; Admin Panel heading never renders.
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toHaveCount(0);
  });
});

test.describe('Admin route — as ADMIN (allowed)', () => {
  test.use({ storageState: storageStateFor('admin') });

  test('can access the Admin Panel', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: 'Admin Panel' })).toBeVisible();
  });
});
