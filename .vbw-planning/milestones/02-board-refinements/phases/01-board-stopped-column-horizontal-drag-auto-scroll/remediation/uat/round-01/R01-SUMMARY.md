---
phase: 1
round: 1
title: "UAT remediation — fix two-finger vertical scroll on Board (P01-T05)"
type: remediation
status: complete
completed: 2026-06-03
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - 55eaf9a
  - ec4d38a
files_modified:
  - frontend/src/routes/Board.tsx
  - frontend/src/features/board/components/KanbanColumn.tsx
deviations: none
known_issue_outcomes: []
---

Fixed UAT failure P01-T05 by adding `overflow-y-hidden` to the board column scroll container and removing the latent `overflow-y-auto` trap from the KanbanColumn card-list body, so two-finger vertical gestures bubble to the page scroller while horizontal scroll and drag auto-scroll (T04) stay intact.

## Task 1: Fix A: stop the board scroll container from trapping vertical wheel events

### What Was Built
- Added `overflow-y-hidden` to the board columns scroll container at `Board.tsx:270`, making the className `-mx-6 px-6 overflow-x-auto overflow-y-hidden`; this overrides the CSS-spec coercion of `overflow-y` to `auto`, so the div no longer captures two-finger vertical wheel gestures and they bubble to `<main class="flex-1 overflow-y-auto">` (AppShell) which owns page scroll.
- Preserved `overflow-x-auto` (non-drag horizontal scroll) and left the `DndContext` `autoScroll={{ threshold: { x: 0.2, y: 0 } }}` prop unchanged (T04 horizontal drag auto-scroll).

### Files Modified
- `frontend/src/routes/Board.tsx` -- edit: add `overflow-y-hidden` to the columns scroll container className.

### Deviations
None

## Task 2: Fix B: remove the latent vertical-scroll trap from KanbanColumn card list

### What Was Built
- Removed `overflow-y-auto` from the droppable body div at `KanbanColumn.tsx:34`; the className is now `flex-1 space-y-2 p-2 rounded-lg bg-muted/30 transition-all`, reverting `overflow-y` to the default `visible` and eliminating the second latent vertical-scroll trap.
- Left `ref={setNodeRef}` and the `isOver ? 'ring-2 ring-primary/50'` interpolation untouched; no user-visible behavior change today (columns have no height cap, so the scrollbar was never active).
- Confirmed frontend build is green: `tsc -b && vite build` exited 0 (only the pre-existing >500kB chunk-size advisory remains).

### Files Modified
- `frontend/src/features/board/components/KanbanColumn.tsx` -- edit: remove `overflow-y-auto` from the droppable card-list body className.

### Deviations
None
