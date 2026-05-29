import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Layer8 Management Platform E2E suite.
 *
 * PRECONDITIONS (the suite does NOT start the stack for you):
 *   1. Redis running:            sudo systemctl start redis-server
 *   2. App stack running:        ./launch-local.sh start   (backend :3001, frontend :5173)
 *   3. E2E users seeded:         cd backend && npm run seed:e2e
 *
 * Then from this dir:            npm install && npm run install:browsers && npm test
 *
 * The `setup` project logs in once per role (ADMIN/PM/NORMAL) and saves a
 * storageState under .auth/. Spec files opt into a role via `test.use({ storageState })`.
 */

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

// On OSes where Playwright ships no bundled Chromium (e.g. very new Ubuntu),
// point at a system-installed browser: E2E_BROWSER_CHANNEL=chrome npm test
// (also accepts: chromium, msedge). When unset, the bundled Chromium is used.
const BROWSER_CHANNEL = process.env.E2E_BROWSER_CHANNEL || undefined;

export default defineConfig({
  testDir: './tests',
  // Auth state is shared across specs; keep file-level isolation but parallelize files.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  // Generous enough that a TOTP login may wait out a 30s code window on retry.
  timeout: 75_000,
  expect: { timeout: 7_500 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Video needs Playwright's ffmpeg binary, which has no build on some new
    // OSes (e.g. Ubuntu 26.04). Opt in with E2E_VIDEO=1 after `npx playwright
    // install ffmpeg`. Screenshots + trace cover most debugging without it.
    video: process.env.E2E_VIDEO ? 'retain-on-failure' : 'off',
    actionTimeout: 10_000,
    // The dev server uses a self-signed-free localhost; nothing special needed.
  },

  projects: [
    // 1. Auth setup — produces .auth/{admin,pm,normal}.json. Must run first.
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { channel: BROWSER_CHANNEL } },

    // 2. The actual tests. Each spec selects its role's storageState via test.use().
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: BROWSER_CHANNEL },
      dependencies: ['setup'],
    },
  ],
});
