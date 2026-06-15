---
phase: 9
round: 1
plan: R01
title: Disposition 8 pre-existing known issues as accepted process-exceptions
type: remediation
autonomous: true
effort_override: fast
skills_used: []
files_modified: []
forbidden_commands: []
fail_classifications: []
known_issues_input:
  - '{"test":"Audit Service (15 failing)","file":"backend/tests/services/audit.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; environment-dependent (audit chain/Redis/DB availability). Does not reference assignmentService."}'
  - '{"test":"Session Service > isTrustedDevice (1 failing)","file":"backend/tests/services/session.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; environment-dependent. Does not reference assignmentService."}'
  - '{"test":"boardAdminArchive > archives with empty body (1 failing)","file":"backend/src/routes/__tests__/boardAdminArchive.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; env-dependent. Does not reference assignmentService."}'
  - '{"test":"boardFiles broadened read policy (1 failing)","file":"backend/src/routes/__tests__/boardFiles.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; env-dependent. Does not reference assignmentService."}'
  - '{"test":"pdfQueue > addPdfConversionJob (2 failing)","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; queue/env-dependent. Does not reference assignmentService."}'
  - '{"test":"resolveAuthRateLimitMax import (TS2835)","file":"backend/src/middleware/__tests__/rateLimit.test.ts","error":"TS2835: Relative import ../rateLimit needs explicit .js extension. Introduced by prior auth commit e3333d2; confirmed pre-existing by git show e3333d2. Not in phase-09 scope."}'
  - '{"test":"templateAdapter > analyzeTemplate order (1 failing)","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; mock/LLM-order mismatch. Does not reference assignmentService."}'
  - '{"test":"templateMapping > queryFewShotExamples (3 failing)","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; test expects old orderBy shape (single object) vs current array. Does not reference assignmentService."}'
known_issue_resolutions:
  - '{"test":"Audit Service (15 failing)","file":"backend/tests/services/audit.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; environment-dependent (audit chain/Redis/DB availability). Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 before any phase-09 work (verified in read-only worktree). Environment-dependent integration suite (audit chain/Redis/DB). Unrelated to the phase-09 change set (assignmentService guard, deleteAssignmentOrphan.stopped test, routes/schedule emit, frontend hooks invalidation) — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the audit/integration subsystem. Already accepted as a process-exception in prior phases."}'
  - '{"test":"Session Service > isTrustedDevice (1 failing)","file":"backend/tests/services/session.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; environment-dependent. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). Environment-dependent session suite. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the session/auth subsystem. Already accepted as a process-exception in prior phases."}'
  - '{"test":"boardAdminArchive > archives with empty body (1 failing)","file":"backend/src/routes/__tests__/boardAdminArchive.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; env-dependent. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). SQLite/env-dependent route suite. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the board-admin/archive subsystem. Already accepted as a process-exception in prior phases."}'
  - '{"test":"boardFiles broadened read policy (1 failing)","file":"backend/src/routes/__tests__/boardFiles.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; env-dependent. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). Environment-dependent route suite. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the board-files subsystem. Already accepted as a process-exception in prior phases."}'
  - '{"test":"pdfQueue > addPdfConversionJob (2 failing)","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; queue/env-dependent. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). Queue/env-dependent suite. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the PDF-queue subsystem. Already accepted as a process-exception in prior phases."}'
  - '{"test":"resolveAuthRateLimitMax import (TS2835)","file":"backend/src/middleware/__tests__/rateLimit.test.ts","error":"TS2835: Relative import ../rateLimit needs explicit .js extension. Introduced by prior auth commit e3333d2; confirmed pre-existing by git show e3333d2. Not in phase-09 scope.","disposition":"accepted-process-exception","rationale":"Pre-existing: TS2835 import-extension error introduced by the prior auth phase at commit e3333d2 (confirmed via git show e3333d2), so it fails before any phase-09 work. A phase-06 test file. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would scope-creep into the auth middleware. Already accepted as a process-exception in prior phases."}'
  - '{"test":"templateAdapter > analyzeTemplate order (1 failing)","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; mock/LLM-order mismatch. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). Stale mock / LLM-call-order mismatch. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would require an unrelated template-adapter mock rewrite. Already accepted as a process-exception in prior phases."}'
  - '{"test":"templateMapping > queryFewShotExamples (3 failing)","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"Pre-existing failure verified at parent commit e3333d2; test expects old orderBy shape (single object) vs current array. Does not reference assignmentService.","disposition":"accepted-process-exception","rationale":"Pre-existing: fails identically at parent commit e3333d2 (verified in read-only worktree). Stale mock — test expects the old orderBy shape (single object) vs the current array. Unrelated to the phase-09 change set — does not reference assignmentService/deleteAssignment. Out of phase-09 scope; fixing would require an unrelated template-mapping mock rewrite. Already accepted as a process-exception in prior phases."}'
