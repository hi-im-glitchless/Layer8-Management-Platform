---
phase: "09"
title: "Planner orphan on schedule delete"
type: research
confidence: high
date: 2026-06-12
---

## Summary

When a PM deletes an Assignment in the Schedule view, the backend deletes only the `Assignment` row and emits `schedule:invalidate` for `assignments`. It never touches the linked `Project` row, never touches the linked `BoardCard` row, and never emits `board:invalidate`. The frontend `useDeleteAssignment` hook similarly only invalidates `['schedule', 'assignments']` — it does not invalidate `['board', 'cards']`. As a result, if this was the **last** (or only) Assignment pointing at a given Project, the Project and its BoardCard survive in the database, but the card's `assignments` list becomes empty. The Planner board re-fetches only when the user navigates away or manually refreshes; until then the stale cached card remains. Even after a fresh fetch the card is still returned by `boardService.listCards` with an empty `assignments` array, so it "hangs" in whichever column it last occupied — no pentesters, not removed from view, not automatically moved to `stopped`. The multi-pentester safety boundary is purely a count question: the `Project` row still has its `primaryAssignments` and `splitAssignments` relations; only when **all** of those reach zero should any action be taken, and even then the correct action is to move the card to `stopped` — not delete it — to preserve notes, checklist, comments, and files.

---

## Root cause (exact)

### 1. `deleteAssignment` — no orphan check, no board event

`backend/src/services/assignmentService.ts:345-353`

```ts
export async function deleteAssignment(id: string) {
  const existing = await prisma.assignment.findUniqueOrThrow({ where: { id } });
  if (existing.isLocked) {
    throw new Error('Cannot delete a locked assignment. Unlock it first.');
  }
  return prisma.assignment.delete({ where: { id } });
}
```

After the `prisma.assignment.delete`, there is no call to count remaining assignments for the project, no call to `prisma.project.delete`, no call to `prisma.boardCard.update`, no call to `linkProjectsForAssignment`, and no orphan-removal step of any kind.

### 2. `DELETE /assignments/:id` route — no board socket emit

`backend/src/routes/schedule.ts:333-346`

```ts
router.delete('/assignments/:id', requireRole('PM'), mutationRateLimiter, async (req, res) => {
  try {
    const id = req.params.id as string;
    await assignmentService.deleteAssignment(id);
    res.json({ success: true });
    emitScheduleInvalidate('assignments');   // ← only schedule event
  } catch ...
});
```

`emitBoardInvalidate('cards')` is never called. The socket service exports the function (`socketService.ts:17`) but the schedule route never imports or calls it.

### 3. `useDeleteAssignment` — no board cache invalidation

`frontend/src/features/schedule/hooks.ts:154-164`

```ts
export function useDeleteAssignment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => scheduleApi.deleteAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
      // ← no invalidateQueries({ queryKey: ['board', 'cards'] })
    },
    ...
  })
}
```

Compare with `useUpsertAssignment` (line 122) and `useUpdateAssignment` (line 137) which both contain `queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })`. The delete hook is missing this line.

### 4. Schema: `onDelete: SetNull` on Assignment → Project FK

`backend/prisma/schema.prisma:219`

```prisma
project      Project?   @relation("AssignmentProject", fields: [projectId], references: [id], onDelete: SetNull)
splitProject Project?   @relation("AssignmentSplitProject", fields: [splitProjectId], references: [id], onDelete: SetNull)
```

Deleting an Assignment does **not** cascade to the Project. The Project row and its BoardCard survive regardless of how many assignments remain.

### 5. `boardService.listCards` — returns cards with zero assignments

`backend/src/services/boardService.ts:91-131`

`listCards` does a `prisma.boardCard.findMany` and maps every card regardless of whether `project.primaryAssignments` and `project.splitAssignments` are empty. A card with no assignments is returned and rendered by the Planner. There is no filter, no stage guard, and no suppression for zero-assignment cards.

### 6. Board cache is not invalidated by the `schedule:invalidate` socket event

