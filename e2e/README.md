# Layer8 E2E Tests (Playwright)

Interactive browser end-to-end tests for the Layer8 Management Platform.

## Why Playwright
TypeScript-native (matches the codebase), auto-waits for the React SPA + Socket.IO
renders, reuses a logged-in session via `storageState`, intercepts network/CSRF, runs
in parallel, and ships a trace viewer for debugging failures.

## Prerequisites (the suite does NOT start the stack)

```bash
# 1. Redis
sudo systemctl start redis-server

# 2. App stack — backend :3001, frontend :5173
./launch-local.sh start

# 3. Seed the deterministic E2E users (ADMIN / PM / NORMAL, MFA disabled)
cd backend && npm run seed:e2e && cd ..
```

The E2E users (see `backend/src/scripts/seed-e2e.ts`):

| username     | role   | password          |
|--------------|--------|-------------------|
| `e2e_admin`  | ADMIN  | `E2eTestPass123!` |
| `e2e_pm`     | PM     | `E2eTestPass123!` |
| `e2e_normal` | NORMAL | `E2eTestPass123!` |

They have `totpEnabled=false` and `mustResetPassword=false` so login lands
straight on the dashboard with no MFA/onboarding interstitial.

## Install & run

```bash
cd e2e
npm install
npm run typecheck          # type-check specs (no browser needed)
npm run install:browsers   # downloads the bundled Chromium build
npm test                   # run the suite
npm run test:headed        # watch it drive a real browser
npm run test:ui            # Playwright UI mode
npm run report             # open the HTML report
```

Point at a non-default URL with `E2E_BASE_URL=http://host:port npm test`.

### Browser on unsupported OSes (e.g. Ubuntu 26.04)

Playwright ships no bundled Chromium for some very new distros, so
`install:browsers` fails with *"does not support chromium on ubuntuXX.04-x64"*.
In that case use a **system-installed browser** via the `E2E_BROWSER_CHANNEL`
env var (the config wires it into the `chromium` project):

```bash
# install a system browser once (Debian/Ubuntu example):
sudo apt-get install -y chromium            # or: chromium-browser / google-chrome-stable

# then run against it (accepts: chromium | chrome | msedge):
E2E_BROWSER_CHANNEL=chromium npm test
```

When `E2E_BROWSER_CHANNEL` is unset, the bundled Chromium is used.

## How auth works
The `setup` project (`tests/auth.setup.ts`) logs in once per role through the real
login UI and saves the session to `.auth/{admin,pm,normal}.json`. Each spec opts
into a role with `test.use({ storageState: storageStateFor('<role>') })`, so tests
start already authenticated. Re-run the seed if storage states ever go stale.

## What's covered now (core flows)
- **auth.spec.ts** — valid/invalid login, protected-route redirect, form validation
- **access-control.spec.ts** — ADMIN-only `/admin` allowed for ADMIN, blocked for NORMAL
- **dashboard.spec.ts** — authenticated dashboard shell
- **board.spec.ts** — Planner loads, all stage columns, my/all filter toggle
- **schedule.spec.ts** — schedule view loads
- **profile.spec.ts** — profile sections + editable display name
- **admin.spec.ts** — Users/Sessions/Audit tabs, seeded user listed, tab switching

## What's deferred (tracked, runnable as skips)
`tests/deferred.spec.ts` enumerates the rest of "all use cases" as `test.fixme`
stubs — MFA/TOTP, onboarding, PM schedule mutations, board card interactions
(drag-drop, modal, comments, files/virus-scan), admin user/session/audit mutations,
Socket.IO realtime (two-context), and the feature-flagged wizards. They show up in
the report as a coverage backlog. Most need seeded board/schedule data, a second
browser context, external services (ClamAV/Gotenberg/LLM), or `otplib` TOTP codes
(already a dependency).
