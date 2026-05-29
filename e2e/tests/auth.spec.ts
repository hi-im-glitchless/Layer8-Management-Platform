import { test, expect } from '@playwright/test';
import { E2E_PASSWORD, USERS, FRESH_LOGIN_USER, loginWithCredentials } from '../support/roles.js';

// These tests exercise the login flow itself, so they run UNAUTHENTICATED
// (no storageState) and drive the form directly. The valid-login test uses a
// dedicated user (e2e_login) that setup never touches, so it can't collide with
// a setup login inside the per-user TOTP replay window.

test.describe('Authentication', () => {
  test('valid credentials + TOTP log in and leave the login screen', async ({ page }) => {
    await loginWithCredentials(page, FRESH_LOGIN_USER.username);
    await expect(page).not.toHaveURL(/\/login/);
    // The authenticated shell renders the dashboard's schedule section.
    await expect(page.getByRole('heading', { name: 'Your Schedule' })).toBeVisible();
  });

  test('invalid password stays on the login screen', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(USERS.normal.username);
    await page.getByLabel('Password').fill('definitely-the-wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // The app must NOT navigate away from /login on a failed attempt.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('unauthenticated visit to a protected route redirects to login', async ({ page }) => {
    await page.goto('/board');
    await expect(page).toHaveURL(/\/login/);
  });

  test('empty form shows validation and does not submit', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Username is required')).toBeVisible();
  });

  // Guard against accidentally weakening the shared password without updating the seed.
  test('shared E2E password meets complexity policy', async () => {
    expect(E2E_PASSWORD.length).toBeGreaterThanOrEqual(12);
    expect(E2E_PASSWORD).toMatch(/[a-z]/);
    expect(E2E_PASSWORD).toMatch(/[A-Z]/);
    expect(E2E_PASSWORD).toMatch(/[0-9]/);
    expect(E2E_PASSWORD).toMatch(/[^a-zA-Z0-9]/);
  });
});
