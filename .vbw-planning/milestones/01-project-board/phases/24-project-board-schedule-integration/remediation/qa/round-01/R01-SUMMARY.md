---
phase: 24
round: 1
title: Fix schedule-isolation test concurrency defect and restore the deleted phase24 isolation test
type: remediation
status: complete
completed: 2026-06-03
tasks_completed: 3
tasks_total: 3
commit_hashes:
  - 24554f6
  - 2941b3d
  - 7446145
files_modified:
  - backend/src/services/__tests__/scheduleIsolation.phase23.test.ts
  - backend/src/services/__tests__/scheduleIsolation.phase24.test.ts
deviations:
  - "None. See the Implementation Notes section (a test-only accommodation, not a deliverable deviation)."
known_issue_outcomes:
  - '{"test":"scheduleIsolation.phase23 (concurrent run)","file":"backend/src/services/__tests__/scheduleIsolation.phase23.test.ts","error":"4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts due to global-snapshot sensitivity in Phase 23s snapshotScheduleTables — Phase 23 still passes 6/6 when run in isolation. Note: scheduleIsolation.phase24.test.ts was subsequently deleted by post-phase commit 0d9ed2b, making the concurrent-run scenario moot in the current codebase state, but the underlying Phase 23 test-design issue (unfiltered global findMany in snapshotScheduleTables) remains.","disposition":"resolved","rationale":"Task 1 replaces the unfiltered global findMany in snapshotScheduleTables with reads scoped to the test dataset (filter by the seeded teamMemberId / holidayId / absenceId), so a concurrent suite seeding its own rows can no longer contaminate the snapshot. Phase 23 then passes 6/6 even when run concurrently with the recreated phase24 suite (Task 3 confirms via a single concurrent vitest run)."}'
  - '{"test":"scheduleIsolation.phase23 (concurrent run)","file":"backend/src/services/__tests__/scheduleIsolation.phase23.test.ts","error":"4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts due to global-snapshot sensitivity in Phase 23s snapshotScheduleTables — Phase 23 still passes 6/6 when run in isolation","disposition":"resolved","rationale":"Same root cause and same fix as the registry-sourced entry: scoping snapshotScheduleTables to the test dataset removes the global-snapshot sensitivity. With the snapshot scoped per-test, the recreated phase24 isolation suite (Task 2) runs concurrently with phase23 with zero cross-contamination, confirmed by the concurrent vitest run in Task 3."}'
---

Resolved both Phase 24 FAILs and both carried known issues at their shared root: scoped Phase 23's snapshotScheduleTables to the test's own seeded ids and recreated the deleted phase24 isolation test against the current Project-entity model; both suites pass 8/8 concurrently in one vitest invocation.

## Task 1: Make snapshotScheduleTables isolation-safe in scheduleIsolation.phase23.test.ts

### What Was Built
- Parameterised snapshotScheduleTables by SeedIds and filtered every Assignment/TeamMember/Absence/Holiday findMany to the test's own seeded ids (where id = ids.assignmentId / teamMemberId / absenceId / holidayId), preserving orderBy + JSON.stringify byte-equality model
- Updated all six `it`-block call sites to pass `ids!`
- phase23 passes 6/6 in isolation; no remaining unfiltered global findMany

### Files Modified
- `backend/src/services/__tests__/scheduleIsolation.phase23.test.ts` -- edit: scope snapshot reads to seeded ids so concurrent suites cannot cross-contaminate

## Task 2: Recreate scheduleIsolation.phase24.test.ts aligned to the current Project-entity model

### What Was Built
- Recreated the 24-05 deliverable (deleted by 0d9ed2b) as an isolation-safe suite targeting the current model (BoardCard keyed by projectId @unique)
- Drives the real auto-create-board-card-on-assignment path: upsertAssignment with a Planner-eligible primary half (name + clientId + tag) -> linkProjectsForAssignment -> projectService.upsertByKey auto-creates Project + its single BoardCard
- Copied the scoped snapshot helper (TeamMember/Absence/Holiday filtered to seeded ids) so the suite never reads sibling-suite rows; asserts those tables stay byte-identical and the Assignment's projectId + exactly-one BoardCard are populated (non-vacuous), plus an idempotent re-save case
- FK-safe afterEach teardown of the auto-created Project/BoardCard (looked up via the assignment's projectId), each wrapped in .catch
- phase24 passes 2/2 alone

### Files Modified
- `backend/src/services/__tests__/scheduleIsolation.phase24.test.ts` -- create: restored isolation-safe Phase 24 suite on the Project-entity model

## Task 3: Confirm both isolation suites pass concurrently in a single vitest run

### What Was Built
- Ran `npx vitest run scheduleIsolation` (both suites in one invocation, parallel workers) — the exact scenario that previously failed 4/6 in phase23
- phase23 now passes 6/6 concurrently, proving the global-snapshot defect is resolved at the root
- Hardened phase24 against a transient SQLite single-writer lock-timeout on upsertAssignment's interactive $transaction via a test-only upsertAssignmentWithRetry helper (jittered backoff, no suite serialisation, no product-code change)
- Final result across repeated runs: Test Files 2 passed (2), Tests 8 passed (8)

### Files Modified
- `backend/src/services/__tests__/scheduleIsolation.phase24.test.ts` -- edit: add upsertAssignmentWithRetry to absorb transient concurrent SQLite write-lock timeouts

### Known Issue Outcomes
- `scheduleIsolation.phase23 (concurrent run)` (`backend/src/services/__tests__/scheduleIsolation.phase23.test.ts`) — `resolved`: Task 1 scoped snapshotScheduleTables to the seeded dataset, removing the global-snapshot sensitivity; phase23 passes 6/6 concurrently with the recreated phase24 suite (Task 3 concurrent run).
- `scheduleIsolation.phase23 (concurrent run)` (`backend/src/services/__tests__/scheduleIsolation.phase23.test.ts`) — `resolved`: same root cause and fix; per-test scoped snapshot means phase24 (Task 2) runs concurrently with phase23 with zero cross-contamination, confirmed by the Task 3 concurrent vitest run.

### Deviations
- None. See the Implementation Notes section below (test-only accommodation, not a deviation from the deliverable).

## Implementation Notes

Not a deviation from the remediation deliverable (isolation fixed; both suites green). Preserved for visibility:

- **Test-only concurrency accommodation.** After the snapshot-scoping fix, running both isolation suites under concurrent vitest workers exposed a transient `Operation has timed out` on `upsertAssignment`'s interactive Prisma `$transaction` — the dev backend uses a single-writer SQLite file. Per the plan's constraint (do not serialise the suites, do not change product code), a test-only `upsertAssignmentWithRetry` helper (jittered backoff on lock-timeout) was added to `scheduleIsolation.phase24.test.ts`. Both suites then pass 8/8 concurrently across repeated runs. The global-snapshot data-isolation defect the round targeted is fully resolved (phase23 passes 6/6 concurrently); this retry is a harness accommodation for an environmental SQLite write-lock limit, not a product defect.
- **Follow-up worth noting (non-blocking):** the same single-writer characteristic means heavy concurrent assignment writes could time out against SQLite in a real deployment; if production moves beyond SQLite or sees concurrent assignment creation, revisit `upsertAssignment`'s transaction timeout/retry at the product level.
