---
phase: 01-foundation-security-web-ui-design
plan: 04
subsystem: auth
tags: [react, tanstack-query, zod, react-hook-form, shadcn-ui, totp, authentication, frontend]

# Dependency graph
requires:
  - phase: 01-01
    provides: Backend auth API (login, TOTP, session management, CSRF, rate limiting)
  - phase: 01-03
    provides: Frontend scaffold with React Router, shadcn/ui, and AppShell
provides:
  - Complete authentication UI with split-screen login page
  - TOTP setup and verification components with QR code display
  - First-login onboarding wizard (password change + TOTP setup)
  - Auth state management with TanStack Query hooks
  - Protected route wrappers (ProtectedRoute and PublicRoute)
  - API client with automatic CSRF token handling
affects: [all-frontend-features, user-management, session-management]

# Tech tracking
tech-stack:
  added: [zod, react-hook-form, qrcode.react, @tanstack/react-query]
  patterns: [auth-state-management-with-tanstack-query, protected-route-pattern, onboarding-wizard-state-machine, auto-csrf-token-fetching]

key-files:
  created:
    - frontend/src/lib/api.ts
    - frontend/src/features/auth/types.ts
    - frontend/src/features/auth/api.ts
    - frontend/src/features/auth/hooks.ts
    - frontend/src/components/auth/LoginForm.tsx
    - frontend/src/components/auth/TOTPVerification.tsx
    - frontend/src/components/auth/TOTPSetup.tsx
    - frontend/src/components/auth/PasswordChange.tsx
    - frontend/src/components/auth/OnboardingWizard.tsx
    - backend/src/scripts/seed-admin.ts
  modified:
    - frontend/src/App.tsx
    - frontend/src/components/layout/Header.tsx
    - frontend/src/routes/Login.tsx
    - backend/src/db/prisma.ts
    - backend/src/middleware/csrf.ts

key-decisions:
  - "Switch from @prisma/adapter-libsql to @prisma/adapter-better-sqlite3 for Prisma 7 compatibility"
  - "CSRF cookie httpOnly=false and sameSite=lax to support double-submit pattern and cross-port development"
  - "Auto-fetch CSRF token before first POST request in API client"
  - "Remove premature query invalidation from auth mutation hooks to prevent 401 redirects during onboarding"
  - "TanStack Query with 5-minute staleTime for auth state caching"
  - "State machine pattern for login flow (idle → TOTP verification → TOTP setup → onboarding)"

patterns-established:
  - "Protected routes using TanStack Query auth hook with loading and redirect states"
  - "API client with automatic CSRF token extraction from cookies"
  - "Onboarding wizard with step-based state machine and fade transitions"
  - "Password strength indicator based on character type diversity"

# Metrics
duration: 41min
completed: 2026-02-11
---

# Phase 1 Plan 4: Authentication Frontend Summary

**Complete authentication frontend with split-screen login, TOTP setup/verification, multi-step onboarding wizard, TanStack Query state management, and protected routes**

## Performance

- **Duration:** 41 min
- **Started:** 2026-02-11T10:26:55Z
- **Completed:** 2026-02-11T11:08:16Z
- **Tasks:** 2 core tasks + 1 verification checkpoint
- **Files created:** 10
- **Files modified:** 5

## Accomplishments

- Split-screen login page with dark gradient background, logo, and responsive form layout
- Complete TOTP flow: setup with QR code display, verification with 6-digit input and "remember me" checkbox
- First-login onboarding wizard guiding users through password change and TOTP setup with smooth step transitions
- Auth state management using TanStack Query with 5-minute caching and automatic query invalidation
- Protected and public route wrappers with loading states and auth-based redirects
- API client with automatic CSRF token handling (reads from cookie, includes in POST headers)
- Seed script for creating test admin user
- Fixed Prisma adapter compatibility, CSRF cookie settings, and auth flow redirects

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth API client, hooks, and route protection** - `65a1123` (feat)
2. **Task 2: Login page, TOTP components, and onboarding wizard** - `24dbd0d` (feat)
3. **Seed script for test user** - `a03d9f6` (chore)
4. **Fix Prisma adapter, CSRF, auth flow** - `210f023` (fix)

**Checkpoint 3: Verify complete authentication flow** - ✅ APPROVED by user

## Files Created/Modified

### Created

