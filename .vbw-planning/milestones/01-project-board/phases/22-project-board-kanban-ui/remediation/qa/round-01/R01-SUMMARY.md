---
phase: 22
round: 1
title: "QA Remediation R01 — Document weekStart sort relocation (MH-T06)"
type: remediation
status: complete
completed: 2026-05-29
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 6aaba9478d59bb21a498d5bb82feb24861dd2784
files_modified:
  - .vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md
deviations:
  - "None — documentation-only plan-amendment; no product code touched."
known_issue_outcomes: []
---

Resolved QA FAIL MH-T06 as a plan-amendment by documenting in 22-02-PLAN.md that weekStart-ascending card sorting is performed in the board data layer (`groupCardsByStage`), not inside the presentational KanbanColumn.

## Task 1: Add Amendment (R01-QA) block under the MH-T06 sorting truth in 22-02-PLAN.md

### What Was Built
- Inserted an `> **Amendment (R01-QA):**` blockquote under Task 2 (Create KanbanColumn component), immediately after the "Cards: map `cards`" bullet, mirroring the existing client-name amendment style at line 54.
- The amendment documents that the MH-T06 truth is satisfied at the data layer: `groupCardsByStage` in `frontend/src/features/board/types.ts` sorts each stage group ascending by earliest `assignment.weekStart` via `localeCompare` (assignment-less cards last), and `frontend/src/routes/Board.tsx` passes the pre-sorted `cardsByStage[stage]` into `<KanbanColumn cards=...>`.
- Captured the rationale (ordering belongs with data assembly; column stays pure/memo-friendly; avoids a redundant in-component sort) and formalized 22-02-SUMMARY deviations[2].

### Files Modified
- `.vbw-planning/phases/22-project-board-kanban-ui/22-02-PLAN.md` -- edit: added the additive Amendment (R01-QA) blockquote under Task 2. No frontmatter, other tasks, or code files changed.

### Deviations
None — documentation-only plan-amendment; `git diff` of `frontend/` and `backend/` is empty.
