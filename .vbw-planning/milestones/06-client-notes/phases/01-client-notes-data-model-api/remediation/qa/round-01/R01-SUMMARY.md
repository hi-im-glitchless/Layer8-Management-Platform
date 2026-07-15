---
phase: 1
round: 1
title: "Phase 01 QA Remediation R01 — Plan Amendments + Vitest Dist Exclusion"
type: remediation
status: complete
completed: 2026-07-10
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - d365322
  - 1851e53
files_modified:
  - .vbw-planning/phases/01-client-notes-data-model-api/01-01-PLAN.md
  - backend/vitest.config.ts
deviations:
  - "None. Both FAIL checks were closed by amending the original plan (DEV-01, DEV-02); no product code was reverted or weakened per the plan-amendment classification."
known_issue_outcomes:
  - '{"test":"Audit Service > logAuditEvent / queryAuditLogs / verifyAuditChain / exportAuditLogs (19 tests)","file":"backend/tests/services/audit.test.ts","error":"P1008 SocketTimeout on the AuditLog Serializable transaction (audit.ts:71, prisma.$transaction) under full-suite parallel load (SQLite single-writer contention via better-sqlite3 adapter). Passes in isolation. audit.ts is not in this plans files_modified.","disposition":"accepted-process-exception","rationale":"SQLite single-writer contention in the untouched, shared audit.ts transaction; passes deterministically in isolation. Not fixable within this phase boundary (audit.ts is out of scope). Already an accepted process-exception in phases 09 and 24 (see STATE Todos ref 29396258, e7a9bb3e). Task 2 (dist exclusion) halves parallel dev.db write load and is expected to reduce recurrence, but cannot eliminate the underlying single-writer limit."}'
  - '{"test":"Session Service > isTrustedDevice > returns true for valid trusted device","file":"backend/tests/services/session.test.ts","error":"Environmental (Redis/session store) failure in a file untouched by this plan.","disposition":"accepted-process-exception","rationale":"Environmental Redis/session-store dependency in an untouched service; not exercisable in this CI environment and outside this phase boundary. Already an accepted process-exception in phase 09 (see STATE Todos ref c95df50d)."}'
  - '{"test":"Stale compiled duplicates under dist/ (boardAdminArchive, boardFiles, deleteAssignmentOrphan.stopped, pdfQueue, templateAdapter, templateMapping)","file":"backend/dist/**/*.test.js","error":"backend/dist/ is gitignored (.gitignore:12) stale tsc build output picked up by vitest, re-running pre-change compiled tests in parallel and roughly doubling dev.db write load, amplifying the SQLite single-writer contention above. Pre-existing environmental artifact, not part of this plans scope.","disposition":"resolved","rationale":"Task 2 adds an explicit dist exclusion to backend/vitest.config.ts (preserving the vitest default excludes), so vitest no longer discovers the 19 stale compiled backend/dist/**/*.test.js duplicates. This is a small, contained, in-scope config change with no product-code impact; it removes the duplicate test discovery entirely and reduces the parallel dev.db write pressure that amplifies the other contention failures."}'
  - '{"test":"boardFiles routes > download/upload happy paths","file":"backend/src/routes/__tests__/boardFiles.test.ts","error":"Environmental (ClamAV/filesystem/SQLite-lock) failure in a file untouched by this plan; documented known flake.","disposition":"accepted-process-exception","rationale":"Environmental ClamAV/filesystem/SQLite-lock dependency in an untouched file; documented flake. Outside this phase boundary. Already an accepted process-exception in phases 03 and 09 (see STATE Todos ref 51a72302, 40766167)."}'
  - '{"test":"client notes access (Phase 01) > (6) lets an ADMIN write notes -> 200; (7) writes exactly one client.notes.update audit entry","file":"backend/src/routes/__tests__/clientNotesAccess.test.ts","error":"Under FULL-SUITE load only (not in isolation, not paired with boardAdminArchive alone): PUT returns 500. Root-caused via stack trace to the identical P1008 SocketTimeout inside logAuditEvents prisma.$transaction (backend/src/services/audit.ts:47-71), not in schedule.ts or clientService.ts (both plan-owned files execute correctly - the update itself succeeds; the subsequent audit write times out under heavy concurrent SQLite load). Independently verified via stack trace inspection, not taken on Devs word. clientNotesAccess.test.ts is 8/8 green in isolation and when paired with boardAdminArchive.test.ts across 3 repeated runs; the underlying contention is in the untouched, shared audit.ts transaction, which fails identically and independently in tests/services/audit.test.ts under the same full-suite run.","disposition":"accepted-process-exception","rationale":"The plan-owned code (schedule.ts, clientService.ts) executes correctly; the 500 originates in the untouched shared audit.ts transaction (same P1008 as the audit.test.ts issue) only under full-suite parallel load. The suite is 8/8 green in isolation and paired with boardAdminArchive across 3 runs. Same-family SQLite single-writer contention already accepted in phases 09 and 24. Task 2 (dist exclusion) is expected to reduce recurrence by cutting parallel write load, but the residual risk is the shared audit transaction, which is out of this phase boundary."}'
  - '{"test":"pdfQueue > addPdfConversionJob > rejects invalid/empty file path (2 tests)","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"Environmental (Redis/BullMQ/Gotenberg-dependent) failure in a file untouched by this plan.","disposition":"accepted-process-exception","rationale":"Environmental Redis/BullMQ/Gotenberg dependency in an untouched service; not exercisable in this CI environment and outside this phase boundary. Already an accepted process-exception in phases 01, 03, and 09 (see STATE Todos ref 00587024, 7df0c371, 6139e70a)."}'
  - '{"test":"templateAdapter service > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"TypeError: Cannot read properties of undefined (reading filter) at templateAdapter.ts:248 - mock/fixture drift in a file untouched by this plan.","disposition":"accepted-process-exception","rationale":"Stale mock/fixture drift in an untouched template-AI service unrelated to client notes; fixing it would require editing tests outside this phase boundary. Already an accepted process-exception in phases 01, 03, and 09 (see STATE Todos ref 76aeafeb, c88126f1, 32c56445)."}'
  - '{"test":"templateMapping service > queryFewShotExamples (3 tests)","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"Mock expectation mismatch: test expects orderBy {usageCount: desc} but service now uses orderBy [{confidence: desc},{usageCount: desc}]. Stale test vs. code drift in a file untouched by this plan.","disposition":"accepted-process-exception","rationale":"Stale mock expectation vs. code drift in an untouched service unrelated to client notes; fixing it would require editing tests outside this phase boundary. Already an accepted process-exception in phases 01, 03, and 09 (see STATE Todos ref 36c58190, 3ed05977, b1f2de98)."}'
