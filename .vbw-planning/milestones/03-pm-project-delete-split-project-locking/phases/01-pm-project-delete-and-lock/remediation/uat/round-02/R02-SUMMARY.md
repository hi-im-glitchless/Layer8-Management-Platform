---
phase: 1
round: 2
title: "Planner card delete cascades project + all linked assignments to schedule"
type: remediation
status: complete
completed: 2026-06-23
tasks_completed: 5
tasks_total: 5
commit_hashes:
  - a60e6ff
  - 222ecca
  - 89a2d1d
  - 687a82c
  - 8545493
files_modified:
  - backend/src/routes/board.ts
  - backend/src/services/__tests__/boardCardDelete.pm.test.ts
  - frontend/src/features/board/hooks.ts
  - frontend/src/features/board/components/DeleteCardDialog.tsx
  - frontend/src/features/board/components/CardDetailModal.tsx
deviations: []
known_issue_outcomes: []
---

Make the board-card delete path cascade to the schedule by deleting all linked assignments, with an all-or-nothing 409 lock policy and dual cache invalidation.

## Task 1: Cascade assignment deletes from the board card-delete route (all-or-nothing on lock)

### What Was Built
- DELETE /cards/:id now collects the distinct linked assignment ids from `existing.assignments` (de-duped via Set) and deletes each via `assignmentService.deleteAssignment`, reusing the lock-check + orphan-guard so the orphaned Project and its BoardCard cascade away.
- All-or-nothing lock pre-check: fetches `isLocked` via `prisma.assignment.findMany` (the shaped objects only expose `assignmentId`, not `isLocked`) and returns 409 deleting nothing if any linked assignment is locked; the catch block also maps any `'locked'` error to 409 before the generic 500.
- Zero-assignment fallback: re-fetches the card after the loop and calls `boardService.deleteCard(id)` when it still exists.
- Emits both `emitBoardInvalidate('cards')` and `emitScheduleInvalidate('assignments')` on success; route doc-comment rewritten to describe the cascade + 409 lock behavior.

### Files Modified
- `backend/src/routes/board.ts` -- modify: cascade card delete through linked assignments, add 409 lock policy, emit schedule invalidate, update doc-comment

### Known Issue Outcomes
None

### Deviations
None

## Task 2: Update the existing board-card delete service test to the new cascade behavior

### What Was Built
- Rewrote the suite to drive the delete the way the route now does: it calls `assignmentService.deleteAssignment` on the project's only linked assignment id instead of the obsolete bare `boardService.deleteCard`.
- Asserts the new CASCADE invariant: after the delete the linked Assignment, the Project, the BoardCard, and its BoardComment/BoardFile/BoardNotification children are all gone (orphan-guard deletes the Project, which cascades the card subtree).
- Keeps the `board.card.delete` AuditLog assertion (cardId + acting userId) and the unchanged withDbRetry helper, uniqueSuffix, scoped-id teardown, and dev-DB integration usage (no mocks introduced).
- Rewrote the file header comment to describe the new cascade invariants, removing the obsolete PROJECT/ASSIGNMENT SURVIVAL language; describe/it titles updated to match.

### Files Modified
- `backend/src/services/__tests__/boardCardDelete.pm.test.ts` -- modify: rewrite suite + header for cascade behavior, drop survival assertions

### Known Issue Outcomes
None

### Deviations
None

## Task 3: Invalidate the schedule query cache on the frontend after a card delete

### What Was Built
- `useDeleteCard` now invalidates `['schedule', 'assignments']` in its `onSuccess` alongside the existing `['board', 'cards']` invalidation, so the schedule grid refetches after a card delete cascades away its linked assignments.
- Query-key shape mirrors `useDeleteAssignment` (schedule/hooks.ts:154) exactly; the per-call `onSuccess` in DeleteCardDialog (dialog close) was left untouched.
- Verified clean: `grep` confirms the new invalidation inside useDeleteCard and `npx tsc --noEmit` passes with exit 0.

### Files Modified
- `frontend/src/features/board/hooks.ts` -- modify: add schedule-assignments cache invalidation to useDeleteCard onSuccess

### Known Issue Outcomes
None

### Deviations
None

## Task 4: Correct the DeleteCardDialog copy to warn that assignments will be removed

### What Was Built
- Rewrote the AlertDialogDescription so it warns that deleting the card removes the card, the project, AND all linked schedule assignments (for all pentesters) plus attached comments/notes/files, and that it cannot be undone — replacing the now-inverted "The linked schedule assignments are not affected" line.
- Added an optional `assignmentCount?: number` prop to `DeleteCardDialogProps`; when provided the copy states the exact count ("its {n} schedule assignment(s) (for all pentesters)") with correct singular/plural, and falls back to a count-free "all its linked schedule assignments" phrasing when omitted.
- Wired the count from the parent: `CardDetailModal` passes `assignmentCount={assignments.length}` (the already-loaded `card.assignments`).
- Updated the component doc-comment to describe the cascade behavior; kept the AlertDialog pattern, projectName-in-title, and disabled/isPending behavior unchanged; no native confirm() introduced.
- Verified: `grep "not affected"` returns nothing, the new `schedule assignment`/`assignmentCount` copy is present, and `npx tsc --noEmit` exits 0.

### Files Modified
- `frontend/src/features/board/components/DeleteCardDialog.tsx` -- modify: rewrite warning copy to state the assignment cascade, add optional assignmentCount prop, update doc-comment
- `frontend/src/features/board/components/CardDetailModal.tsx` -- modify: pass assignmentCount={assignments.length} to DeleteCardDialog

### Known Issue Outcomes
None

### Deviations
None

## Task 5: Add route-level regression tests for cascade, scoped-assignment-delete, and lock policy

### What Was Built
- Multi-assignment cascade test: seeds one Project + BoardCard referenced by TWO pentesters (pentester A via `projectId`, pentester B via `splitProjectId` in a different week). Drives the route mechanism by collecting both linked assignment ids and calling `deleteAssignment` per id; asserts ALL linked assignments, the Project, and the BoardCard are gone (orphan-guard fires on the last referencing row).
- Scoped single-assignment delete test (R01 multi-pentester safety): two pentesters share the same Project; deleting ONLY pentester A's assignment leaves pentester B's (different) assignment, the Project, and the BoardCard intact — proving the orphan-guard does not fire while a referencing assignment remains.
- Locked linked assignment test (all-or-nothing 409 pre-check): a linked assignment with `isLocked: true` makes `deleteAssignment` reject with a `/locked/i` error and leaves the Assignment, Project, and BoardCard all intact, mirroring the route's pre-write 409 rejection.
- Reuses the existing `withDbRetry`, `uniqueSuffix`, scoped-id `teardown`, and seed helpers; integration against the dev DB, no mocks, parallel-safe scoped ids. Suite green (4 tests: existing rewritten + three new).

### Files Modified
- `backend/src/services/__tests__/boardCardDelete.pm.test.ts` -- modify: add three regression test cases (multi-assignment cascade, scoped single-delete, locked-assignment block)

### Known Issue Outcomes
None

### Deviations
None
