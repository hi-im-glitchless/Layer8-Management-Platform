# Layer8 UI Data Seeders (Python + Selenium)

Simple, ready-to-run Python scripts that drive the **real app UI** with Selenium to
populate a realistic demo/test dataset — one script per use case. Unlike
`backend/src/scripts/seed-e2e.ts` (which writes the DB directly), these create data
the way a user would: clicking through the actual screens, so every flow is
exercised end-to-end.

## What gets created

| Script | Use case | Role used | Creates |
|--------|----------|-----------|---------|
| `seed_users.py` | Admin user management | ADMIN | demo users (pentesters + a PM) |
| `seed_clients.py` | Client management | PM | clients with colors |
| `seed_team.py` | Schedule team | **ADMIN** ¹ | adds users to the schedule grid |
| `seed_assignments.py` | Weekly assignments | PM | assignments → **auto-creates projects + board cards** |
| `seed_holidays.py` | Calendar holidays | PM | recurring holidays |
| `seed_comments.py` | Card collaboration | PM | comments on board cards |
| `seed_all.py` | — | — | runs all of the above in dependency order |

¹ The "Manage Team" add-user dropdown only loads the user list for ADMIN
(`TeamManagementPanel` uses `useUsers(hasRole('ADMIN'))`), so team seeding logs in
as `e2e_admin`.

Edit **`data.py`** to change what gets seeded (users, clients, assignments, etc.).

## Prerequisites

The seeders do **not** start the stack. First:

```bash
# 1. Redis
sudo systemctl start redis-server

# 2. App stack — backend :3001, frontend :5173
./launch-local.sh start

# 3. Seed the deterministic login users (ADMIN/PM/NORMAL, shared TOTP secret)
cd backend && npm run seed:e2e && cd ..
```

The seeders log in as those `e2e_*` users (MFA is mandatory; TOTP codes are
generated from the shared secret with `pyotp`). Keep `e2e/support/roles.ts` and
`backend/src/scripts/seed-e2e.ts` in sync with `TOTP_SECRET` in `common.py`.

## Install

This box has Python 3.14 but no system `pip`/`venv` (PEP 668 externally-managed).
Either option works:

```bash
# Option A — user install (simplest, what these were developed against):
python3 -m pip install --user --break-system-packages -r ui-seed/requirements.txt

# Option B — isolated venv (needs the distro venv package once):
sudo apt install -y python3-venv
python3 -m venv ui-seed/.venv && ui-seed/.venv/bin/pip install -r ui-seed/requirements.txt
# then run scripts with ui-seed/.venv/bin/python instead of python3
```

The Chrome driver is fetched automatically by Selenium Manager; the system
`google-chrome-stable` is used (Playwright's bundled Chromium isn't available on
this OS, which is why these use the system browser).

## Run

```bash
cd ui-seed

python3 seed_all.py          # everything, in dependency order
# or one use case at a time:
python3 seed_clients.py
python3 seed_assignments.py
```

Watch it drive a real browser instead of headless:

```bash
E2E_HEADLESS=0 python3 seed_all.py
```

### Environment overrides

| Var | Default | Meaning |
|-----|---------|---------|
| `E2E_BASE_URL` | `http://localhost:5173` | frontend URL |
| `E2E_HEADLESS` | `1` | set `0` to watch the browser |
| `E2E_CHROME_BIN` | `/usr/bin/google-chrome-stable` | Chrome binary |

## Idempotency

- `users`, `clients`, `team`, `holidays`, `comments` **skip** records that already
  exist, so they are safe to re-run.
- `seed_assignments.py` is **not** idempotent — re-running places new assignments
  in the next free week cells (creating more projects/cards). Prefer a fresh DB
  (`./launch-local.sh` reset / re-`seed:e2e`) for a clean full run.

## Notes & caveats

- **Assignment weeks are approximate.** Each assignment is dropped into the next
  free week cell of the member's row; the exact calendar week is not pinned (it
  doesn't matter for a demo dataset). `week_offset` in `data.py` is advisory.
- Cards created from `Placeholder`/`Needs-Reqs` assignments or future weeks may not
  appear in the default board view (which can filter by current week / My Projects)
  — they still exist in the data.
- Feature-flagged areas (Template Adapter, Executive Report, Document Processing)
  are skipped: those routes are gated/disabled.
- Selectors are role/label/text-based because the app uses few `data-testid`s. If
  the UI copy changes, update the matching strings in the `seed_*.py` scripts.