must_haves:
  truths:
    - "All 8 carried known issues are dispositioned as accepted-process-exception with a per-issue rationale."
    - "No product, source, or test code is modified this round (files_modified is empty)."
    - "Every carried issue is pre-existing (fails at parent commit e3333d2) and unrelated to the phase-09 change set."
  artifacts:
    - {path: "R01-SUMMARY.md", provides: "round outcome record", contains: "accepted-process-exception"}
  key_links:
    - {from: "R01-KNOWN-ISSUES.json", to: "R01-PLAN.md", via: "all 8 issues copied into known_issues_input and known_issue_resolutions"}
---
<objective>
Phase 09 (planner orphan on schedule delete) passed QA on its own contract (36/36) with 0 FAIL checks. The only thing blocking UAT is 8 tracked known issues that must be formally dispositioned. All 8 are genuinely pre-existing: each fails identically at the parent commit e3333d2 (verified in a read-only git worktree before any phase-09 work), and none reference the phase-09 change set (assignmentService guard, deleteAssignmentOrphan.stopped test, routes/schedule emit, frontend hooks invalidation). This is a documentation/acceptance round only. Record each of the 8 as an accepted-process-exception with a credible per-issue rationale. Do NOT modify any product, source, or test code, and do NOT attempt to fix the unrelated suites — doing so would scope-creep into auth middleware, env-dependent integration suites, or unrelated template/mock rewrites.
</objective>
<context>
@R01-KNOWN-ISSUES.json
</context>
<tasks>
<task type="auto">
  <name>Record accepted-process-exception dispositions for all 8 known issues</name>
  <files>
    (none — documentation/acceptance only; no files are edited)
  </files>
  <action>
This is a triage/acceptance task with NO code changes. Confirm the disposition of each of the 8 carried known issues already encoded in this plan's `known_issue_resolutions` frontmatter:
1. backend/tests/services/audit.test.ts — Audit Service (15 failing) — env-dependent
2. backend/tests/services/session.test.ts — Session Service > isTrustedDevice (1 failing) — env-dependent
3. backend/src/routes/__tests__/boardAdminArchive.test.ts — archives with empty body (1 failing) — SQLite/env-dependent
4. backend/src/routes/__tests__/boardFiles.test.ts — broadened read policy (1 failing) — env-dependent
5. backend/src/services/__tests__/pdfQueue.test.ts — addPdfConversionJob (2 failing) — queue/env-dependent
6. backend/src/middleware/__tests__/rateLimit.test.ts — resolveAuthRateLimitMax import (TS2835) — phase-06 auth file, introduced at e3333d2
7. backend/src/services/__tests__/templateAdapter.test.ts — analyzeTemplate order (1 failing) — stale mock / LLM-call-order
8. backend/src/services/__tests__/templateMapping.test.ts — queryFewShotExamples (3 failing) — stale mock / orderBy shape
Each is dispositioned `accepted-process-exception` because it is pre-existing (fails at parent commit e3333d2), unrelated to the phase-09 change set (does not reference assignmentService/deleteAssignment), and out of phase-09 scope. Do NOT edit any of these files. Do NOT touch the phase-09 change-set files. Produce no code diff.
  </action>
  <verify>
- `git status --porcelain` shows no product/source/test code modifications attributable to this round.
- All 8 entries in `known_issue_resolutions` carry `disposition: accepted-process-exception` and a non-empty rationale.
- `known_issues_input` and `known_issue_resolutions` each contain exactly the 8 issues from R01-KNOWN-ISSUES.json (no additions, no omissions).
- No FAIL classifications exist (fail_classifications is empty).
  </verify>
  <done>
All 8 known issues are recorded as accepted-process-exception with per-issue rationale; no code is changed; R01-SUMMARY.md documents the dispositions.
  </done>
</task>
</tasks>
<verification>
1. `git diff --name-only` over the round shows zero product/source/test code files changed.
2. Each of the 8 known issues appears in both `known_issues_input` and `known_issue_resolutions` with matching {test,file,error}.
3. Every `known_issue_resolutions` entry has disposition `accepted-process-exception` and a rationale citing: pre-existing at e3333d2, unrelated to the phase-09 change set, out of phase-09 scope.
4. `fail_classifications` is empty (no FAIL rows this round).
</verification>
<success_criteria>
- All 8 known issues dispositioned as accepted-process-exception with credible per-issue rationale.
- No product, source, or test code is modified.
- QA can return an empty `pre_existing_issues`, clearing the phase known-issues registry so UAT can proceed.
</success_criteria>
<known_issue_workflow>
- `known_issues_input` and `known_issue_resolutions` both contain all 8 carried issues from R01-KNOWN-ISSUES.json, in the canonical {test,file,error} shape.
- Every resolution uses disposition `accepted-process-exception` (verified non-blocking carryover for this phase).
- No issue is omitted from either array — the deterministic gate treats missing coverage as a failed round.
- This round resolves the dispositions by acceptance, not by code change; no suite is "fixed."
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
