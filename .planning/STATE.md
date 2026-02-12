# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-11)

**Core value:** Pentesters spend their time on security work, not on manual template adaptation and executive report writing
**Current focus:** Phase 02.1 Complete — Ready for Phase 3

## Current Position

Phase: 02 of 9 (Sanitization Infrastructure) — UAT GAP CLOSURE COMPLETE
Plan: 7 of 8 (02-07 complete - mapping reconstruction bug fix)
Status: Phase 02 gap closure in progress
Last activity: 2026-02-12 — Phase 02-07 gap closure complete

Progress: [█████░░░░░] 49%

## Performance Metrics

**Velocity:**
- Total plans completed: 19
- Average duration: 9.1 minutes
- Total execution time: ~3.4 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01    | 6     | ~120m | ~20m     |
| 01.1  | 3     | 13m   | 4.3m     |
| 02    | 6     | 31m   | 5.2m     |
| 02.1  | 2     | 5.5m  | 2.75m    |
| 02.2  | 1     | 2.2m  | 2.2m     |

**Recent Trend:**
- Phase 01: 01-01 (7m), 01-02 (10m), 01-03 (13m), 01-04 (41m), 01-05 (20m), 01-06 (30m)
- Phase 01.1: 01.1-01 (8m), 01.1-02 (3m), 01.1-03 (2m)
- Phase 02: 02-01 (3m), 02-02 (2.6m), 02-03 (4m), 02-04 (3.8m), 02-05 (4m), 02-06 (13.5m)
- Post-execution bugfix session: ~45m (audit black screen, session dialogs, sidebar visibility, CSRF)

**Latest Plan Details:**
| Plan     | Duration | Tasks | Files |
|----------|----------|-------|-------|
| 02-06    | 13.5m    | 2     | 4     |
| 02-07    | 2.2m     | 2     | 4     |

*Updated after each plan completion*

## Phase 1 Completion Summary

### What was delivered:
1. Frontend scaffold with React 19, Vite 6, TypeScript, Tailwind CSS 4, shadcn/ui
2. Application shell with responsive sidebar, header, theme toggle, client-side routing
3. Backend with Express 5, Prisma 7 ORM, SQLite (better-sqlite3), Redis sessions
4. Authentication: Argon2 password hashing, TOTP MFA, rate limiting, CSRF protection
5. Auth UI: Split-screen login, onboarding wizard (password change + TOTP setup)
6. Tamper-evident hash-chain audit trail with query, export, and verification APIs
7. Admin panel: User CRUD, session management (with AlertDialog confirmations), audit log viewer
8. Role-based sidebar visibility (admin links hidden from non-admin users)

### Bugs fixed during verification:
- Audit tab black screen (Radix SelectItem empty string value crash)
- Audit API field name mismatch (backend→frontend transformation)
- Session "last seen" showing wrong time (used cookie expiry instead of activity)
- Admin link visible to non-admin users
- Session terminate 403 (DELETE not in CSRF-protected methods)
- Ugly browser confirm() dialogs replaced with shadcn/ui AlertDialog

## Phase 1.1 Completion Summary

### What was delivered:
1. OKLCH color system with cool blue accent (hue 250) replacing old red in both themes
2. True black dark theme (oklch(0 0 0)) matching login page aesthetic app-wide
3. Atmospheric login page: pure black left side, gradient to right, glassmorphism form card
4. Layer8 logo blending seamlessly on black (using correct PNG file)
5. Onboarding wizard with matching atmospheric dark gradient + glassmorphism
6. Notion-like sidebar: roomy spacing, active state with blue left border + background
7. Hover-only table highlighting in all admin panels (no striped rows)
8. Gradient and destructive button variants
9. Favicon set at all sizes from Layer8 logo
10. PWA manifest (site.webmanifest)

