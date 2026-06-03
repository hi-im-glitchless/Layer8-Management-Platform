---
phase: 23
round: 1
title: "MH-02 archive-validation deviation: declare project-model amendment + correct stale JSDoc"
type: remediation
status: complete
completed: 2026-06-01
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - 1ca7799
  - 1d15988
files_modified:
  - backend/src/services/boardArchiveService.ts
  - .vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md
  - .vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md
deviations:
  - "None. No genuine deviations from the plan's deliverable intent; see the Implementation Notes section for two clarifying notes."
---

Resolved the single FAIL (MH-02): corrected the stale JSDoc in boardArchiveService.ts to describe the actual `card.project.name` validation (Phase 24-R03 BoardCard->Project model) and removed the phantom `NO_ASSIGNMENT` error code, then formally declared the project-model archive-validation deviation in 23-05-PLAN.md and 23-05-SUMMARY.md. No runtime logic changed; tsc clean.

## Task 1: Correct stale JSDoc + remove phantom NO_ASSIGNMENT in boardArchiveService.ts

### What Was Built
- Module-header SCHEDULE-ISOLATION invariant block now describes the read-only `BoardCard.project` join (`project: { select: { name: true } }`, fetching the Project `name`) instead of the stale `BoardCard.assignment` join wording; invariant intent (no schedule-domain writes) preserved and a Phase 24-R03 provenance note added.
- `archiveCard` JSDoc now states the linked Project is read-only and only its `name` is fetched for typed-confirmation, replacing the stale Assignment `projectName` wording.
- Removed the phantom `NO_ASSIGNMENT` line from the documented `ArchiveError` codes; documented codes are now exactly `NOT_FOUND` and `PROJECT_NAME_MISMATCH`, matching the `ArchiveErrorCode` type.
- Runtime logic byte-identical: `include: { project: { select: { name: true } } }`, `card.project.name !== confirmProjectName`, transaction, and return value untouched. `npx tsc --noEmit` -> zero errors.

### Files Modified
- `backend/src/services/boardArchiveService.ts` -- modify: JSDoc corrected to project-join model; phantom `NO_ASSIGNMENT` removed; no logic change.

### Deviations
- None. See the Implementation Notes section below (clarifying notes, not deliverable deviations).

## Task 2: Declare the project-model archive-validation deviation in 23-05 plan + summary

### What Was Built
- `23-05-SUMMARY.md`: appended one new `deviations[]` entry stating archive validation matches `confirmProjectName` against `card.project.name` (via the read-only `project: { select: { name: true } }` join), NOT `card.assignment.projectName`, because Phase 24-R03 restructured the model; runtime behavior is correct and was NOT reverted; tagged `(MH-02, R01-QA — resolved-by-amendment)`. Existing entries unchanged.
- `23-05-PLAN.md`: appended a `### Task 2 & Task 3 — Amendment (QA Round 01, resolved-by-amendment): project-model archive validation` block mirroring the existing Task 5 amendment style — records source FAIL `MH-02`, `resolved-by-amendment` status, the authoritative `card.project.name` validation, rationale (model restructure, code deliberately not reverted, companion R01 code-fix corrected JSDoc/phantom code), and cross-references to R01-PLAN.md, boardArchiveService.ts, and 23-VERIFICATION.md MH-02. Original Task 2/Task 3 text preserved verbatim.
- Verified: `project.name` present in SUMMARY; `MH-02` in both files; `resolved-by-amendment` count in PLAN = 4 (>= 2).

### Files Modified
- `.vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md` -- modify: append one project-model deviation entry (additive).
- `.vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md` -- modify: append resolved-by-amendment block for MH-02 (additive).

### Deviations
None.

## Implementation Notes

These are clarifications, not deviations from the plan's deliverable intent. The deliverable matches intent and QA verified all must-haves.

- **Schedule-isolation invariant token retained.** Plan Task 1 verify #1 (`grep -nE 'assignment' boardArchiveService.ts` -> ZERO) is superseded by Task 1 action #1, which explicitly requires keeping the `MUST NOT call prisma.assignment.*` forbidden-call declaration in the module-header invariant (the passing schedule-isolation must-haves MH-05/08/16/21/22 depend on it). The stale `BoardCard.assignment join` wording and the phantom `NO_ASSIGNMENT` code were both removed as required; the single remaining `assignment` token is the intended forbidden-call declaration.
- **Commit composition.** Commit 1ca7799 also carried three zero-diff (R100) path renames of the prior May-cycle R01 artifacts (round-01 -> .prior-may-cycle). Those moves are orchestrator scaffolding pre-staged in the index to preserve the closed May QA cycle history, not part of this round's code deliverable. `git add` staged only boardArchiveService.ts.
