---
phase: 2
round: 1
title: Disposition carried SQLite concurrent-run known issue for boardAdminArchive route test
type: remediation
status: complete
completed: 2026-06-03
tasks_completed: 1
tasks_total: 1
commit_hashes: []
files_modified:
  - .vbw-planning/phases/02-archive-without-typed-project-name-confirmation/remediation/qa/round-01/R01-SUMMARY.md
  - .vbw-planning/phases/02-archive-without-typed-project-name-confirmation/remediation/qa/round-01/R01-PLAN.md
deviations: []
known_issue_outcomes:
  - '{"test":"archives the card with an empty body and a valid ADMIN session → 200","file":"backend/src/routes/__tests__/boardAdminArchive.test.ts","error":"SQLite SocketTimeout (PrismaClientKnownRequestError: DriverAdapterError: SocketTimeout) when boardAdminArchive.test.ts and scheduleIsolation.phase23.test.ts run concurrently — identical to the accepted concurrent-run contention documented in STATE.md. Both suites pass in isolation.","disposition":"accepted-process-exception","rationale":"Environmental SQLite single-writer contention (compounded by the better-sqlite3 NODE_MODULE_VERSION mismatch under Node v22.x), not a product or test defect. boardAdminArchive.test.ts passes 2/2 in isolation (verified this round: npx vitest run src/routes/__tests__/boardAdminArchive.test.ts → 2 passed). The SocketTimeout only surfaces when the suite shares a parallel vitest worker against the single SQLite writer alongside scheduleIsolation.phase23.test.ts. The new test ALREADY implements the only low-risk, in-scope hardening: every seed write (user/project/boardCard/boardFile create) and every teardown deleteMany is wrapped in a local withDbRetry jittered-backoff helper (matching /timed out|database is locked|SQLITE_BUSY/, mirroring scheduleIsolation upsertAssignmentWithRetry); re-adding it is unnecessary and no further low-risk hardening exists. Broader changes (vitest pool config, per-test isolated DB, retry-wrapping read assertions) are out-of-scope scope-creep that risk destabilizing the wider suite. Archive product behavior is correct (200 archive + hard-delete of BoardFile rows and on-disk bytes, stage=archived; 404 NOT_FOUND for a missing card). STATE.md already accepts this exact concurrent-run contention class for phases 23, 24, and 01. Disposition: accepted non-blocking process-exception for phase 2."}'
---

Dispositioned the single carried SQLite SocketTimeout known issue for phase 2 as a verified, non-blocking `accepted-process-exception`; the archive route test passes 2/2 in isolation and retains its existing withDbRetry hardening with no code change.

## Task 1: Record accepted-process-exception disposition for the carried SQLite concurrent-run issue

### What Was Built
- Verified `backend/src/routes/__tests__/boardAdminArchive.test.ts` passes 2/2 in isolation via `cd backend && npx vitest run src/routes/__tests__/boardAdminArchive.test.ts` (Test Files 1 passed, Tests 2 passed, 261ms), confirming the product behavior is correct and the carried failure is concurrency-only.
- Confirmed the existing in-scope hardening is already present and did NOT re-add it: the local `withDbRetry` jittered-backoff helper (matching `/timed out|database is locked|SQLITE_BUSY/`, mirroring scheduleIsolation's `upsertAssignmentWithRetry`) wraps every seed write (user/project/boardCard/boardFile create) and every teardown `deleteMany`.
- Confirmed `git diff --stat backend/ frontend/` is empty — disposition is documentation-only; no product or test code was modified this round.
- Recorded the carried known issue as `accepted-process-exception` in frontmatter, with keys (test, file, error) matching `R01-KNOWN-ISSUES.json` exactly and a specific rationale (isolation pass, existing hardening, correct product behavior, STATE.md precedent for phases 23/24/01, better-sqlite3 NODE_MODULE_VERSION under Node v22.x).

### Files Modified
- `.vbw-planning/phases/02-archive-without-typed-project-name-confirmation/remediation/qa/round-01/R01-SUMMARY.md` -- created: records the verified disposition of the carried known issue.
- `.vbw-planning/phases/02-archive-without-typed-project-name-confirmation/remediation/qa/round-01/R01-PLAN.md` -- read: source plan and carried-issue keys for this round (no content change).

### Known Issue Outcomes
- `archives the card with an empty body and a valid ADMIN session → 200` (`backend/src/routes/__tests__/boardAdminArchive.test.ts`) — `accepted-process-exception`: Environmental SQLite single-writer contention (plus better-sqlite3 NODE_MODULE_VERSION mismatch under Node v22.x), not a product/test defect. Passes 2/2 in isolation; SocketTimeout only appears under a shared parallel vitest worker with scheduleIsolation.phase23.test.ts. Test already wraps all seed/teardown writes in withDbRetry backoff; product behavior correct (200 archive + hard-delete; 404 NOT_FOUND). STATE.md already accepts this class for phases 23/24/01 — non-blocking for phase 2.

### Deviations
None