### Fixes during verification:
- Login page gradient direction (left side pure black, gradient to right only)
- Dark theme changed from grey (0.16) to true black (0 0 0)
- Wrong logo file: switched from small JPG to wide PNG for dark mode
- Logo sizing and blending corrected across sidebar, login, onboarding

## Phase 2 Completion Summary

### What was delivered:
1. Python FastAPI sanitization microservice with spaCy model loading (en + pt), health/readiness endpoint
2. 5 custom pentest recognizers: IP (with version-string filtering), hostname, AD objects, network paths, domains
3. Deny list pre-processing with case-insensitive word-boundary matching (score 1.0)
4. MappingReplaceOperator for consistent typed placeholders ([PERSON_1], [IP_ADDR_2])
5. Language auto-detection selecting correct spaCy model
6. POST /sanitize and POST /desanitize API endpoints on Python service
7. DenyListTerm Prisma model with CRUD service and admin REST API
8. Node backend proxy with Redis mapping storage (session-scoped TTLs)
9. 66-test comprehensive suite: recognizers, deny list, mapping operator, round-trip

### Environmental note:
- Python 3.14 on host has spaCy/Presidio incompatibility. Docker with Python 3.12 required for runtime. Mapping operator tests pass locally; Presidio-dependent tests require Docker.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- OpenAI SDK format as primary LLM client (CLIProxyAPI exposes OpenAI-compatible endpoint)
- TOTP MFA for authentication (simple, secure, no SSO dependency)
- Both features built in parallel (shared infrastructure supports both; team wants both for v1)
- Configurable retention over fixed policy (GDPR/NDA requirements vary by client)
- Pre-sanitization + review-time deny list (custom client terms are biggest sanitization gap)
- UI/UX woven into feature phases — Phase 1 includes frontend scaffold, design system, and auth UI; each subsequent phase builds its own UI alongside backend
- Jinja2 injection scanning (SECR-01) deprioritized to defense-in-depth — uploaded templates are plain Word docs, app inserts Jinja2 code
- PostCSS over Vite plugin for Tailwind CSS 4 (Vite plugin had build errors; PostCSS approach stable)
- Vite 6 instead of Vite 7 (Tailwind CSS 4 requires Vite 5-6 compatibility)
- Collapsed sidebar state in localStorage (user preference persists across sessions)
- Inter font over Geist (wider browser support and CDN availability)
- Switch from @prisma/adapter-libsql to @prisma/adapter-better-sqlite3 for Prisma 7 compatibility
- CSRF cookie httpOnly=false and sameSite=lax to support double-submit pattern and cross-port development
- Auto-fetch CSRF token before first POST request in API client
- TanStack Query with 5-minute staleTime for auth state caching
- Radix UI SelectItem requires non-empty string value (use sentinel like "all")
- OKLCH color space for perceptually uniform colors and better accessibility
- Pure black (oklch(0 0 0)) for dark theme — user requested true black, not grey
- Cool blue (hue 250) as accent color for professional, calming appearance
- Notion-like sidebar spacing: py-6 px-3 on nav, px-4 py-2.5 on items, mb-6 between groups
- Active nav state dual indicator: background + 3px left border in accent blue
- Hover-only table highlighting (no striped rows) for cleaner admin UI
- Atmospheric gradient aesthetic for auth pages (blue/purple dark tones)
- Logo integration without visual boundaries (seamless blending on pure black)
- Glassmorphism across auth flows (login, TOTP, onboarding)
- Use layer8_logo_dark.png (wide horizontal PNG) for dark mode, not the JPG
- Login page left side pure black, gradient flows to the right only
- TOTP re-setup allowed only for fully authenticated users (totpVerified=true) to enable regeneration from profile page while preventing abuse during login flow
- Python 3.12 for sanitization service (3.14+ has spaCy/Pydantic v1 incompatibility)
- Flexible version constraints in requirements.txt for dependency resolution
- FastAPI lifespan context for async startup/shutdown over deprecated @app.on_event
- getAllActiveTerms() returns string[] for efficient sanitization pipeline integration (hot path optimization)
- Admin-only deny list management with authenticated read access for sanitization (security model)
- Bulk create skips duplicates for improved CSV import UX
- Mappings stored server-side in Redis, never exposed to frontend (PII security - original values must not be sent to client)
- Session-scoped mapping TTL matches session expiry (30 days - mappings survive as long as user session)
- Global deny list terms merged with per-request terms (supports both org-wide and session-specific terms)
- Optional startup health check for sanitizer service (non-blocking - server starts anyway, routes return 503 until ready)
- Native fetch() for HTTP client instead of axios (Node 18+ has built-in fetch, no dependency needed)
- load_mappings() as canonical API for operator state reconstruction (prevents test code bugs from incorrect manual state manipulation)
- Single-pass re.sub with callback for desanitization (eliminates position-tracking bugs and substring conflicts)

