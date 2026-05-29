---
phase: 22
round: 2
title: "Bookkeeping reconciliation of shipped Kanban card deviations"
type: remediation
status: complete
completed: 2026-05-29
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - __COMMIT__
files_modified:
  - .vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md
  - .vbw-planning/phases/22-project-board-kanban-ui/22-02-SUMMARY.md
deviations: []
known_issue_outcomes: []
---

Reconciled plan 22-02 bookkeeping for already-shipped, correct Kanban code: documented deviations #2 (Project entity) and #4 (findCardById DragOverlay) as plan-truth via R02-QA amendments, emptied the SUMMARY `deviations:` array while preserving the full audit record in a prose `## Reconciliation Note`, and flipped the weekStart-sort `ac_results` verdict to pass. No product source changed.

## Task 1: Amend 22-02-PLAN.md for deviation #2 (Project-entity card content)

### What Was Built
- Added a `> **Amendment (R02-QA):**` block under the Task 1 card-content truth (after the existing R01 client-name amendment) documenting that project name/status and client name now come from the Phase-24 `Project` entity (`card.project`, `card.project.status`, `card.project.client?.name`) read in `KanbanCard.tsx`; one card = one Project with a per-pentester assignment list, superseding the per-assignment `projectName` model.
- Mirrored the existing R01-QA amendment prose style; left both existing R01 and R01-QA amendment blocks untouched.

### Files Modified
- `.vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md` -- edit: added R02-QA amendment for the Project-entity card-content evolution.

### Deviations
None

## Task 2: Amend 22-02-PLAN.md for deviation #4 (DragOverlay via findCardById)

### What Was Built
- Added a second `> **Amendment (R02-QA):**` block under Task 4 (before the Commit line) documenting that the DragOverlay variant is realized via the `isDragOverlay` prop on `KanbanCard` plus the exported `findCardById(cards, id)` helper, with `Board.tsx` rendering `<KanbanCard isDragOverlay />` inside `<DragOverlay>` — no separate overlay component.
- Task 4's Commit line and code block remain intact.

### Files Modified
- `.vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md` -- edit: added R02-QA amendment for the findCardById DragOverlay realization.

### Deviations
None

## Task 3: Reconcile 22-02-SUMMARY.md bookkeeping

### What Was Built
- Set `deviations:` frontmatter to `deviations: []` (all four former entries reconciled).
- Added a prose `## Reconciliation Note` section preserving all four former deviation entries verbatim, each annotated with its disposition: #1 process note, #2 R02-QA, #3 R01-QA, #4 R02-QA.
- Flipped the weekStart-sort `ac_results` entry from `verdict: partial` to `verdict: pass`, with evidence citing `groupCardsByStage` in `frontend/src/features/board/types.ts` (consumed via `Board.tsx`) and the R01-QA plan amendment.
- Left `pre_existing_issues` (the DEVN-05 KanbanCard ESLint entry) unchanged; no other `ac_results` verdicts or frontmatter altered.

### Files Modified
- `.vbw-planning/phases/22-project-board-kanban-ui/22-02-SUMMARY.md` -- edit: emptied deviations array, added Reconciliation Note, flipped weekStart-sort verdict to pass.

### Deviations
None

## Task 4: Verify product-source isolation and commit

### What Was Built
- Confirmed `git status`/`git diff` for product source (`frontend/`, `backend/`) shows zero modifications — the only untracked product-tree path is a pre-existing `backend/dev.db.fresh-*.bak`, not introduced by this round.
- Staged only the `.vbw-planning/` markdown artifacts (force-added, since `.vbw-planning/` is gitignored) and made a single reconciliation commit.

### Files Modified
- `.vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md` -- committed.
- `.vbw-planning/phases/22-project-board-kanban-ui/22-02-SUMMARY.md` -- committed.

### Deviations
None
