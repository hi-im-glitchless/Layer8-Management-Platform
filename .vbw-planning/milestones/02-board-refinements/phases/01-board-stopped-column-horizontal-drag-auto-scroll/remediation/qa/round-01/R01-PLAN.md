---
phase: 1
round: 1
plan: R01
title: Stopped Column & Horizontal Drag Auto-Scroll — QA Remediation (plan amendment + accepted process exceptions)
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - .vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/01-01-PLAN.md
forbidden_commands:
  - prisma migrate
  - prisma db push
  - prisma migrate dev
  - prisma migrate reset
fail_classifications:
  - {id: "DEV-01", type: "plan-amendment", rationale: "DEVN-01: the new test backend/src/services/__tests__/boardAutoMove.stopped.test.ts includes a withDbRetry retry/backoff wrapper around its DB writes that the original task action did not explicitly specify. It is test-only (zero product-code changes), mirrors the established upsertAssignmentWithRetry pattern in scheduleIsolation.phase24.test.ts, and directly addresses the documented SQLite single-writer known issue under concurrent vitest workers. This is a legitimate improvement over the original plan, not a code defect — the helper is correct and stays. Resolve by amending 01-01-PLAN.md to record the actual approach; no product-code fix is required.", source_plan: "01-01-PLAN.md"}
known_issues_input:
  - '{"test":"pdfQueue > addPdfConversionJob > should reject an invalid file path / should reject an empty file path","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"expected error including 'Invalid DOCX path' but got 'Invalid source file path: ...' — stale expected error-message string; reproduces in isolation; file not touched by this plan"}'
  - '{"test":"scheduleIsolation.phase23/phase24 + audit/session services (concurrent run only)","file":"backend/src/services/__tests__/scheduleIsolation.phase24.test.ts","error":"SQLite single-writer 'Operation has timed out' / 'database is locked' under concurrent vitest workers — documented known-issue, passes in isolation; not caused by this plan"}'
  - '{"test":"templateAdapter > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"expected vi.fn() to be called with arguments [...] — stale mock expectation; reproduces in isolation; file not touched by this plan"}'
  - '{"test":"templateMapping > queryFewShotExamples > (sorted by usageCount DESC / filters by templateType+language / respects limit)","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"expected vi.fn() to be called with arguments [...] — stale mock expectation; reproduces in isolation; file not touched by this plan"}'
known_issue_resolutions:
  - '{"test":"pdfQueue > addPdfConversionJob > should reject an invalid file path / should reject an empty file path","file":"backend/src/services/__tests__/pdfQueue.test.ts","error":"expected error including 'Invalid DOCX path' but got 'Invalid source file path: ...' — stale expected error-message string; reproduces in isolation; file not touched by this plan","disposition":"accepted-process-exception","rationale":"Pre-existing stale expected-error-message string; pdfQueue.test.ts not touched by Phase 1; reproduces independently of board code; out of scope; kept visible in STATE.md backlog; non-blocking."}'
  - '{"test":"scheduleIsolation.phase23/phase24 + audit/session services (concurrent run only)","file":"backend/src/services/__tests__/scheduleIsolation.phase24.test.ts","error":"SQLite single-writer 'Operation has timed out' / 'database is locked' under concurrent vitest workers — documented known-issue, passes in isolation; not caused by this plan","disposition":"accepted-process-exception","rationale":"Documented SQLite single-writer timeout/lock under concurrent vitest workers; passes in isolation; scheduleIsolation.phase24.test.ts not touched by Phase 1; pre-existing environmental known-issue tracked in STATE.md; non-blocking."}'
  - '{"test":"templateAdapter > analyzeTemplate > calls Python service and LLM in correct order","file":"backend/src/services/__tests__/templateAdapter.test.ts","error":"expected vi.fn() to be called with arguments [...] — stale mock expectation; reproduces in isolation; file not touched by this plan","disposition":"accepted-process-exception","rationale":"Pre-existing stale vi.fn() mock-call expectation. templateAdapter.test.ts was not touched by Phase 1; failure reproduces independently of board code and is out of this milestone's scope. Kept visible in STATE.md backlog; non-blocking for this phase."}'
  - '{"test":"templateMapping > queryFewShotExamples > (sorted by usageCount DESC / filters by templateType+language / respects limit)","file":"backend/src/services/__tests__/templateMapping.test.ts","error":"expected vi.fn() to be called with arguments [...] — stale mock expectation; reproduces in isolation; file not touched by this plan","disposition":"accepted-process-exception","rationale":"Pre-existing stale vi.fn() mock-call expectation. templateMapping.test.ts was not touched by Phase 1; failure reproduces independently of board code and is out of this milestone's scope. Kept visible in STATE.md backlog; non-blocking for this phase."}'