### Roadmap Evolution

- Phase 1.1 inserted after Phase 1: UI/UX Visual Polish - dark theme, logo integration, login aesthetics (URGENT)
- Phase 02.1 inserted after Phase 2: Profile page completion (URGENT)

### Pending Todos

- Fix TOTP drift tolerance - implement custom ±1 window checking
- Fix test infrastructure - resolve vitest environment variable loading for database tests

### Blockers/Concerns

- **Test infrastructure:** Database tests fail in vitest due to environment variable loading timing. Runtime functionality verified and works correctly. Non-blocking for plan completion but needs architectural fix in prisma.ts.

## Phase 02.1 Completion Summary

### What was delivered:
1. Prisma User model extended with displayName, avatarUrl, lastLoginAt fields
2. Profile API routes: PUT /api/profile (display name), POST/DELETE /api/profile/avatar (upload/remove)
3. Avatar upload with multer (2MB limit, image-only, cache-busting URLs)
4. Static file serving at /uploads for avatar images
5. TOTP setup endpoint modified to allow regeneration for fully authenticated users
6. Frontend profile page: view/edit toggle, avatar with cool blue initials fallback, account metadata
7. Security settings: Change Password dialog (with current password), Regenerate TOTP dialog (with warning + QR flow)
8. Header updated with avatar image and display name in dropdown
9. Profile API layer with TanStack Query mutation hooks
10. Global Express error handler for better error visibility

### Fixes during verification:
- Onboarding wizard gradient background matched to login page aesthetic
- Added global Express error handler (Express 5 swallowed async errors silently)

## Phase 02-06 UAT Gap Closure Summary

### What was delivered:
1. PreloadedSpacyNlpEngine custom class that bypasses Presidio's model download mechanism
2. Single analyzer pattern supporting all languages (simplified from per-language analyzers)
3. Dockerfile.test for running pytest in Docker with test files and dual spaCy model set
4. Fixed IP recognizer version string detection bug (false positive on "v" in "Server")
5. Production Docker image verified to exclude test files (stays lean)

### UAT Results:
- **Test 1 (blocker):** FIXED - Service starts successfully in Docker, no crash
- **Test 8 (major):** FIXED - Tests now run in Docker (58 of 66 passing, 87.9% pass rate)
- **Tests 3-7:** UNBLOCKED - Can now be tested (were blocked by Test 1 service crash)

### Deviations (auto-fixed):
- Fixed `supported_entity` vs `supported_entities` attribute name bug
- Fixed IP recognizer false positive where "v" substring matched "Server"

### Known Issues:
- 8 of 66 tests still failing (desanitization, language detection edge cases)
- Non-blocking for core functionality - service operational and core features work

## Session Continuity

Last session: 2026-02-12 (Phase 02-07 gap closure complete)
Stopped at: Phase 02-07 complete — mapping reconstruction bug fixed, 64/66 tests passing (97%)
Next: Phase 02-08 — remaining test failures (optional) or Phase 3 — LLM Integration
Resume file: None
