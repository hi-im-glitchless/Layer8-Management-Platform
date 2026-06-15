---
phase: 6
plan: "01"
title: Auth Rate Limiter Dev Override (MFA enrollment 429)
status: complete
completed: 2026-06-04
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - 5a1560c
  - e3333d2
deviations: []
pre_existing_issues:
  - '{"test":"pdfQueue > addPdfConversionJob > should reject an invalid/empty file path","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"expected error including ''Invalid DOCX path'' but got ''Invalid source file path: ...'' — stale expected error-message string; file not touched by this plan; reproduces independently of the rate-limit change"}'
  - '{"test":"templateAdapter > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"expected vi.fn() to be called with arguments [...] — stale mock-call expectation; file not touched by this plan; reproduces independently of the rate-limit change"}'
  - '{"test":"templateMapping > queryFewShotExamples > (sorted by usageCount DESC / filters by templateType+language / respects limit)","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"orderBy shape drifted from {usageCount:desc} to [{confidence:desc},{usageCount:desc}] — stale vi.fn() mock expectation; file not touched by this plan"}'
  - '{"test":"Audit Service (queryAuditLogs / exportAuditLogs / verifyAuditChain / concurrent writes)","file":"backend/tests/services/audit.test.ts","error":"SQLite single-writer ''database is locked'' / ''Operation has timed out'' under concurrent vitest workers; documented known-issue, passes in isolation; not touched by this plan"}'
  - '{"test":"Session Service > isTrustedDevice > should return true for valid trusted device","file":"backend/tests/services/session.test.ts","error":"SQLite single-writer lock/timeout under concurrent vitest workers; documented known-issue; not touched by this plan"}'
  - '{"test":"boardAdminArchive > POST /cards/:cardId/admin/archive > archives with empty body + ADMIN session → 200","file":"backend/src/routes/__tests__/boardAdminArchive.test.ts","error":"SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; not touched by this plan"}'
  - '{"test":"boardAutoMove.stopped > autoMoveCards — Stopped exclusion > does NOT move a stage=stopped card","file":"backend/src/services/__tests__/boardAutoMove.stopped.test.ts","error":"SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; not touched by this plan"}'
ac_results:
  - criterion: "In development (NODE_ENV==='development') authRateLimiter.max is high (>=1000) so the multi-step MFA onboarding flow no longer returns 429"
    verdict: pass
    evidence: "5a1560c — resolveAuthRateLimitMax('development') === 1000 (asserted in e3333d2 rateLimit.test.ts)"
  - criterion: "In production (NODE_ENV!=='development') authRateLimiter.max stays 5 — auth hardening unchanged"
    verdict: pass
    evidence: "5a1560c — resolveAuthRateLimitMax returns 5 for non-dev; asserted for 'production' and 'test' in rateLimit.test.ts"
  - criterion: "The only behavioral change is authRateLimiter's max; it mirrors the existing generalRateLimiter dev-override pattern"
    verdict: pass
    evidence: "git diff HEAD~1 HEAD = backend/src/middleware/rateLimit.ts only; grep '10000 : 600' still present (generalRateLimiter unchanged)"
  - criterion: "skip: skipInTest on authRateLimiter is preserved (tests remain exempt)"
    verdict: pass
    evidence: "grep 'skip: skipInTest' rateLimit.ts line 67 (authRateLimiter) retained"
  - criterion: "mutationRateLimiter, readRateLimiter, and generalRateLimiter are untouched"
    verdict: pass
    evidence: "grep 'rl:mutation:' / 'rl:read:' / '10000 : 600' all intact in rateLimit.ts"
  - criterion: "loginRateLimiter remains an alias of authRateLimiter (covered automatically)"
    verdict: pass
    evidence: "export const loginRateLimiter = authRateLimiter; unchanged in rateLimit.ts"
  - criterion: "No new dependency, no DB migration, no schedule-table writes; backend typecheck/build stays green"
    verdict: pass
    evidence: "npm run build (tsc) green; no package.json/migration/schedule changes; only rateLimit.ts + new test"
  - criterion: "artifact backend/src/middleware/rateLimit.ts contains resolveAuthRateLimitMax"
    verdict: pass
    evidence: "rateLimit.ts:52 defines and line 62 uses resolveAuthRateLimitMax"
  - criterion: "artifact backend/src/middleware/__tests__/rateLimit.test.ts contains resolveAuthRateLimitMax"
    verdict: pass
    evidence: "e3333d2 — rateLimit.test.ts imports and asserts resolveAuthRateLimitMax (3 tests pass)"
---

Gave `authRateLimiter.max` a `NODE_ENV==='development'` override via an exported pure helper `resolveAuthRateLimitMax` (1000 in dev, 5 in production) so the multi-step MFA onboarding flow no longer trips 429 in local dev, mirroring `generalRateLimiter`'s pattern; production hardening, `skip: skipInTest`, and all other limiters are unchanged.

## What Was Built

- `resolveAuthRateLimitMax(env = process.env.NODE_ENV)` — small exported pure helper returning `1000` when `env === 'development'` and `5` otherwise; placed beside `skipInTest`.
- `authRateLimiter.max` now reads from `resolveAuthRateLimitMax()` instead of the flat literal `5` (dev value chosen: 1000, ample for the login → password change → totp setup → verify-setup onboarding burst). `windowMs`, `store: makeStore('rl:auth:')`, `skip: skipInTest`, `message`, and the `loginRateLimiter` alias are untouched; `mutationRateLimiter`/`readRateLimiter`/`generalRateLimiter` untouched.
- Unit test `rateLimit.test.ts` asserting the resolver as a pure function: `'development'` → 1000, `'production'` → 5, `'test'` → 5 (no NODE_ENV re-import toggling, no live-limiter driving).

Build/test results: `npm run build` (tsc) green; `npx vitest run src/middleware/__tests__/rateLimit.test.ts` passes (3/3). Full suite: 328 passed; 29 failures are all pre-existing in files this plan did not touch (SQLite single-writer concurrency under parallel vitest workers + stale mock/error-string expectations — see `pre_existing_issues`), reproduce independently of this change, and were not fixed (out of scope).

## Files Modified

- `backend/src/middleware/rateLimit.ts` -- modified: added `resolveAuthRateLimitMax` helper and set `authRateLimiter.max` from it (dev override, production unchanged)
- `backend/src/middleware/__tests__/rateLimit.test.ts` -- created: pure-function unit test for `resolveAuthRateLimitMax` dev-vs-prod resolution

## Deviations

None.