must_haves:
  truths:
    - "01-01-PLAN.md records the actual test approach: boardAutoMove.stopped.test.ts wraps its DB writes in a withDbRetry retry/backoff helper (mirroring scheduleIsolation's upsertAssignmentWithRetry) to absorb SQLite single-writer lock timeouts under concurrent vitest workers."
    - "The DEV-01 deviation is marked resolved-by-amendment in 01-01-PLAN.md; the withDbRetry helper stays in the test file unchanged (it is correct, test-only, and not product code)."
    - "No product code is changed this round; the only edit is to the planning artifact 01-01-PLAN.md."
    - "The four carried known issues remain documented as accepted process exceptions and are NOT fixed here (pre-existing, out of this phase's scope)."
  artifacts:
    - path: ".vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/01-01-PLAN.md"
      provides: "Amended phase plan recording the actual withDbRetry test approach as a resolved deviation"
      contains: "withDbRetry"
  key_links:
    - from: ".vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/01-01-PLAN.md amendment note"
      to: "backend/src/services/__tests__/boardAutoMove.stopped.test.ts withDbRetry helper"
      via: "amendment documents the actual retry/backoff wrapper used in the regression test"
---
<objective>
Resolve the single Phase 1 verification FAIL (DEV-01 / DEVN-01) via a plan amendment,
and formally disposition the four carried known issues as accepted process exceptions.

DEV-01 is NOT a code defect: the boardAutoMove.stopped.test.ts regression test added a
test-only `withDbRetry` retry/backoff wrapper around its DB writes — mirroring the
established `upsertAssignmentWithRetry` pattern in scheduleIsolation.phase24.test.ts —
to absorb SQLite single-writer lock timeouts under concurrent vitest workers. This is a
legitimate improvement over what the original plan task literally specified. The fix is
to amend 01-01-PLAN.md to record the actual approach and mark the deviation
resolved-by-amendment. The helper stays as-is. NO product code changes this round.

The four carried test failures (pdfQueue, scheduleIsolation, templateAdapter,
templateMapping) are pre-existing, live in files Phase 1 did not touch, and reproduce
independently of board/stage code. They are accepted process exceptions, kept visible in
the STATE.md backlog, and are explicitly out of scope here. Do NOT attempt to fix them.
</objective>
<context>
@.vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/01-VERIFICATION.md
@.vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/01-01-PLAN.md
@.vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/remediation/qa/round-01/R01-KNOWN-ISSUES.json
Verification: 34/35 PASS; the single FAIL is DEV-01 (declared deviation, test-only helper).
TST-04 confirms withDbRetry is test-only and mirrors upsertAssignmentWithRetry in
scheduleIsolation.phase24.test.ts. The helper is correct and verified — do not modify it.
This round edits ONLY a planning artifact; it touches no product code and runs no commands
against the DB. Schedule isolation is trivially preserved (no Assignment/TeamMember/
Absence/Holiday access introduced).
</context>
<tasks>
<task type="auto">
  <name>Amend 01-01-PLAN.md to record the actual withDbRetry test approach (resolve DEV-01)</name>
  <files>
    .vbw-planning/phases/01-board-stopped-column-horizontal-drag-auto-scroll/01-01-PLAN.md
  </files>
  <action>