`frontend/src/features/schedule/useScheduleSync.ts:18-20` only invalidates `['schedule', resource]` queries. `frontend/src/features/board/useBoardSync.ts:21-26` only listens for `board:invalidate` events. There is no cross-domain listener that triggers a board refetch when a schedule assignment is deleted.

---

## Board card ↔ Assignment data model

```
TeamMember 1──* Assignment *──1? Project 1──1 BoardCard
```

- `TeamMember` is the row in the schedule grid (one per pentester or backlog slot).
- `Assignment` is one cell: `(teamMemberId, weekStart)` unique, with optional primary and split project halves. Each half has a nullable `projectId`/`splitProjectId` FK to `Project`.
- `Project` is the canonical unit of work. Its identity key is `(name, clientId, sortedTags)`. Many Assignments across many pentesters and weeks may point to the same Project row.
- `BoardCard` is 1:1 with `Project` (unique `projectId` FK, `onDelete: Cascade`). Every Planner-eligible Project has exactly one card. Deleting the Project cascades to delete the card (and all its comments/files/notifications).
- `boardService.listCards` assembles the card response by joining `BoardCard → Project → primaryAssignments + splitAssignments → TeamMember`. The `assignments` array in the API response is built at query time from live DB rows.
- `upsertByKey` (`projectService.ts:52`) creates the Project + BoardCard pair on first eligible assignment. Subsequent assignments to the same project just increment the count. Nothing in `upsertByKey` or `deleteAssignment` ever decrements or checks the count.

---

## Recommended fix

### The correct fix is a two-part change, split across the schedule-delete handler (backend) and the frontend mutation hook

**Part A — `useDeleteAssignment` cache invalidation (frontend)**

`frontend/src/features/schedule/hooks.ts:154-164` — add `queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })` inside the `onSuccess` callback, identical to `useUpsertAssignment` and `useUpdateAssignment`. This is the minimum change needed for the Planner to reflect the deletion on the same client. The board cache is stale until a refetch; adding this one line eliminates the "hung on screen" symptom for the user who performed the delete.

This change is purely a cache invalidation — it does not touch any Assignment, TeamMember, Absence, or Holiday table, and is firmly within schedule-isolation rules.

**Part B — last-assignment guard in `deleteAssignment` (backend service)**

`backend/src/services/assignmentService.ts:345-353` — after deleting the assignment, check whether the linked Project now has zero remaining assignments. If zero, move the card to `stopped` stage. This is the correct persistent behaviour.

Precisely:
1. Before deleting, read `existing.projectId` (and `existing.splitProjectId` if applicable).
2. Delete the assignment.
3. For each non-null projectId: count remaining `Assignment` rows where `projectId = X OR splitProjectId = X`. If count is 0, update `BoardCard.stage = 'stopped'` where `BoardCard.projectId = X`.
4. This must be a non-fatal, best-effort operation (wrapped in try/catch like `linkProjectsForAssignment`), so a board-side failure cannot roll back the schedule delete.

**Why `stopped` and not delete?** The `stopped` stage is the existing "project is on hold / no current schedule" signal, already visible in the Planner. Deleting the Project would also cascade-delete the BoardCard, comments, files, and checklist — data loss the user explicitly forbids. Moving to `stopped` makes the card visible-but-parked and lets a PM manually archive or delete it if truly no longer needed.

**Why the service, not the route?** The guard needs access to the pre-delete `projectId` value, which the route does not read. The service already reads the assignment row (`findUniqueOrThrow`), so the projectId is available there. The route stays thin per architectural convention.

**Does this respect schedule isolation?** Yes. The change writes only to `BoardCard.stage` (a board-domain column) and reads `Assignment.projectId` (a read-only FK). It does not write to `Assignment`, `TeamMember`, `Absence`, or `Holiday`.

**Part C — `DELETE /assignments/:id` route should emit `board:invalidate`**

`backend/src/routes/schedule.ts:338` — add `emitBoardInvalidate('cards')` after the service call so that other connected clients also refresh the Planner. Import `emitBoardInvalidate` from `socketService.js` (it is already exported there). This mirrors how the board routes broadcast after mutations.

---

## Files to change / not change

### Must change

