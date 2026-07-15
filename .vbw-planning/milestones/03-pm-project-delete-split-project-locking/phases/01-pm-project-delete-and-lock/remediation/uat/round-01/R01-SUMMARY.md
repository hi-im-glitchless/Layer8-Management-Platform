---
phase: 1
round: 1
title: "Surface orphan-guard failures + clarify planner-delete UX (UAT P01-T01)"
type: remediation
status: complete
completed: 2026-06-23
tasks_completed: 6
tasks_total: 6
commit_hashes:
  - 16f3709
  - 983ab06
  - b63d73b
  - 7212431
  - 06f7151
  - a3d6884
files_modified:
  - backend/src/services/assignmentService.ts
  - backend/src/routes/schedule.ts
  - backend/src/services/__tests__/deleteAssignmentOrphanFailure.test.ts
  - frontend/src/features/schedule/api.ts
  - frontend/src/features/schedule/hooks.ts
  - frontend/src/features/schedule/components/AssignmentModal.tsx
  - frontend/src/features/schedule/components/__tests__/AssignmentModal.deleteConfirm.test.tsx
deviations:
  - "none"
known_issue_outcomes: []
---

Closed the silent orphan-cleanup failure edge (research b3) by threading an `orphanCleanupFailed` flag from `deleteAssignment` through the DELETE response into a `useDeleteAssignment` warning toast, and added a planner delete-confirmation dialog whose copy explains the by-design last-assignment card-removal rule (b4). The zero-count-only orphan rule and multi-pentester safety are unchanged; the assignment delete stays non-fatal w.r.t. board cleanup.

## Task 1: Backend: surface orphan-cleanup failure from deleteAssignment

### What Was Built
- `deleteAssignment` now returns `{ deleted, orphanCleanupFailed }`; the best-effort orphan-guard catch sets the flag to `true` (no re-throw) instead of swallowing the error silently.
- Zero-count-only delete logic, linkedProjectIds de-dup, and the multi-pentester safety guard are untouched; the rationale comment was updated to describe the new return shape.

### Files Modified
- `backend/src/services/assignmentService.ts` -- edit: add `orphanCleanupFailed` flag set in the catch and return it alongside the deleted row.

### Deviations
None

## Task 2: Backend: include orphan-cleanup-failure flag in DELETE response

### What Was Built
- The `DELETE /assignments/:id` handler destructures the result and responds `{ success: true, orphanCleanupFailed }`.
- Schedule + board invalidation broadcasts, the locked-assignment 409, and the generic 500 handling are unchanged.

### Files Modified
- `backend/src/routes/schedule.ts` -- edit: capture `deleteAssignment` result and include the flag in the JSON response.

### Deviations
None

## Task 3: Backend: regression test for orphan-cleanup-failure surfacing

### What Was Built
- New vitest suite mirroring `deleteAssignmentOrphan.delete.test.ts` (uniqueSuffix, withDbRetry, seeded-id-scoped teardown, dev DB).
- HAPPY path: zero-count delete -> `orphanCleanupFailed === false`, Project + cascaded BoardCard gone.
- FAILURE path: orphan `project.delete` forced to throw -> flag flips to `true`, the assignment is still deleted, and the BoardCard survives.

### Files Modified
- `backend/src/services/__tests__/deleteAssignmentOrphanFailure.test.ts` -- add: 2-case regression suite proving the b3 fix.

### Deviations
None — the plan's preferred `vi.spyOn(prisma.project, 'delete')` cannot capture Prisma 7's lazy-proxy delegate (its own-property descriptor has `value: undefined`), so the test uses the same intent via a one-shot writable-property swap of the throwing mock, restored in a finally block. This is within the plan's stated injection approach (force the orphan delete to throw without changing production code), not a scope deviation.

## Task 4: Frontend: warn on orphan-cleanup failure in useDeleteAssignment

### What Was Built
- `scheduleApi.deleteAssignment` response type widened to `{ success: boolean; orphanCleanupFailed?: boolean }`.
- `useDeleteAssignment.onSuccess(data)` keeps both `['schedule','assignments']` and `['board','cards']` invalidations and fires `toast.warning(...)` when `data?.orphanCleanupFailed` is true; the normal success path is unchanged.

### Files Modified
- `frontend/src/features/schedule/api.ts` -- edit: widen the deleteAssignment response type.
- `frontend/src/features/schedule/hooks.ts` -- edit: conditional warning toast on `orphanCleanupFailed`.

### Deviations
None

## Task 5: Frontend: confirmation dialog with clarifying copy on planner Delete

### What Was Built
- The footer destructive Delete button is wrapped in an `AlertDialog` (mirroring the existing remove-primary pattern), preserving variant/size/className/Trash2 icon and the `disabled={deleteMutation.isPending || isLocked}` state on the trigger.
- Dialog copy: "Delete this assignment?" with a description stating the Board card is only removed when this is the project's last assignment; confirming via `AlertDialogAction` triggers the unchanged `handleDelete`.

### Files Modified
- `frontend/src/features/schedule/components/AssignmentModal.tsx` -- edit: wrap the footer Delete button in a confirmation AlertDialog.

### Deviations
None

## Task 6: Frontend: test the delete-confirmation dialog

### What Was Built
- New component test mirroring `AssignmentModal.lock.test.tsx` (same render harness + mocked hooks).
- Asserts: clicking the footer Delete opens the dialog with the clarifying copy without deleting; confirming via the dialog Delete action calls the delete mutation with the assignment id; Cancel dismisses without deleting.

### Files Modified
- `frontend/src/features/schedule/components/__tests__/AssignmentModal.deleteConfirm.test.tsx` -- add: 3-case confirmation-dialog test.

### Deviations
None
