---
phase: 9
round: 1
title: Disposition 8 pre-existing known issues as accepted process-exceptions
type: remediation
status: complete
completed: 2026-06-12
tasks_completed: 1
tasks_total: 1
commit_hashes: []
files_modified: []
deviations: []
known_issue_outcomes:
  - '{"test":"Audit Service (15 failing)","file":"backend/tests/services/audit.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; environment-dependent (audit chain/Redis/DB availability). Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 before any phase-09 work (verified in read-only worktree). Environment-dependent integration suite (audit chain/Redis/DB). Unrelated to the phase-09 change set (assignmentService guard, deleteAssignmentOrphan.stopped test, routes/schedule emit, frontend hooks invalidation) — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the audit/integration subsystem. Already accepted as a process-exception in prior phases."}'
  - '{"test":"Session Service > isTrustedDevice (1 failing)","file":"backend/tests/services/session.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; environment-dependent. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). Environment-dependent session suite. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the session/auth subsystem. Already accepted as a process-exception in prior phases."}'
  - '{"test":"boardAdminArchive > archives with empty body (1 failing)","file":"backend/src/routes/__tests__/boardAdminArchive.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; env-dependent. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). SQLite/env-dependent route suite. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the board-admin/archive subsystem. Already accepted as a process-exception in prior phases."}'
  - '{"test":"boardFiles broadened read policy (1 failing)","file":"backend/src/routes/__tests__/boardFiles.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; env-dependent. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). Environment-dependent route suite. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the board-files subsystem. Already accepted as a process-exception in prior phases."}'
  - '{"test":"pdfQueue > addPdfConversionJob (2 failing)","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; queue/env-dependent. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). Queue/env-dependent suite. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the PDF-queue subsystem. Already accepted as a process-exception in prior phases."}'
  - '{"test":"resolveAuthRateLimitMax import (TS2835)","file":"backend/src/middleware/__tests__/rateLimit.test.ts","error":"TS2835: Relative import ../rateLimit needs explicit .js extension. Introduced by prior auth commit e3333d2; confirmed pre-existing by git show e3333d2. Not in phase-09 scope.","disposition":"accepted-process-exception","rationale":"Pre-existing: TS2835 import-extension error introduced by the prior auth phase at commit e3333d2 (confirmed via git show e3333d2), so it fails before any phase-09 work. A phase-06 test file. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the auth middleware. Already accepted as a process-exception in prior phases."}'
  - '{"test":"templateAdapter > analyzeTemplate order (1 failing)","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; mock/LLM-order mismatch. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). Stale mock / LLM-call-order mismatch. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would require an unrelated template-adapter mock rewrite. Already accepted as a process-exception in prior phases."}'
  - '{"test":"templateMapping > queryFewShotExamples (3 failing)","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; test expects old orderBy shape (single object) vs current array. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). Stale mock — test expects the old orderBy shape (single object) vs the current array. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would require an unrelated template-mapping mock rewrite. Already accepted as a process-exception in prior phases."}'
---

Known-issues acceptance round for Phase 09: all 8 carried pre-existing test failures dispositioned as accepted-process-exception with no code changes.

## Task 1: Record accepted-process-exception dispositions for all 8 known issues

### What Was Built
- Formal disposition record for all 8 carried known issues, each accepted as a non-blocking process-exception for Phase 09.
- Confirmation that every carried issue is pre-existing (fails identically at parent commit e3333d2) and unrelated to the phase-09 change set (assignmentService guard, deleteAssignmentOrphan.stopped test, routes/schedule emit, frontend hooks invalidation).

### Files Modified
- None — documentation/acceptance round only; no product, source, or test code was edited.

### Known Issue Outcomes
- `Audit Service (15 failing)` (`backend/tests/services/audit.test.ts`) — `accepted-process-exception`: pre-existing at e3333d2, env-dependent integration suite (audit chain/Redis/DB), unrelated to phase-09 change set, out of scope.
- `Session Service > isTrustedDevice (1 failing)` (`backend/tests/services/session.test.ts`) — `accepted-process-exception`: pre-existing at e3333d2, env-dependent session suite, unrelated to phase-09 change set, out of scope.
- `boardAdminArchive > archives with empty body (1 failing)` (`backend/src/routes/__tests__/boardAdminArchive.test.ts`) — `accepted-process-exception`: pre-existing at e3333d2, SQLite/env-dependent route suite, unrelated to phase-09 change set, out of scope.
- `boardFiles broadened read policy (1 failing)` (`backend/src/routes/__tests__/boardFiles.test.ts`) — `accepted-process-exception`: pre-existing at e3333d2, env-dependent route suite, unrelated to phase-09 change set, out of scope.
- `pdfQueue > addPdfConversionJob (2 failing)` (`backend/src/services/__tests__/pdfQueue.test.ts`) — `accepted-process-exception`: pre-existing at e3333d2, queue/env-dependent suite, unrelated to phase-09 change set, out of scope.
- `resolveAuthRateLimitMax import (TS2835)` (`backend/src/middleware/__tests__/rateLimit.test.ts`) — `accepted-process-exception`: pre-existing TS2835 import-extension error introduced by the prior auth phase at e3333d2 (confirmed via git show), phase-06 file, unrelated to phase-09 change set, out of scope.
- `templateAdapter > analyzeTemplate order (1 failing)` (`backend/src/services/__tests__/templateAdapter.test.ts`) — `accepted-process-exception`: pre-existing at e3333d2, stale mock / LLM-call-order mismatch, unrelated to phase-09 change set, out of scope.
- `templateMapping > queryFewShotExamples (3 failing)` (`backend/src/services/__tests__/templateMapping.test.ts`) — `accepted-process-exception`: pre-existing at e3333d2, stale mock (old orderBy shape vs current array), unrelated to phase-09 change set, out of scope.

### Deviations
None

### Notes
This is an input_mode=known-issues acceptance round with 0 FAIL checks and 8 tracked known issues. It produces no commits and no product/source/test file changes — only this remediation summary artifact. All 8 dispositions are copied verbatim from the plan's authoritative `known_issue_resolutions` frontmatter. With these accepted, QA can return an empty `pre_existing_issues`, clearing the phase known-issues registry so UAT can proceed.
