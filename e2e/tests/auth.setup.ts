import { test as setup } from '@playwright/test';
import { loginViaUI, storageStateFor, type Role } from '../support/roles.js';

/**
 * Auth setup project. Logs in once per role through the real UI and persists
 * the authenticated session (cookies) to .auth/{role}.json. Spec files then
 * reuse these via `test.use({ storageState })` so they skip the login screen.
 *
 * If any of these fail, the most likely cause is that the E2E users were not
 * seeded — run `cd backend && npm run seed:e2e`.
 */
const roles: Role[] = ['admin', 'pm', 'normal'];

// Serialize the role logins. All E2E users share one TOTP secret and the backend
// verifies the code against the exact current 30s step (no skew tolerance), so
// running these logins in parallel under fullyParallel lets a worker get starved
// during a window-rollover retry and blow the per-test timeout. One at a time,
// each login gets a clean window and full CPU.
setup.describe.configure({ mode: 'serial' });

for (const role of roles) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await loginViaUI(page, role);
    await page.context().storageState({ path: storageStateFor(role) });
  });
}
