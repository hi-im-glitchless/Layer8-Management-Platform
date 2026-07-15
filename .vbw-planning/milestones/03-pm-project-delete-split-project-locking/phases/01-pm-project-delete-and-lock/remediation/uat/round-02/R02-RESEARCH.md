---
phase: 1
round: 2
title: "R02 – Planner delete does not propagate to Schedule"
type: remediation-research
confidence: high
date: 2026-06-23
---

## Findings

### 1. What "schedule" vs "planner" means in this codebase

Both surfaces show data from the same underlying `Assignment` table. They are
two views of a single data model, not two separate stores.

- **Schedule surface** — `/schedule` page. Renders a grid of
  `Assignment` rows via `useAssignments` (query key `['schedule',
  'assignments', year, quarter]`). The user opens `AssignmentModal` on a cell
  to edit or delete an assignment. The delete action calls `useDeleteAssignment`
  → `DELETE /api/schedule/assignments/:id`.

- **Planner / Board surface** — `/board` page. Renders `BoardCard` rows
  (`KanbanCard` / `CardDetailModal`). Each `BoardCard` has a 1-to-1 relation
  with a `Project` row. Each `Project` is linked back to one or more
  `Assignment` rows via `Assignment.projectId` (FK onDelete: SetNull). The
  user opens `CardDetailModal` and clicks "Delete card" to call
  `useDeleteCard` → `DELETE /api/board/cards/:id`.

Schema cascade chain (from `schema.prisma`):

```
Assignment.projectId → Project (onDelete: SetNull)   ← Assignment is NOT deleted
BoardCard.projectId  → Project (onDelete: Cascade)   ← deleting Project kills card
Project  is deleted explicitly only by assignmentService orphan-guard
```

Deleting a `BoardCard` from the Planner does NOT delete or touch any
`Assignment` row — the FK is one-way (SetNull on the Assignment side).

---

### 2. The WORKING direction: schedule delete → planner update

**Mutation path:**

1. `AssignmentModal` `handleDelete` → `useDeleteAssignment` (`schedule/hooks.ts` line 155)
2. `scheduleApi.deleteAssignment(id)` → `DELETE /api/schedule/assignments/:id`
   (`schedule/api.ts`)
3. `assignmentService.deleteAssignment(id)` (`assignmentService.ts` lines
   345–414):
   - Deletes the `Assignment` row.
   - Runs the orphan-guard: if no other `Assignment` still references the
     linked `Project` (via `projectId` or `splitProjectId`), it deletes the
     `Project` row. The `BoardCard.projectId → Project` FK is
     `onDelete: Cascade`, so the `BoardCard` is deleted automatically by
     Prisma/SQLite when the `Project` is deleted.
4. Back in the route handler (`schedule.ts` lines 333–351):
   - `emitScheduleInvalidate('assignments')` — tells other schedule clients
     to refetch.
   - `emitBoardInvalidate('cards')` — tells all board clients to refetch.
5. In `useDeleteAssignment.onSuccess` (`schedule/hooks.ts` lines 159–176):
   - `queryClient.invalidateQueries(['schedule', 'assignments'])` — local
     schedule cache refetched.
   - `queryClient.invalidateQueries(['board', 'cards'])` — local board cache
     refetched.

Result: the assignment is gone from both the schedule grid and the board
simultaneously. The board card disappears because the underlying Project was
deleted by the orphan-guard.

---

### 3. The BROKEN direction: planner delete → schedule does NOT update

**Mutation path:**

1. `CardDetailModal` "Delete card" button → `DeleteCardDialog`
   (`board/components/DeleteCardDialog.tsx` lines 39–47)
2. `useDeleteCard` → `boardApi.deleteCard(id)` → `DELETE /api/board/cards/:id`
   (`board/hooks.ts` line 62, `board/api.ts` line 32)
