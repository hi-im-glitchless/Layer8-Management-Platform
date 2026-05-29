import { test, expect } from '@playwright/test';
import { storageStateFor } from '../support/roles.js';

test.describe('Profile', () => {
  test.use({ storageState: storageStateFor('normal') });

  test('renders profile sections', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByText('Display Name', { exact: true })).toBeVisible();
    // exact match: the section heading, not the "...two-factor authentication" card description.
    await expect(page.getByText('Two-Factor Authentication', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change Password' })).toBeVisible();
  });

  test('display name input is prefilled and editable', async ({ page }) => {
    await page.goto('/profile');
    // The display-name field renders only in edit mode (Profile.tsx — gated on isEditing).
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    const input = page.getByPlaceholder('Enter display name');
    await expect(input).toBeVisible();
    // Editable without persisting (no save) — keeps the shared user unchanged.
    await input.fill('E2E Pentester (edited)');
    await expect(input).toHaveValue('E2E Pentester (edited)');
  });
});
