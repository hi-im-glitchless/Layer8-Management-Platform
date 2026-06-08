---
phase: 1
round: 1
title: Stopped Column & Horizontal Drag Auto-Scroll — QA Remediation (plan amendment + accepted process exceptions)
type: remediation
status: complete
completed: 2026-06-03
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - ca5c30b3ae5701e48019fa94aa79d79596b147b4
files_modified:
  - .vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/01-01-PLAN.md
  - .vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/remediation/qa/round-01/R01-SUMMARY.md
deviations: []
known_issue_outcomes:
  - '{"test":"pdfQueue > addPdfConversionJob > should reject an invalid file path / should reject an empty file path","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"expected error including 'Invalid DOCX path' but got 'Invalid source file path: ...' — stale expected error-message string; reproduces in isolation; file not touched by this plan","disposition":"accepted-process-exception","rationale":"Pre-existing stale expected-error-message string; pdfQueue.test.ts not touched by Phase 1; reproduces independently of board code; out of scope; kept visible in STATE.md backlog; non-blocking."}'
  - '{"test":"scheduleIsolation.phase23/phase24 + audit/session services (concurrent run only)","file":"backend/src/services/__tests__/scheduleIsolation.phase24.test.ts","error":"SQLite single-writer 'Operation has timed out' / 'database is locked' under concurrent vitest workers — documented known-issue, passes in isolation; not caused by this plan","disposition":"accepted-process-exception","rationale":"Documented SQLite single-writer timeout/lock under concurrent vitest workers; passes in isolation; scheduleIsolation.phase24.test.ts not touched by Phase 1; pre-existing environmental known-issue tracked in STATE.md; non-blocking."}'
  - '{"test":"templateAdapter > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"expected vi.fn() to be called with arguments [...] — stale mock expectation; reproduces in isolation; file not touched by this plan","disposition":"accepted-process-exception","rationale":"Pre-existing stale vi.fn() mock-call expectation. templateAdapter.test.ts was not touched by Phase 1; failure reproduces independently of board code and is out of this milestone's scope. Kept visible in STATE.md backlog; non-blocking for this phase."}'
  - '{"test":"templateMapping > queryFewShotExamples > (sorted by usageCount DESC / filters by templateType+language / respects limit)","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"expected vi.fn() to be called with arguments [...] — stale mock expectation; reproduces in isolation; file not touched by this plan","disposition":"accepted-process-exception","rationale":"Pre-existing stale vi.fn() mock-call expectation. templateMapping.test.ts was not touched by Phase 1; failure reproduces independently of board code and is out of this milestone's scope. Kept visible in STATE.md backlog; non-blocking for this phase."}'
---

Resolved the single Phase 1 verification FAIL (DEV-01 / DEVN-01) via a docs-only amendment to 01-01-PLAN.md recording the actual test-only withDbRetry retry/backoff approach, and dispositioned the four carried known issues as accepted process exceptions. No product code changed.

## Task 1: Amend 01-01-PLAN.md to record the actual withDbRetry test approach (resolve DEV-01)

### What Was Built
- Appended a note to the "Backend test: auto-mover skips Stopped cards" task <action> block documenting that the implemented test wraps its DB writes in a test-local `withDbRetry` retry/backoff helper, mirroring scheduleIsolation's `upsertAssignmentWithRetry`, to absorb SQLite single-writer lock/timeout errors under concurrent vitest workers (test-only, no product code, no isolation weakening).
- Added to that task's <done> block that the seed/control DB writes are guarded by the test-local withDbRetry backoff wrapper.
- Added an "Amendments (R01-QA)" note at the foot of the plan body marking DEV-01 / DEVN-01 resolved-by-amendment: a legitimate test-only improvement the original action did not explicitly specify; helper is correct (verified by TST-04) and stays.

### Files Modified
- `.vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/01-01-PLAN.md` -- amended: record actual withDbRetry test approach and mark DEV-01/DEVN-01 resolved-by-amendment
- `.vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/remediation/qa/round-01/R01-SUMMARY.md` -- created: this remediation round summary

### Known Issue Outcomes
- `pdfQueue > addPdfConversionJob > should reject an invalid file path / should reject an empty file path` (`backend/src/services/__tests__/pdfQueue.test.ts`) — `accepted-process-exception`: pre-existing stale expected-error-message string in a file Phase 1 did not touch; reproduces in isolation; out of scope; kept visible in STATE.md backlog.
- `scheduleIsolation.phase23/phase24 + audit/session services (concurrent run only)` (`backend/src/services/__tests__/scheduleIsolation.phase24.test.ts`) — `accepted-process-exception`: documented SQLite single-writer timeout/lock under concurrent vitest workers; passes in isolation; not touched by Phase 1; tracked in STATE.md; non-blocking.
- `templateAdapter > analyzeTemplate > calls Python service and LLM in correct order` (`backend/src/services/__tests__/templateAdapter.test.ts`) — `accepted-process-exception`: pre-existing stale vi.fn() mock expectation; reproduces in isolation; file not touched by Phase 1; out of scope; kept visible in STATE.md backlog.
- `templateMapping > queryFewShotExamples > (sorted by usageCount DESC / filters by templateType+language / respects limit)` (`backend/src/services/__tests__/templateMapping.test.ts`) — `accepted-process-exception`: pre-existing stale vi.fn() mock expectation; reproduces in isolation; file not touched by Phase 1; out of scope; kept visible in STATE.md backlog.

### Implementation Notes
- DEV-01 / DEVN-01 — **resolved-by-amendment** (no longer an open deviation). The test added a test-only withDbRetry retry/backoff wrapper around its DB writes (mirroring scheduleIsolation's upsertAssignmentWithRetry) not explicitly specified by the original task action. Classified plan-amendment (not a code defect) in R01-QA and resolved by amending 01-01-PLAN.md (commit dcc1912), re-verified PASS in R01-VERIFICATION.md. The helper is correct, test-only, verified by TST-04, and stays unchanged; no product code modified. Resolution evidence is preserved in this round's `fail_classifications` and `files_modified`.