- `frontend/src/lib/api.ts` - Typed fetch wrapper with CSRF token handling and 401 redirects
- `frontend/src/features/auth/types.ts` - Auth types (User, LoginResponse, TOTPSetupResponse)
- `frontend/src/features/auth/api.ts` - Auth API functions (login, TOTP, password change, logout, getMe)
- `frontend/src/features/auth/hooks.ts` - TanStack Query hooks (useAuth, useLogin, useLogout)
- `frontend/src/components/auth/LoginForm.tsx` - Username/password form with Zod validation
- `frontend/src/components/auth/TOTPVerification.tsx` - 6-digit code input with remember-me checkbox
- `frontend/src/components/auth/TOTPSetup.tsx` - QR code display and verification for first-time setup
- `frontend/src/components/auth/PasswordChange.tsx` - Password change with strength indicator and show/hide toggle
- `frontend/src/components/auth/OnboardingWizard.tsx` - Multi-step wizard (password → TOTP → welcome)
- `backend/src/scripts/seed-admin.ts` - Seed script to create test admin user (username: admin, password: Admin123!)

### Modified

- `frontend/src/App.tsx` - Added ProtectedRoute and PublicRoute wrappers with auth-based routing
- `frontend/src/components/layout/Header.tsx` - Display real user data, admin badge, and functional logout
- `frontend/src/routes/Login.tsx` - Split-screen layout with state machine for login flow transitions
- `backend/src/db/prisma.ts` - Switched from libsql adapter to better-sqlite3 for Prisma 7 compatibility
- `backend/src/middleware/csrf.ts` - Changed CSRF cookie to httpOnly=false and sameSite=lax

## Decisions Made

**1. Prisma adapter change: better-sqlite3 over libsql**
- **Reason:** Prisma 7 requires driver adapters; @prisma/adapter-libsql had version conflicts with Prisma 7.x
- **Impact:** Better compatibility with Prisma ecosystem; no functional difference for SQLite file-based database

**2. CSRF cookie settings: httpOnly=false, sameSite=lax**
- **Reason:** Double-submit CSRF pattern requires JavaScript-readable cookie; strict sameSite breaks cross-port development (frontend:5173 → backend:3001)
- **Security trade-off:** CSRF cookie is not sensitive (token also in header), but exposes it to XSS. Acceptable for double-submit pattern.

**3. Auto-fetch CSRF token in API client**
- **Reason:** Frontend needs CSRF token before first POST request, but token is generated on first GET. Added automatic `/api/csrf-token` fetch before first POST.
- **Impact:** Seamless CSRF protection without manual token management

**4. Remove premature query invalidation from auth hooks**
- **Reason:** `invalidateQueries` in `useLogin` and other mutation hooks caused immediate re-fetch of auth state, leading to 401 redirects during onboarding flow (user not fully authenticated yet)
- **Solution:** Only invalidate queries after operations that complete authentication (TOTP verification, not login initiation)

**5. TanStack Query caching: 5-minute staleTime**
- **Reason:** Balance between fresh auth state and avoiding excessive API calls
- **Impact:** Auth state cached for 5 minutes; manual invalidation on logout/login completion

**6. State machine for login flow**
- **States:** idle → awaitingTOTP → awaitingTOTPSetup → awaitingPasswordChange
- **Reason:** Login response determines next UI state (TOTP verification, TOTP setup, or onboarding wizard)
- **Impact:** Clean separation of login flow stages with predictable transitions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added seed script for test admin user**
- **Found during:** Task 2 completion (preparing for verification checkpoint)
- **Issue:** No way to test authentication flow without existing user account
- **Fix:** Created `backend/src/scripts/seed-admin.ts` to generate admin user with credentials (username: admin, password: Admin123!). Added `npm run seed` command to package.json.
- **Files modified:** backend/package.json, backend/src/scripts/seed-admin.ts
- **Verification:** Script successfully creates admin user; login flow works
- **Committed in:** `a03d9f6` (chore: add seed script)

**2. [Rule 1 - Bug] Fixed Prisma adapter for Prisma 7 compatibility**
- **Found during:** Task 3 verification (checkpoint testing)
- **Issue:** @prisma/adapter-libsql version conflicts with Prisma 7.x caused database connection errors
- **Fix:** Switched to @prisma/adapter-better-sqlite3 which has stable Prisma 7 support
- **Files modified:** backend/package.json, backend/package-lock.json, backend/src/db/prisma.ts
- **Verification:** Database connections succeed; auth queries work
- **Committed in:** `210f023` (fix: Prisma adapter, CSRF, auth flow)