Edit the original phase plan 01-01-PLAN.md to record the actual implementation of the
"Backend test: auto-mover skips Stopped cards" task and mark the DEV-01 / DEVN-01
deviation resolved-by-amendment. Make ALL of the following edits:

1. In the test task's <action> block (the "Backend test: auto-mover skips Stopped cards"
   task), append an explicit note that the test wraps its DB writes (seed + the rows it
   creates) in a `withDbRetry` retry/backoff helper, mirroring the
   `upsertAssignmentWithRetry` pattern used by the scheduleIsolation.phase23/phase24 test
   suites, to absorb SQLite single-writer "Operation has timed out" / "database is locked"
   errors under concurrent vitest workers. State that the helper is test-only (no product
   code), local to boardAutoMove.stopped.test.ts, and does not weaken schedule isolation.

2. In the test task's <done> block, add that the seed/control DB writes are guarded by the
   test-local withDbRetry backoff wrapper.

3. Add a brief amendment/deviation note in the plan (e.g. an "Amendments (R01-QA)" line
   near the test task or at the foot of the plan body) recording: DEV-01 / DEVN-01 —
   actual approach added a test-only withDbRetry retry/backoff wrapper around the test's
   DB writes (mirroring scheduleIsolation's upsertAssignmentWithRetry); the original task
   action did not explicitly specify it; classified plan-amendment in R01-QA; resolved by
   this amendment; the helper is correct and stays.

Do NOT change any frontmatter must_haves, files_modified, or any product-code-related
task. Do NOT touch boardAutoMove.stopped.test.ts or any other code file — the helper is
correct and verified (VERIFICATION TST-04). This is a documentation-only amendment of the
planning artifact.
  </action>
  <verify>
- grep `withDbRetry` in 01-01-PLAN.md returns a match (the new note exists).
- grep `upsertAssignmentWithRetry` in 01-01-PLAN.md returns a match (pattern reference recorded).
- Confirm the plan body now contains an amendment/deviation note referencing DEV-01 / DEVN-01 as resolved.
- git status shows only .vbw-planning/.../01-01-PLAN.md modified — NO product code or test file changed.
  </verify>
  <done>
01-01-PLAN.md's test task documents the actual withDbRetry retry/backoff approach
(mirroring upsertAssignmentWithRetry) and carries an amendment note marking DEV-01 /
DEVN-01 resolved-by-amendment; no code files were modified.
  </done>
</task>
</tasks>
<verification>
1. 01-01-PLAN.md contains `withDbRetry` and `upsertAssignmentWithRetry` and an amendment note resolving DEV-01 / DEVN-01.
2. No product code or test file changed this round (git status: only 01-01-PLAN.md modified).
3. The withDbRetry helper in boardAutoMove.stopped.test.ts is left untouched (it is correct, test-only, verified by TST-04).
4. All four carried known issues are dispositioned accepted-process-exception in frontmatter; none were fixed or reopened.
5. No DB commands run; no Assignment/TeamMember/Absence/Holiday access introduced (schedule isolation trivially preserved).
</verification>
<success_criteria>
- The single verification FAIL (DEV-01) is resolved via amendment to 01-01-PLAN.md, which now records the actual test-only withDbRetry retry/backoff approach mirroring scheduleIsolation's upsertAssignmentWithRetry.
- The withDbRetry helper remains in place unchanged; no product-code fix was invented.
- The four carried known issues are recorded as accepted process exceptions (pre-existing, files untouched by this phase, reproduce independently), kept visible in the STATE.md backlog, and do not block or reopen the round.
- This round touches only the planning artifact; schedule isolation is preserved.
</success_criteria>
<known_issue_workflow>
- All four carried known issues appear verbatim in `known_issues_input` and each has a matching `accepted-process-exception` entry in `known_issue_resolutions`.
- Disposition rationale for each: pre-existing failure in a file Phase 1 did not touch, reproduces independently of board/stage code, out of this milestone's scope, kept visible via STATE.md backlog — verified non-blocking for this phase, not carried forward as unresolved.
- No carried known issue was fixed, dropped, or reopened this round.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
