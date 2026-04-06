---
phase: 22
round: 1
title: "Board->Planner Rename and BoardCard Auto-Population"
type: remediation
status: in-progress
completed:
tasks_completed: 1
tasks_total: 4
commit_hashes:
  - pending
files_modified:
  - frontend/src/routes/Board.tsx
  - frontend/src/components/layout/Sidebar.tsx
deviations: []
---

Rename user-facing "Board" labels to "Planner" across the frontend UI.

## Task 1: Rename user-facing "Board" labels to "Planner"

### What Was Built
- Renamed all user-visible "Board" strings to "Planner" in the kanban page and sidebar navigation
- URL paths (`/board`) left unchanged per requirements

### Files Modified
- `frontend/src/routes/Board.tsx` -- updated: error heading, error message, main heading, and empty state text from "Board"/"board" to "Planner"/"planner"
- `frontend/src/components/layout/Sidebar.tsx` -- updated: navigation label from 'Board' to 'Planner'

### Deviations
None
