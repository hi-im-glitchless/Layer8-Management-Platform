---
phase: 22
round: 1
title: "Board->Planner Rename and BoardCard Auto-Population"
type: remediation
status: complete
completed: 2026-04-06
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - d1503ca
  - fe0853e
  - 0bd420b
  - cc33b12
files_modified:
  - frontend/src/routes/Board.tsx
  - frontend/src/components/layout/Sidebar.tsx
  - backend/src/services/boardService.ts
  - backend/src/routes/board.ts
  - backend/src/services/assignmentService.ts
  - frontend/src/features/board/types.ts
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

## Task 2: Add syncCardsFromAssignments function to boardService

### What Was Built
- Added `syncCardsFromAssignments()` — queries assignments without a BoardCard and creates one for each, returning `{ created }` count
- Added `createCardForAssignment(assignmentId)` — idempotent upsert to create a single BoardCard for a given assignment

### Files Modified
- `backend/src/services/boardService.ts` -- added two exported functions: `syncCardsFromAssignments` and `createCardForAssignment`

### Deviations
None

## Task 3: Add POST /cards/sync endpoint and hook auto-creation into upsertAssignment

### What Was Built
- Added `POST /cards/sync` endpoint requiring PM role; calls `syncCardsFromAssignments()` and returns `{ created: N }`, emitting WebSocket invalidation when cards are created
- Hooked `createCardForAssignment` into `upsertAssignment` so every assignment create/update auto-creates a BoardCard (idempotent, non-fatal on failure)

### Files Modified
- `backend/src/routes/board.ts` -- added `POST /cards/sync` route with PM auth, rate limiter, and WS notification
- `backend/src/services/assignmentService.ts` -- added boardService import and auto-creation call after transaction in `upsertAssignment`

### Deviations
None

## Task 4: Add clientId to BoardCard assignment type

### What Was Built
- Added `clientId: string | null` to the `assignment` sub-type in `BoardCard` interface, aligning the frontend type with the backend Prisma include

### Files Modified
- `frontend/src/features/board/types.ts` -- added `clientId: string | null` to assignment sub-type after `weekStart`

### Deviations
None