3. `boardService.deleteCard(id)` (`boardService.ts` line 284–285):
   ```typescript
   export async function deleteCard(id: string) {
     return prisma.boardCard.delete({ where: { id } });
   }
   ```
   This deletes the `BoardCard` row. Cascade deletes its comments, files,
   and notifications. It does NOT delete the `Project` row, and does NOT
   delete or update any `Assignment` row. The `Assignment.projectId` FK is
   `onDelete: SetNull`, so after the card delete the `Project` is still alive
   and every linked `Assignment.projectId` becomes NULL (SetNull fires in
   Prisma, but the `Assignment` row itself persists).

4. Back in the board route (`board.ts` line 251):
   ```typescript
   res.json({ success: true });
   emitBoardInvalidate('cards');
   ```
   Only `emitBoardInvalidate('cards')` is emitted. There is **no**
   `emitScheduleInvalidate('assignments')` call.

5. In `useDeleteCard.onSuccess` (`board/hooks.ts` lines 62–71):
   ```typescript
   onSuccess: () => {
     queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
   },
   ```
   Only `['board', 'cards']` is invalidated. There is **no**
   `queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })`.

**Structural consequence:** the `Assignment` row is never deleted. After the
planner-side card delete:
- `Assignment.projectId` becomes NULL (SetNull cascade from Project, if the
  Project is deleted — but the Project is NOT deleted by `deleteCard`, see
  note below).
- Actually: `boardService.deleteCard` deletes only the `BoardCard`, not the
  `Project`. The `Project` survives with its `primaryAssignments` /
  `splitAssignments` still intact. The schedule cell keeps showing the
  assignment exactly as before.

**The board card's comment in `DeleteCardDialog.tsx` (lines 57–59) is even
explicit about this being intentional by design:**
> "The linked schedule assignments are not affected."

So the current design treats the planner delete as a "remove this card from
the board" action, not a "delete this work from the schedule" action. The UAT
tester expects the reverse: that deleting from the planner should also remove
the schedule entry.

---

## Prior Fix Analysis

Round 01 added:
- A confirmation `AlertDialog` wrapping the Delete button in `AssignmentModal`
  (schedule → planner propagation, which already worked at the DB level).
- A `toast.warning` in `useDeleteAssignment.onSuccess` when
  `orphanCleanupFailed` is true.

Round 01 did not touch the board-side delete path at all. The board card
delete was already present and was not part of R01 scope.

---

## Root Cause Assessment

**Root cause: The planner-side delete (`DELETE /api/board/cards/:id`) is
scoped to removing only the `BoardCard` (and its planner-only artefacts:
comments, files, notifications). It deliberately does not delete the
underlying `Assignment` rows, and it does not broadcast a schedule
invalidation.**

This is a design gap, not a code bug. The board route was authored with the
assumption that deleting a card means "remove the planner view of this
project" without affecting the schedule. The UAT requirement is the opposite:
deleting from the planner should be equivalent to deleting from the schedule
— i.e., it should delete the `Assignment` row(s), which then naturally causes
the orphan-guard to remove the `Project` and `BoardCard` as a side effect.

Three sub-gaps contribute:

| # | Layer | Gap |
|---|-------|-----|
| 1 | Backend service | `boardService.deleteCard` only deletes the `BoardCard` row. It does not call `assignmentService.deleteAssignment` for the linked assignments. The `Project` and all `Assignment` rows survive. |
| 2 | Backend route | `board.ts` `DELETE /cards/:id` emits only `emitBoardInvalidate('cards')`. It never emits `emitScheduleInvalidate('assignments')`. |
| 3 | Frontend hook | `useDeleteCard.onSuccess` invalidates only `['board', 'cards']`. It does not invalidate `['schedule', 'assignments']`. |

Gap 1 is the structural root cause. Gaps 2 and 3 are consequences (even if
the assignment rows were deleted, the schedule UI would not refresh without
the broadcast / cache invalidation).

---

## Recommendations

### Recommended fix shape

The fix should make the planner card delete behave like the schedule
assignment delete — specifically, it should delete all `Assignment` rows that
reference the card's `Project`, which then triggers the existing orphan-guard
that cascades the `Project` and `BoardCard` deletion.

**Option A (recommended — backend-first, reuses existing service logic):**

