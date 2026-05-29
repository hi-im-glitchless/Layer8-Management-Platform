import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Shared password for all seeded E2E users — must match backend/src/scripts/seed-e2e.ts */
export const E2E_PASSWORD = 'E2eTestPass123!';

/** Fixed TOTP secret — must match E2E_TOTP_SECRET in backend/src/scripts/seed-e2e.ts. */
export const E2E_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

// Same otplib v13 config the backend uses (services/auth.ts), so generated
// codes verify against the server.
const totp = new TOTP({ crypto: new NobleCryptoPlugin(), base32: new ScureBase32Plugin() });

const TOTP_PERIOD_MS = 30_000;

/** ms remaining in the current 30s TOTP window. */
function msLeftInWindow(): number {
  return TOTP_PERIOD_MS - (Date.now() % TOTP_PERIOD_MS);
}

/**
 * Return a 6-digit code that has plenty of validity left. If the current window
 * is about to roll over (<10s left), wait for the next window first so the code
 * can't expire between generate and server verify (the backend matches the
 * current step exactly, with no skew tolerance — see verifyTOTP in
 * backend/src/services/auth.ts). The margin must comfortably exceed the
 * fill+pressSequentially+verify round-trip so a code never straddles a boundary.
 */
export async function freshTotpCode(page?: Page): Promise<string> {
  const left = msLeftInWindow();
  if (left < 10_000) {
    if (page) await page.waitForTimeout(left + 500);
    else await new Promise((r) => setTimeout(r, left + 500));
  }
  return totp.generate({ secret: E2E_TOTP_SECRET });
}

export type Role = 'admin' | 'pm' | 'normal';

export const USERS: Record<Role, { username: string; displayName: string }> = {
  admin: { username: 'e2e_admin', displayName: 'E2E Admin' },
  pm: { username: 'e2e_pm', displayName: 'E2E ProjectManager' },
  normal: { username: 'e2e_normal', displayName: 'E2E Pentester' },
};

/**
 * Dedicated user for the fresh-login test. Setup never logs in as this user,
 * so the explicit login test can't collide with a setup login inside the
 * per-user TOTP replay window (90s).
 */
export const FRESH_LOGIN_USER = { username: 'e2e_login', displayName: 'E2E LoginProbe' };

/** Absolute path to the saved storageState for a role. */
export function storageStateFor(role: Role): string {
  return path.join(__dirname, '..', '.auth', `${role}.json`);
}

/**
 * Drive the real login UI end-to-end, including the mandatory TOTP step:
 *   1. fill username/password, submit
 *   2. on the "Authentication Code" screen, enter a freshly generated code
 *   3. wait until the app leaves /login (authenticated shell)
 *
 * A code can be rejected if a 30s TOTP window boundary is crossed between
 * generate and verify, so the code step retries with a fresh code.
 */
export async function loginWithCredentials(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();

  // TOTP verification screen (totpEnabled=true → requiresTOTP).
  const codeInput = page.getByLabel('Authentication Code');
  await expect(codeInput).toBeVisible({ timeout: 10_000 });

  const verify = page.getByRole('button', { name: 'Verify' });
  let lastCode = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    // On retry, wait for a genuinely different code (next window) to dodge
    // both boundary races and the server's per-user replay block.
    let code = await freshTotpCode(page);
    while (attempt > 1 && code === lastCode) {
      await page.waitForTimeout(msLeftInWindow() + 500);
      code = await freshTotpCode(page);
    }
    lastCode = code;

    // Type digit-by-digit so the controlled input's onChange fires, then
    // confirm the value landed and Verify is enabled before clicking.
    await codeInput.fill('');
    await codeInput.pressSequentially(code, { delay: 20 });
    await expect(codeInput).toHaveValue(code);
    await expect(verify).toBeEnabled();
    await verify.click();

    try {
      await expect(page).not.toHaveURL(/\/login/, { timeout: 6_000 });
      return; // authenticated
    } catch {
      // Rejected (boundary/replay) — loop will fetch a fresh-window code.
    }
  }
  // Final assertion: surface a clear failure if still stuck on /login.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 });
}

/** Convenience wrapper for the three reusable role users. */
export async function loginViaUI(page: Page, role: Role): Promise<void> {
  await loginWithCredentials(page, USERS[role].username);
}