| File | Change |
|---|---|
| `frontend/src/features/schedule/hooks.ts` | `useDeleteAssignment.onSuccess`: add `queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })` |
| `backend/src/services/assignmentService.ts` | `deleteAssignment`: after delete, check remaining assignment count for the linked project(s); if zero, update `BoardCard.stage = 'stopped'` (non-fatal try/catch) |
| `backend/src/routes/schedule.ts` | `DELETE /assignments/:id`: import `emitBoardInvalidate`; add `emitBoardInvalidate('cards')` after `emitScheduleInvalidate('assignments')` |

### Must NOT change

| File | Reason |
|---|---|
| `backend/prisma/schema.prisma` | The `onDelete: SetNull` on `Assignment → Project` is correct. Changing it to `Cascade` would delete the Project (and its card) whenever any assignment is deleted — exactly the multi-pentester data-loss scenario the user forbids. |
| `backend/src/services/projectService.ts` | No change needed. `upsertByKey` only creates, never deletes. |
| `Assignment`, `TeamMember`, `Absence`, `Holiday` tables | Schedule isolation rule — board fix must not mutate these. |
| `BoardCard` cascade delete path | Do not add logic to delete the BoardCard on zero-assignments. Move to `stopped`; the PM decides whether to archive. |

---

## Edge cases / open questions

1. **Multi-pentester safety boundary.** The count query must include both `primaryAssignments` (where `projectId = X`) and `splitAssignments` (where `splitProjectId = X`). Missing either set produces a false zero. The correct Prisma count: `prisma.assignment.count({ where: { OR: [{ projectId: id }, { splitProjectId: id }] } })`.

2. **Split-cell assignments.** A single Assignment row can carry both `projectId` (primary half) and `splitProjectId` (secondary half). When deleting such a row, both project IDs must be checked independently — one may reach zero while the other still has assignments via other rows.

3. **The `stopped` column is already in the Planner UI.** `BOARD_STAGES` in `frontend/src/features/board/types.ts:111` includes `'stopped'` as a visible non-archived stage. `autoMoveCards` in `boardService.ts:224` explicitly skips `stopped` cards (`stage: { notIn: ['archived', 'stopped'] }`), so an auto-moved `stopped` card will never be re-staged. The PM must manually drag it forward or archive it.

4. **Backlog assignments (no Project link).** Backlog rows and pre-R03 assignments have `projectId = null`. `deleteAssignment` must null-check before querying: if `existing.projectId === null`, skip the orphan check entirely.

5. **`autoMoveCards` and zero-assignment cards.** The `autoMoveCards` function (`boardService.ts:251-261`) already skips cards with zero assignments (`if (weeks.length === 0) continue`), so auto-move will not accidentally promote a `stopped` zero-assignment card. This is safe as-is.

6. **What "hung up" looks like visually (UAT spec needed).** Based on the code, a card with zero assignments: renders in `KanbanCard.tsx` with no avatar row (the `pentesters.length === 0` branch at line 181 hides the row 4 div), but the card still appears in its column with project name, client, status badge. It is not obviously broken unless the user looks for the missing avatars. UAT should confirm this is the visible symptom and that after the fix the card moves to `stopped` immediately on delete.

7. **Soft-delete vs hard-delete path.** The current `deleteAssignment` is a hard Prisma delete. There is no soft-delete pattern for Assignments. No change needed here — the fix stays in the hard-delete path.

8. **`DELETE /team-members/backlog/:id` path.** `routes/schedule.ts:139-156` bulk-deletes all assignments for a backlog member: `prisma.assignment.deleteMany({ where: { teamMemberId: id } })`. This bypasses `deleteAssignment` entirely and will not trigger the new last-assignment guard. If backlog rows carry Planner-eligible projects, those cards would also orphan. This is an out-of-scope second case worth noting; the MVP fix can address it in a follow-on task or document it as a known gap.

9. **`DELETE /schedule/purge`** (`routes/schedule.ts:626-654`) bulk-deletes all assignments without touching the board. Same concern as the backlog path; unlikely to be a daily workflow but would leave all cards orphaned. Not in scope for this phase.