1. **`backend/src/routes/board.ts` `DELETE /cards/:id`** — after fetching
   `existing` (already done for the audit log), retrieve the linked
   `Assignment` ids via `existing.project.primaryAssignments` /
   `splitAssignments`. For each assignment id call
   `assignmentService.deleteAssignment(id)` (which already handles the
   orphan-guard and lock check). After all deletes complete, emit both
   `emitBoardInvalidate('cards')` AND `emitScheduleInvalidate('assignments')`.

   Note: the `boardService.getCard` already includes
   `project.primaryAssignments` / `splitAssignments` in its Prisma include
   block (`boardService.ts` lines 134–170), so the assignment ids are
   available without an extra query.

   The `boardService.deleteCard` call becomes unnecessary if all assignments
   are deleted via `assignmentService.deleteAssignment` (because the
   orphan-guard deletes the Project + cascades the BoardCard). It can be
   removed from the route, or kept as a safety net fallback after the
   assignment loop.

2. **`frontend/src/features/board/hooks.ts` `useDeleteCard.onSuccess`** —
   add `queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments']
   })` alongside the existing `['board', 'cards']` invalidation (mirrors the
   pattern already used in `useDeleteAssignment`).

3. **`frontend/src/features/board/components/DeleteCardDialog.tsx` dialog
   description** — update the copy (currently "The linked schedule
   assignments are not affected") to reflect the new behaviour ("This also
   removes the linked schedule entries").

**Option B (frontend-only workaround, not recommended):** Change
`DeleteCardDialog` to call the schedule delete API instead of the board
delete API. This reuses the existing working path but is architecturally
wrong — the board component should not call schedule endpoints.

**Option C (separate board+schedule deletes, not recommended):** Keep the
board delete as-is but add a second API call from the frontend to delete each
linked assignment. This is fragile (race conditions, partial failure) and
duplicates logic.

Option A is cleanest. The existing `assignmentService.deleteAssignment`
already:
- Enforces the lock check (locked assignments cannot be deleted).
- Runs the orphan-guard (deletes the Project + cascades the BoardCard).
- Is already the single delete path used by the schedule surface.

### Files a fix would touch

| File | Change |
|------|--------|
| `backend/src/routes/board.ts` | In `DELETE /cards/:id`: iterate linked assignment ids, call `assignmentService.deleteAssignment(id)` for each; add `emitScheduleInvalidate('assignments')`. |
| `frontend/src/features/board/hooks.ts` | `useDeleteCard.onSuccess`: add `queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })`. |
| `frontend/src/features/board/components/DeleteCardDialog.tsx` | Update dialog description copy to match new behaviour. |

The `boardService.deleteCard` function itself may remain unchanged (it can
serve as a guard / fallback), or be removed from the route if the
assignment-delete cascade makes it redundant — confirm with schema cascade
before removing.

### Edge case to handle

If an assignment is **locked** (`isLocked: true`), `assignmentService.deleteAssignment`
throws. The board-side delete route should check for this and either:
- Reject the delete with a 409 if any linked assignment is locked (consistent
  with how the schedule surface handles it), or
- Skip locked assignments and only delete unlocked ones (partial delete — not
  recommended as it leaves a dangling schedule entry).

The former is cleaner and consistent with the existing lock semantics.

## Live Validation Evidence

- command_shape: static code inspection only (no runtime checks)
- exit_status: N/A
- redacted_evidence: All evidence is from source file reads above
- expected_shape: N/A (read-only research)
- confidence: high — the complete call stack from UI click to DB write was
  traced across 8 files with no ambiguity
- limitations_or_deferred_reason: The actual SQLite cascade behaviour for
  `onDelete: SetNull` on `Assignment.projectId` when `boardCard.delete` runs
  was not live-tested. Schema at line 219 shows `onDelete: SetNull`, but
  since `boardService.deleteCard` deletes only the `BoardCard` (not the
  `Project`), the SetNull cascade never fires in this path — the `Project`
  and its `Assignment` rows remain completely intact. This was confirmed by
  reading both `boardService.ts:284` and `board.ts:241`.
