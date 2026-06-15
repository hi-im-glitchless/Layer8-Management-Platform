---
phase: 6
round: 1
plan: R01
title: Disposition 7 pre-existing known issues as accepted process-exceptions
type: remediation
autonomous: true
effort_override: fast
skills_used: []
files_modified: []
forbidden_commands: []
fail_classifications: []
known_issues_input:
  - '{"test": "Audit Service (queryAuditLogs / exportAuditLogs / verifyAuditChain / concurrent writes)", "file": "backend/tests/services/audit.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2"}'
  - '{"test": "Session Service > isTrustedDevice > should return true for valid trusted device", "file": "backend/tests/services/session.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2"}'
  - '{"test": "boardAdminArchive > POST cards admin archive > archives with empty body and a valid ADMIN session returns 200", "file": "backend/src/routes/__tests__/boardAdminArchive.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2"}'
  - '{"test": "boardAutoMove.stopped > autoMoveCards Stopped exclusion > does NOT move a stage=stopped card", "file": "backend/src/services/__tests__/boardAutoMove.stopped.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2"}'
  - '{"test": "pdfQueue > addPdfConversionJob > should reject an invalid/empty file path", "file": "backend/src/services/__tests__/pdfQueue.test.ts", "error": "stale expected error-message string (expected Invalid DOCX path, got Invalid source file path); file not touched by this plan; reproduces independently; pre-existing at parent commit e3333d2"}'
  - '{"test": "templateAdapter > analyzeTemplate > calls Python service and LLM in correct order", "file": "backend/src/services/__tests__/templateAdapter.test.ts", "error": "stale vi.fn mock-call expectation; file not touched by this plan; reproduces independently; pre-existing at parent commit e3333d2"}'
  - '{"test": "templateMapping > queryFewShotExamples (sorted by usageCount DESC / filters by templateType+language / respects limit)", "file": "backend/src/services/__tests__/templateMapping.test.ts", "error": "stale vi.fn mock-call expectation; orderBy shape drifted to confidence+usageCount array; file not touched by this plan; pre-existing at parent commit e3333d2"}'
known_issue_resolutions:
  - '{"test": "Audit Service (queryAuditLogs / exportAuditLogs / verifyAuditChain / concurrent writes)", "file": "backend/tests/services/audit.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "Session Service > isTrustedDevice > should return true for valid trusted device", "file": "backend/tests/services/session.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "boardAdminArchive > POST cards admin archive > archives with empty body and a valid ADMIN session returns 200", "file": "backend/src/routes/__tests__/boardAdminArchive.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "boardAutoMove.stopped > autoMoveCards Stopped exclusion > does NOT move a stage=stopped card", "file": "backend/src/services/__tests__/boardAutoMove.stopped.test.ts", "error": "SQLite single-writer lock/timeout under concurrent vitest workers; passes in isolation; file not touched by this plan; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "pdfQueue > addPdfConversionJob > should reject an invalid/empty file path", "file": "backend/src/services/__tests__/pdfQueue.test.ts", "error": "stale expected error-message string (expected Invalid DOCX path, got Invalid source file path); file not touched by this plan; reproduces independently; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "templateAdapter > analyzeTemplate > calls Python service and LLM in correct order", "file": "backend/src/services/__tests__/templateAdapter.test.ts", "error": "stale vi.fn mock-call expectation; file not touched by this plan; reproduces independently; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
  - '{"test": "templateMapping > queryFewShotExamples (sorted by usageCount DESC / filters by templateType+language / respects limit)", "file": "backend/src/services/__tests__/templateMapping.test.ts", "error": "stale vi.fn mock-call expectation; orderBy shape drifted to confidence+usageCount array; file not touched by this plan; pre-existing at parent commit e3333d2", "disposition": "accepted-process-exception", "rationale": "Pre-existing: fails identically at parent commit e3333d2 before any phase-06 work. Unrelated to the phase-06 change set (resolveAuthRateLimitMax dev-override in backend/src/middleware/rateLimit.ts and its unit test) - the file is not referenced or modified by this plan. Environment/concurrency- or stale-mock-dependent failure in an unmodified suite; out of phase-06 scope. Accepted as a non-blocking process-exception."}'
must_haves:
  truths:
    - "All 7 carried known issues are dispositioned as accepted-process-exception with a per-issue rationale."
    - "No product, source, or test code is modified this round (files_modified is empty)."
    - "Every carried issue is pre-existing (fails at parent commit e3333d2) and unrelated to the phase-06 change set."
  artifacts:
    - {path: "R01-SUMMARY.md", provides: "round outcome record", contains: "accepted-process-exception"}
  key_links:
    - {from: "R01-KNOWN-ISSUES.json", to: "R01-PLAN.md", via: "all 7 issues copied into known_issues_input and known_issue_resolutions"}
---
<objective>
Phase 06 (auth rate limiter dev override) passed QA on its own contract (18/18) with 0 FAIL checks.
The only thing blocking UAT/archive is 7 tracked known issues that must be formally dispositioned.
All 7 are genuinely pre-existing: each fails identically at the parent commit e3333d2 before any
phase-06 work, and none reference the phase-06 change set (resolveAuthRateLimitMax in rateLimit.ts +
its unit test). Record each of the 7 as an accepted-process-exception with a credible per-issue
rationale. Do NOT modify any product, source, or test code.
</objective>
<context>
@R01-KNOWN-ISSUES.json
</context>
<tasks>
<task type="auto">
  <name>Record accepted-process-exception dispositions for all 7 known issues</name>
  <files>
    (none - documentation/acceptance only; no files are edited)
  </files>
  <action>
Confirm the disposition of each of the 7 carried known issues already encoded in this plan's
known_issue_resolutions frontmatter. Each is accepted-process-exception because it is pre-existing
(fails at parent commit e3333d2), unrelated to the phase-06 change set, and out of phase-06 scope.
Produce no code diff.
  </action>
  <done>
All 7 known issues recorded as accepted-process-exception with per-issue rationale; no code changed.
  </done>
</task>
</tasks>
<output>
R01-SUMMARY.md
</output>
