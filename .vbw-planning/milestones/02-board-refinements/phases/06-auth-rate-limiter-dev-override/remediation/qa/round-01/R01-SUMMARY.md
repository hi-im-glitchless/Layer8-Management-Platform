---
phase: 6
round: 1
title: Disposition 7 pre-existing known issues as accepted process-exceptions
type: remediation
status: complete
completed: 2026-06-16
tasks_completed: 1
tasks_total: 1
commit_hashes: []
files_modified: []
deviations: []
known_issue_outcomes:
  - '{"test": "Audit Service (queryAuditLogs / exportAuditLogs / verifyAuditChain / concurrent writes)", "file": "backend/tests/services/audit.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "Session Service > isTrustedDevice > should return true for valid trusted device", "file": "backend/tests/services/session.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "boardAdminArchive > POST cards admin archive > archives with empty body and a valid ADMIN session returns 200", "file": "backend/src/routes/__tests__/boardAdminArchive.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "boardAutoMove.stopped > autoMoveCards Stopped exclusion > does NOT move a stage=stopped card", "file": "backend/src/services/__tests__/boardAutoMove.stopped.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "pdfQueue > addPdfConversionJob > should reject an invalid/empty file path", "file": "backend/src/services/__tests__/pdfQueue.test.ts", "error": "stale expected error-message string (expected Invalid DOCX path, got Invalid source file path); file not touched by this plan; reproduces independently; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "templateAdapter > analyzeTemplate > calls Python service and LLM in correct order", "file": "backend/src/services/__tests__/templateAdapter.test.ts", "error": "stale vi.fn mock-call expectation; file not touched by this plan; reproduces independently; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "templateMapping > queryFewShotExamples (sorted by usageCount DESC / filters by templateType+language / respects limit)", "file": "backend/src/services/__tests__/templateMapping.test.ts", "error": "stale vi.fn mock-call expectation; orderBy shape drifted to confidence+usageCount array; file not touched by this plan; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
---

Known-issues acceptance round for Phase 06: all 7 carried pre-existing test failures dispositioned
as accepted-process-exception with no code changes.

## Task 1: Record accepted-process-exception dispositions for all 7 known issues

### Files Modified
- None - documentation/acceptance round only; no product, source, or test code was edited.

### Known Issue Outcomes
- `Audit Service (queryAuditLogs / exportAuditLogs / verifyAuditChain / concurrent writes)` (`backend/tests/services/audit.test.ts`) - accepted-process-exception: pre-existing at e3333d2, unrelated to the phase-06 change set, out of scope.
- `Session Service > isTrustedDevice > should return true for valid trusted device` (`backend/tests/services/session.test.ts`) - accepted-process-exception: pre-existing at e3333d2, unrelated to the phase-06 change set, out of scope.
- `boardAdminArchive > POST cards admin archive > archives with empty body and a valid ADMIN session returns 200` (`backend/src/routes/__tests__/boardAdminArchive.test.ts`) - accepted-process-exception: pre-existing at e3333d2, unrelated to the phase-06 change set, out of scope.
- `boardAutoMove.stopped > autoMoveCards Stopped exclusion > does NOT move a stage=stopped card` (`backend/src/services/__tests__/boardAutoMove.stopped.test.ts`) - accepted-process-exception: pre-existing at e3333d2, unrelated to the phase-06 change set, out of scope.
- `pdfQueue > addPdfConversionJob > should reject an invalid/empty file path` (`backend/src/services/__tests__/pdfQueue.test.ts`) - accepted-process-exception: pre-existing at e3333d2, unrelated to the phase-06 change set, out of scope.
- `templateAdapter > analyzeTemplate > calls Python service and LLM in correct order` (`backend/src/services/__tests__/templateAdapter.test.ts`) - accepted-process-exception: pre-existing at e3333d2, unrelated to the phase-06 change set, out of scope.
- `templateMapping > queryFewShotExamples (sorted by usageCount DESC / filters by templateType+language / respects limit)` (`backend/src/services/__tests__/templateMapping.test.ts`) - accepted-process-exception: pre-existing at e3333d2, unrelated to the phase-06 change set, out of scope.

### Deviations
None

### Notes
This is an input_mode=known-issues acceptance round with 0 FAIL checks and 7 tracked known issues.
It produces no commits and no product/source/test file changes - only this remediation summary artifact.
All 7 dispositions are copied verbatim from the plan's known_issue_resolutions frontmatter. With these
accepted, the phase-06 known-issues registry is cleared so the milestone can proceed to archive.