**3. [Rule 2 - Missing Critical] Fixed CSRF cookie settings for double-submit pattern**
- **Found during:** Task 3 verification (login POST failing with CSRF errors)
- **Issue:** CSRF cookie set with `httpOnly: true` prevented JavaScript from reading it; `sameSite: 'strict'` blocked cross-port requests
- **Fix:** Changed to `httpOnly: false` (required for double-submit pattern) and `sameSite: 'lax'` (allows cross-port in development)
- **Files modified:** backend/src/middleware/csrf.ts
- **Verification:** CSRF token successfully read from cookie and included in POST headers
- **Committed in:** `210f023` (fix: Prisma adapter, CSRF, auth flow)

**4. [Rule 2 - Missing Critical] Added auto-fetch of CSRF token in API client**
- **Found during:** Task 3 verification (first POST request missing CSRF token)
- **Issue:** CSRF token is generated on first GET request, but frontend needs it before first POST
- **Fix:** Added automatic `/api/csrf-token` fetch before first POST if cookie doesn't exist yet
- **Files modified:** frontend/src/lib/api.ts
- **Verification:** First POST request automatically fetches token and succeeds
- **Committed in:** `210f023` (fix: Prisma adapter, CSRF, auth flow)

**5. [Rule 1 - Bug] Fixed premature query invalidation causing 401 redirects**
- **Found during:** Task 3 verification (onboarding wizard redirecting to login mid-flow)
- **Issue:** `useLogin` hook invalidated auth queries immediately after login, triggering re-fetch while user was mid-authentication (before TOTP verification), causing 401 and redirect to login
- **Fix:** Removed query invalidation from `useLogin`, `useVerifyTOTP`, and similar hooks. Only invalidate after operations that complete authentication.
- **Files modified:** frontend/src/features/auth/hooks.ts
- **Verification:** Onboarding wizard completes without interruption; auth state updates correctly after TOTP verification
- **Committed in:** `210f023` (fix: Prisma adapter, CSRF, auth flow)

---

**Total deviations:** 5 auto-fixed (2 bugs, 2 missing critical, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and functionality. No scope creep. Most issues surfaced during verification checkpoint as integration bugs between frontend and backend.

## Issues Encountered

**Integration issues discovered during checkpoint verification:**

1. **Prisma 7 adapter compatibility** - Resolved by switching adapters
2. **CSRF double-submit pattern requirements** - Resolved by adjusting cookie settings and adding auto-fetch
3. **Auth state timing during onboarding** - Resolved by removing premature query invalidation

All issues were architectural mismatches between planned approach and actual library requirements. Fixed inline per deviation rules.

## User Setup Required

**For testing authentication flow:**

1. Start backend server: `cd backend && npm run dev`
2. Start Redis: Ensure Redis is running (auth uses Redis for sessions and rate limiting)
3. Create test user: `cd backend && npm run seed` (creates admin user: username `admin`, password `Admin123!`)
4. Start frontend: `cd frontend && npm run dev`
5. Visit http://localhost:5173 and log in with admin credentials
6. Complete onboarding: set new password and scan QR code with authenticator app

**Note:** Seed script creates a user with `mustResetPassword: true` and `totpEnabled: false` to trigger the full onboarding flow.

## Next Phase Readiness

**Ready for Phase 2 (User Management):**
- Complete authentication system with TOTP MFA
- Protected routes and auth state management
- Session management with CSRF protection
- Admin user seed script for testing

**Ready for Phase 3 (Audit Logging UI):**
- Header component with user context
- Route protection for admin-only features
- API client with automatic auth header handling

**No blockers.** Authentication frontend complete and fully functional.

---
*Phase: 01-foundation-security-web-ui-design*
*Plan: 04*
*Completed: 2026-02-11*

## Self-Check: PASSED

All claimed files verified:
- ✓ 15 files (10 created, 5 modified) exist on disk
- ✓ 4 commits (65a1123, 24dbd0d, a03d9f6, 210f023) exist in git history

Self-check completed successfully. Proceeding with state updates.