---

Closed both Phase 01 QA FAIL checks by amending 01-01-PLAN.md to the as-built approach (DEV-01, DEV-02 resolved-by-amendment, no product code reverted) and excluded stale dist build output from vitest discovery, resolving the compiled-duplicates known issue; the remaining seven known issues stay accepted as process-exceptions.

## Task 1: Amend 01-01-PLAN.md to record the as-built DEV-01 and DEV-02 approach

### What Was Built
- Appended an inline "As-built amendment (QA R01)" note to Task 1's `<action>` block documenting DEV-01: the three notes columns were appended at the end of model Client's scalar fields (not after color) and migration.sql was hand-authored as three pure ADD COLUMN statements because Prisma 7 proposed a RedefineTables rebuild on the populated dev.db; marked DEV-01 resolved-by-amendment with a do-not-revert warning.
- Appended an inline "As-built amendment (QA R01)" note to Task 4's `<action>` block documenting DEV-02: case 8 uses fixture-scoped row-identity toEqual snapshots plus clientId-scoped Assignment insert counts (parallel-worker safe) instead of literal global row counts; marked DEV-02 resolved-by-amendment with a do-not-revert warning.
- Left all existing must_haves truths intact (they already match the as-built code); no backend/frontend source touched.

### Files Modified
- `.vbw-planning/phases/01-client-notes-data-model-api/01-01-PLAN.md` -- edited: recorded as-built DEV-01 migration/placement and DEV-02 isolation approach, each marked resolved-by-amendment.

### Known Issue Outcomes
- None resolved by this task (documentation-only plan amendment).

### Deviations
None.

## Task 2: Exclude stale dist build output from vitest test discovery

### What Was Built
- Imported `configDefaults` alongside `defineConfig` in `backend/vitest.config.ts`.
- Added `test.exclude: [...configDefaults.exclude, '**/dist/**']`, preserving the vitest default excludes (node_modules, etc.) while dropping stale compiled tsc output.
- Verified real numbers before/after: discovered test files dropped from 48 to 29 (dist files 19 -> 0); test-level dist entries dropped from 163 to 0. `npx vitest run src/routes/__tests__/clientNotesAccess.test.ts` remained 8/8 green (Test Files 1 passed, Tests 8 passed). No prisma/db command was run; dev.db untouched; no test file deleted.

### Files Modified
- `backend/vitest.config.ts` -- edited: added dist exclusion to test discovery while preserving configDefaults.exclude.

### Known Issue Outcomes
- `Stale compiled duplicates under dist/` (`backend/dist/**/*.test.js`) — `resolved`: dist exclusion removes the 19 stale compiled duplicates (163 test-level entries) from discovery, cutting parallel dev.db write load.
- `Audit Service (19 tests)` (`backend/tests/services/audit.test.ts`) — `accepted-process-exception`: SQLite single-writer contention in the untouched shared audit.ts transaction; passes in isolation; out of phase boundary; accepted in phases 09/24.
- `Session Service > isTrustedDevice` (`backend/tests/services/session.test.ts`) — `accepted-process-exception`: environmental Redis/session-store dependency in an untouched service; accepted in phase 09.
- `boardFiles routes > download/upload happy paths` (`backend/src/routes/__tests__/boardFiles.test.ts`) — `accepted-process-exception`: environmental ClamAV/filesystem/SQLite-lock flake in an untouched file; accepted in phases 03/09.
- `client notes access (Phase 01) > cases (6),(7)` (`backend/src/routes/__tests__/clientNotesAccess.test.ts`) — `accepted-process-exception`: full-suite-only 500 originates in the untouched shared audit.ts P1008 transaction; suite is 8/8 green in isolation; same-family contention accepted in phases 09/24.
- `pdfQueue > addPdfConversionJob (2 tests)` (`backend/src/services/__tests__/pdfQueue.test.ts`) — `accepted-process-exception`: environmental Redis/BullMQ/Gotenberg dependency in an untouched service; accepted in phases 01/03/09.
- `templateAdapter service > analyzeTemplate` (`backend/src/services/__tests__/templateAdapter.test.ts`) — `accepted-process-exception`: stale mock/fixture drift in an untouched template-AI service; accepted in phases 01/03/09.
- `templateMapping service > queryFewShotExamples (3 tests)` (`backend/src/services/__tests__/templateMapping.test.ts`) — `accepted-process-exception`: stale mock expectation vs. code drift in an untouched service; accepted in phases 01/03/09.

### Deviations
None.
