---
phase: 23
round: 1
plan: R01
title: "MH-02 archive-validation deviation: declare project-model amendment + correct stale JSDoc"
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - backend/src/services/boardArchiveService.ts
  - .vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md
  - .vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md
forbidden_commands: []
fail_classifications:
  - {id: "MH-02", type: "code-fix", rationale: "Runtime behavior is already CORRECT for the current Phase 24-R03 data model — boardArchiveService.ts validates confirmProjectName against card.project.name and assignment.projectName no longer exists, so the logic must NOT be reverted to the plan's stale assignment-model spec. The FAIL is internal inconsistency in the file's own documentation: the JSDoc still describes a 'BoardCard.assignment join' (lines ~4-12, ~42) and lists a phantom NO_ASSIGNMENT error code (line ~46) that is absent from the ArchiveErrorCode type (line 18) and never thrown. The required source edit is a real change to boardArchiveService.ts (JSDoc + error-code comment correction, no logic change), which is the primary change-evidence for this round. Paired with a plan-amendment task so the structural project-model deviation is formally declared in 23-05's plan/summary."
known_issues_input: []
known_issue_resolutions: []
must_haves:
  truths:
    - "boardArchiveService.ts JSDoc describes the actual project join (card.project.name) and no longer mentions a 'BoardCard.assignment join' or assignment.projectName for confirmation"
    - "boardArchiveService.ts JSDoc no longer lists the phantom NO_ASSIGNMENT error code; documented codes match the ArchiveErrorCode type exactly (NOT_FOUND | PROJECT_NAME_MISMATCH)"
    - "Runtime validation logic in archiveCard is unchanged — still includes project: { select: { name: true } } and compares card.project.name !== confirmProjectName"
    - "23-05-SUMMARY.md deviations[] declares that archive validation uses card.project.name per the Phase 24-R03 BoardCard→Project model, replacing the original card.assignment.projectName spec"
    - "23-05-PLAN.md carries a resolved-by-amendment marker recording the project-model validation deviation for MH-02 with rationale"
  artifacts:
    - path: backend/src/services/boardArchiveService.ts
      provides: "JSDoc consistent with the actual project-join validation; no phantom error code"
      contains: "project.name"
    - path: .vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md
      provides: "declared deviation for the project-model archive validation"
      contains: "project.name"
    - path: .vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md
      provides: "resolved-by-amendment marker for MH-02 project-model deviation"
      contains: "resolved-by-amendment"
  key_links:
    - from: .vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md
      to: backend/src/services/boardArchiveService.ts
      via: "amendment declares the project-model validation the code actually implements"
---
<objective>
Resolve the single FAIL (MH-02) from 23-VERIFICATION.md. The undeclared deviation is that `boardArchiveService.ts` validates `confirmProjectName` against `card.project.name` (the current Phase 24-R03 BoardCard→Project model) instead of the `card.assignment.projectName` the 23-05 plan specified. The runtime behavior is CORRECT — `assignment.projectName` no longer exists, so the code must NOT be reverted. The fix is two-fold: (1) correct the file's stale JSDoc and remove a phantom error-code reference so the documentation matches the real code, and (2) formally declare the structural deviation in 23-05-PLAN.md and 23-05-SUMMARY.md. Scope is strictly MH-02 — the other 21 must-haves PASS and must not be touched, including all schedule-isolation and markdown-sanitization invariants.
</objective>
<context>
@.vbw-planning/phases/23-project-board-files-notes/23-VERIFICATION.md
@.vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md
@.vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md
@backend/src/services/boardArchiveService.ts
</context>
<tasks>
<!-- Tasks are executed sequentially — task N+1 sees the results of task N.
     Task 1 is the real source change-evidence; Task 2 declares the deviation. -->
<task type="auto">
  <name>Correct stale JSDoc + remove phantom NO_ASSIGNMENT in boardArchiveService.ts</name>
  <files>
    backend/src/services/boardArchiveService.ts
  </files>
  <action>
Correct the file's documentation to match the actual runtime code. DO NOT change any runtime/validation logic — `include: { project: { select: { name: true } } }` (line ~59) and `card.project.name !== confirmProjectName` (line ~64) are correct for the Phase 24-R03 BoardCard→Project model and must remain exactly as-is.

Specifically:
1. Module-header JSDoc (lines ~4-12, the SCHEDULE-ISOLATION INVARIANT block): the wording "the read-only `BoardCard.assignment` join below (which fetches only the linked Assignment's `projectName`)" is stale — the code joins `project`, not `assignment`. Rewrite that phrasing so the read-only-join example references the actual `project` relation join (`project: { select: { name: true } }`, fetching the Project's `name` for typed-confirmation). Keep the schedule-isolation invariant intent intact (the module still must not call prisma.assignment.* / teamMember.* / absence.* / holiday.*) — only fix the inaccurate description of WHAT the read join is.
2. `archiveCard` JSDoc (lines ~35-50): the line "The linked Assignment is read-only here — only `projectName` is fetched for confirmation, never written." is stale — replace it to describe that the linked Project is read-only here and only its `name` is fetched for typed-confirmation.
3. In the same JSDoc's "Throws `ArchiveError` on policy violations" list (lines ~44-47), REMOVE the `NO_ASSIGNMENT — card has no linked Assignment (cannot confirm)` line. `NO_ASSIGNMENT` is a phantom code: it is NOT in the `ArchiveErrorCode` type (line 18: `'NOT_FOUND' | 'PROJECT_NAME_MISMATCH'`) and is never thrown. The remaining documented codes must be exactly `NOT_FOUND` and `PROJECT_NAME_MISMATCH`, matching the type.

Do not edit the `ArchiveErrorCode` type, the `ArchiveError` class, the `findUnique` include, the validation comparison, the transaction, or any return value.
  </action>
  <verify>
Run from backend/:
- `grep -nE 'assignment' src/services/boardArchiveService.ts` → ZERO matches (no stale assignment-join wording remains anywhere in the file).
- `grep -n 'NO_ASSIGNMENT' src/services/boardArchiveService.ts` → ZERO matches.
- `grep -n 'project.name\|project: { select: { name: true } }' src/services/boardArchiveService.ts` → still present (runtime logic untouched).
- `grep -n "MUST NOT\|SCHEDULE-ISOLATION" src/services/boardArchiveService.ts` → invariant header still present.
- `npx tsc --noEmit 2>&1 | head -20` → zero errors.
  </verify>
  <done>
boardArchiveService.ts JSDoc describes the actual `project` join and Project `name` confirmation; contains no "assignment" wording and no `NO_ASSIGNMENT` reference; documented error codes are exactly `NOT_FOUND` and `PROJECT_NAME_MISMATCH`; runtime logic (include, comparison, transaction, return) is byte-identical to before; tsc passes.
  </done>
</task>
<task type="auto">
  <name>Declare the project-model archive-validation deviation in 23-05 plan + summary</name>
  <files>
    .vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md
    .vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md
  </files>
  <action>
Formally declare the structural deviation that archive validation uses `card.project.name` per the Phase 24-R03 BoardCard→Project model, replacing the original `card.assignment.projectName` spec in 23-05.

1. In `23-05-SUMMARY.md`, ADD one new entry to the frontmatter `deviations:` array (append as a new string list item, do not remove or reword existing entries). The entry must state: archive validation in `boardArchiveService.ts` matches `confirmProjectName` against `card.project.name` (via the `project: { select: { name: true } }` join), NOT `card.assignment.projectName` as the 23-05 plan body specified; this is because Phase 24-R03 changed the data model so `BoardCard` links directly to `Project` and `assignment.projectName` no longer exists; the runtime behavior is correct for the current model and was NOT reverted; tag it as `(MH-02, R01-QA — resolved-by-amendment; see remediation/qa/round-01/R01-PLAN.md)`.
2. In `23-05-PLAN.md`, APPEND a new amendment block at the end of the file (mirroring the existing "Task 5 — Amendment (QA Round 01, resolved-by-amendment)" block's style — additive, post-hoc, preserves original text). Title it for Task 2/Task 3 archive validation, e.g. `### Task 2 & Task 3 — Amendment (QA Round 01, resolved-by-amendment): project-model archive validation`. It must record:
   - Source FAIL ID: `MH-02` (from 23-VERIFICATION.md).
   - Status: `resolved-by-amendment`. The original Task 2/Task 3 spec text (validating against `card.assignment.projectName`, and the `NO_ASSIGNMENT` ArchiveError variant) is preserved verbatim for historical record; this amendment is purely additive.
   - What is authoritative for Phase 23: `archiveCard` validates `confirmProjectName` against `card.project.name` using `include: { project: { select: { name: true } } }`; the original `assignment.projectName` spec and the `NO_ASSIGNMENT` error variant are obsolete.
   - Rationale: Phase 24-R03 restructured the data model so `BoardCard` links directly to `Project`; `assignment.projectName` no longer exists. The code is behaviorally correct for the current model and was deliberately NOT reverted to the stale spec. The companion R01 code-fix (Task 1) corrected the file's own JSDoc and removed the phantom `NO_ASSIGNMENT` reference so the source is internally consistent.
   - Cross-references: this remediation plan `remediation/qa/round-01/R01-PLAN.md` (Task 2), the source file `backend/src/services/boardArchiveService.ts`, and 23-VERIFICATION.md MH-02.

Do NOT alter the 23-05 plan body's original Task 2/Task 3 code sketches or any other must_have, ac_result, or deviation. Append only.
  </action>
  <verify>
- `grep -n 'project.name' .vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md` → new deviation entry present.
- `grep -n 'MH-02' .vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md .vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md` → referenced in both.
- `grep -n 'resolved-by-amendment' .vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md` → at least two amendment blocks now (Task 5 + the new project-model block).
- Confirm existing deviation entries and ac_results in 23-05-SUMMARY.md are unchanged (no diff to prior list items).
  </verify>
  <done>
23-05-SUMMARY.md deviations[] contains a new entry declaring the `card.project.name` validation per the Phase 24-R03 model (with MH-02 / R01-QA / resolved-by-amendment tag); 23-05-PLAN.md carries an appended resolved-by-amendment block for MH-02 referencing this R01-PLAN, the source file, and the rationale; all pre-existing entries preserved verbatim.
  </done>
</task>
</tasks>
<verification>
1. `grep -nE 'assignment' backend/src/services/boardArchiveService.ts` → zero matches (no stale assignment-join wording; runtime never referenced assignment).
2. `grep -n 'NO_ASSIGNMENT' backend/src/services/boardArchiveService.ts` → zero matches.
3. `grep -n 'project.name' backend/src/services/boardArchiveService.ts` → present (logic intact).
4. `cd backend && npx tsc --noEmit` → zero errors.
5. `grep -n 'project.name' .vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md` → new declared deviation present.
6. `grep -c 'resolved-by-amendment' .vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md` → ≥ 2.
7. The other 21 must-haves (schedule isolation MH-05/08/16/21/22, sanitization MH-13, etc.) are untouched — no files outside the three in files_modified were edited.
</verification>
<success_criteria>
- MH-02 is re-verifiable deterministically: boardArchiveService.ts JSDoc no longer mentions an assignment join or NO_ASSIGNMENT; documented error codes match ArchiveErrorCode exactly; runtime validation against card.project.name is unchanged.
- 23-05-PLAN.md and 23-05-SUMMARY.md formally declare the project-model validation deviation (replacing the assignment-model spec) with rationale and a resolved-by-amendment marker.
- TypeScript compiles cleanly; no runtime logic change; no schedule-domain writes introduced.
- Scope held to MH-02 only — the 21 passing must-haves are not modified.
</success_criteria>
<known_issue_workflow>
- No carried known issues this round (input_mode: verification, known_issues_count=0). Both `known_issues_input` and `known_issue_resolutions` are empty arrays in frontmatter.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
</invoke>
