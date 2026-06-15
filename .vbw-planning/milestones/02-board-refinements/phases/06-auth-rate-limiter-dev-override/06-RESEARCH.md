---
phase: "06"
title: "Auth Rate Limiter Dev Override (MFA enrollment 429)"
type: research
confidence: high
date: 2026-06-04
---

## Findings

### Symptom
MFA/TOTP **enrollment** fails — the onboarding wizard shows "Failed to generate QR code"; the actual error is `ApiError: Request failed with status 429` on `POST /api/auth/totp/setup`.

### Root cause — auth rate limiter is too tight for the onboarding sequence, with no dev relaxation
- The QR generation itself is healthy: `backend/src/services/auth.ts` `generateTOTPSecret()` was reproduced end-to-end (otplib v13 `generateSecret`/`generateURI` → valid `otpauth://` URI → `qrcode.toDataURL` → valid data URL). Not the cause.
- The setup route `POST /api/auth/totp/setup` (`backend/src/routes/auth.ts:246`) is wired correctly and calls `generateTOTPSecret`. It is guarded by `authRateLimiter`.
- `authRateLimiter` (`backend/src/middleware/rateLimit.ts:48-56`): `windowMs: 60_000` (1 min), **`max: 5`** per IP, Redis-backed (`rl:auth:` prefix) with in-memory fallback, `skip: skipInTest` (exempt only when `NODE_ENV==='test'`). `loginRateLimiter` is an alias of it.
- The `authRateLimiter` guards login + login/totp + totp/setup + totp/verify-setup + password/change. First-time onboarding does **login → password change → totp setup → totp verify-setup** (plus any retries on a mistyped code) in quick succession — that legitimately reaches/exceeds **5 requests/min**, returning 429. During an active dev/testing session this trips constantly.
- **Inconsistency:** `generalRateLimiter` (`rateLimit.ts:99-100`) already relaxes for local dev — `max: process.env.NODE_ENV === 'development' ? 10000 : 600`. `authRateLimiter` (and the other auth-family limiters) have **no** such development override, so they throttle local dev/testing even though the general limiter does not.

## Verdict
Cache/QR code logic is fine. The 429 is the intentional 5/min `authRateLimiter` biting the multi-step onboarding flow, with **no development relaxation** (unlike `generalRateLimiter`). Smallest correct fix: give `authRateLimiter.max` a development override mirroring `generalRateLimiter` — a high limit in `NODE_ENV==='development'`, keeping the strict **5/min in production** (and the existing `skip: skipInTest` for tests).

## Recommendations
- **Primary fix (one line):** in `backend/src/middleware/rateLimit.ts`, change `authRateLimiter` `max: 5` to `max: process.env.NODE_ENV === 'development' ? <high, e.g. 1000> : 5` — exact mirror of `generalRateLimiter`'s pattern. Production security (5/min) is unchanged; local dev/testing is unthrottled.
  - This automatically covers `loginRateLimiter` (alias) and every auth/MFA endpoint using `authRateLimiter`.
  - Keep `skip: skipInTest` as-is (tests already exempt).
- **Scope discipline:** change only `authRateLimiter`'s `max`. Do NOT alter `mutationRateLimiter`/`readRateLimiter` (not implicated) or the production value. No new dependency, no DB migration, no schedule-table writes.
- **Immediate operational unblock (no code):** the window is 60s — waiting ~1 min (or restarting the backend if on the in-memory fallback) clears the 429.

## Risks
- The dev override only relaxes when `NODE_ENV==='development'`; production stays at 5/min. Confirm the local stack actually runs with `NODE_ENV=development` (it must, for the override to take effect) — otherwise the dev value won't apply. (`generalRateLimiter` relies on the same assumption and works, so this is consistent.)
- `max` is evaluated at module load (limiter construction) from `process.env.NODE_ENV`, same as `generalRateLimiter` — fine for a server-start-time env var.

## Files
- `backend/src/middleware/rateLimit.ts` (the `authRateLimiter` `max`). No frontend change required. No migration.
