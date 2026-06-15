---
phase: 10
round: 1
title: Increase planner card client-name font size to text-sm
type: remediation
status: complete
completed: 2026-06-15
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 10dfe0b
files_modified:
  - frontend/src/features/board/components/KanbanCard.tsx
deviations: []
known_issue_outcomes:
  - '{"test":"react-refresh on findCardById","file":"frontend/src/features/board/components/KanbanCard.tsx","error":"react-refresh/only-export-components","disposition":"accepted-process-exception","rationale":"Pre-accepted DEVN-05 from Phase 10; out of scope for this UAT quick-fix and left untouched."}'
---

Bumped the planner card Row-2 client-name line from text-xs to text-sm, keeping bold weight, inline client colour, and the legibility guard intact.

## Task 1: Increase client-name font size to text-sm

### What Was Built
- Changed the Row-2 client-name `<p>` className from `text-xs font-bold leading-tight` to `text-sm font-bold leading-tight`.
- No change to the project-name line, avatars, colour/bold logic, `resolveClientNameColor`, or the legibility guard.

### Files Modified
- `frontend/src/features/board/components/KanbanCard.tsx` -- edit: client-name line text-xs → text-sm.

### Known Issue Outcomes
- `react-refresh on findCardById` (`frontend/src/features/board/components/KanbanCard.tsx`) — `accepted-process-exception`: Pre-accepted DEVN-05 from Phase 10; not touched.

### Deviations
None

### Notes
- KanbanCard vitest suite green (15/15 tests passed); the existing client-name styling tests assert only `font-bold` and inline colour (not the size class), so no test change was required.
- `tsc -b` exited 0; LSP diagnostics tool unavailable in this context, type-check covered by tsc.
- `git diff backend/` is empty — frontend-only change as scoped.
