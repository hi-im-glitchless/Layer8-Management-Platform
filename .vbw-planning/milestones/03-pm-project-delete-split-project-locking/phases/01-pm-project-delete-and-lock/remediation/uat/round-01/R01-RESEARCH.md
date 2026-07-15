---
phase: 1
round: 1
title: "Planner assignment delete does not remove Board card (UAT R01)"
type: remediation-research
confidence: high
date: 2026-06-23
---

## Issue

User report: "deleted the card from the planner and it stayed in board."

The user deleted a planner assignment (via the `AssignmentModal` footer "Delete" button in
the Schedule/Planner view) and the corresponding Board card remained visible instead of
disappearing. This is the first UAT failure for Phase 01, task P01-T01, severity major.

---

## Findings

- There are two distinct delete surfaces. **Board card delete** (Phase 01's new PM feature): `DELETE /api/board/cards/:id` → `boardService.deleteCard` deletes only the BoardCard; it emits `emitBoardInvalidate('cards')` and `useDeleteCard.onSuccess` invalidates `['board','cards']`, so the Board refreshes. **Planner assignment delete** (pre-existing, extended Phase 09): `AssignmentModal` Delete → `useDeleteAssignment` → `DELETE` schedule route → `assignmentService` deletes the Assignment row and, via the orphan guard, deletes the Project (cascading to BoardCard) only when no assignments remain for the project. It already invalidates BOTH `['schedule','assignments']` and `['board','cards']`.
- **Data model:** `Project ↔ BoardCard` is 1:1 (`BoardCard.projectId @unique`, `Project→BoardCard onDelete: Cascade`). `Assignment.projectId`/`splitProjectId` are `onDelete: SetNull` — deleting a BoardCard never deletes the Project or its Assignments.
- **Root cause (most likely, b4 — by design):** the user deleted one planner assignment for a project that still had at least one other assignment; the orphan guard correctly preserved the Project + BoardCard (multi-pentester safety, explicitly NON-NEGOTIABLE), and the Board correctly re-fetched the still-alive card. This is not a Phase 01 regression.
- **Secondary cause (b3 — real edge bug):** if it was the last assignment, the orphan guard's best-effort `try/catch` can swallow a DB error, leaving the Project/BoardCard alive while the user believes the delete fully succeeded — a silent failure with no user feedback.
- **No refresh bug found** in Phase 01's own board-card delete feature (invalidation is wired on both client and server).
- **Recommended remediation (in-scope, small):** surface orphan-guard failures to the user (return a flag from the service → schedule response → a warning toast) and add a delete-confirmation dialog + clarifying copy to the planner `AssignmentModal` Delete so the by-design "card stays while other assignments exist" behavior is understandable. Full options and exact files are in the Recommendations section below.

## Both Delete Surfaces — Mapped with file:line

### Surface A — Board card hard-delete (introduced by Phase 01)

| Layer | Location | Detail |
|---|---|---|
| Route | `backend/src/routes/board.ts:229` | `DELETE /api/board/cards/:id`, `requireRole('PM')` |
| Pre-fetch | `backend/src/routes/board.ts:235–239` | Fetches existing card for audit; 404s if gone |
| Service | `backend/src/services/boardService.ts:284–286` | `deleteCard(id)` — bare `prisma.boardCard.delete` |
| What is deleted | BoardCard row + (via schema cascade) BoardComment, BoardFile, BoardNotification | Project and Assignment rows survive |
| Audit | `backend/src/routes/board.ts:243–248` | `logAuditEvent('board.card.delete', ...)` |
| Server-side socket | `backend/src/routes/board.ts:251` | `emitBoardInvalidate('cards')` after `res.json` |
| Socket service | `backend/src/services/socketService.ts:17–19` | `_io?.emit('board:invalidate', { resource: 'cards' })` |
| Client socket listener | `frontend/src/features/board/useBoardSync.ts:21–24` | `queryClient.invalidateQueries({ queryKey: ['board', resource] })` |
| Client mutation hook | `frontend/src/features/board/hooks.ts:61–71` | `useDeleteCard` — on success: `invalidateQueries(['board','cards'])` |
| UI component | `frontend/src/features/board/components/DeleteCardDialog.tsx:37–46` | Calls `useDeleteCard`, invokes `onDeleted()` + closes dialog on success |

**Net effect:** Deleting via the Board "Delete card" dialog removes only the BoardCard (and its
board-domain children). The Project and its Assignments survive. Board UI receives two
redundant invalidation signals (optimistic query invalidation in `useDeleteCard.onSuccess`
plus the server-pushed `board:invalidate` via WebSocket). Both signal `['board','cards']`.
The Board should refresh correctly after a Board-side delete.

---

### Surface B — Planner assignment delete (pre-existing, extended by Phase 09)

| Layer | Location | Detail |
|---|---|---|
| UI trigger | `frontend/src/features/schedule/components/AssignmentModal.tsx:283–287` | Footer "Delete" button calls `handleDelete` → `deleteMutation.mutate(assignment.id, ...)` |
| FE hook | `frontend/src/features/schedule/hooks.ts:154–168` | `useDeleteAssignment` → `scheduleApi.deleteAssignment(id)` |
| FE invalidations (on success) | `frontend/src/features/schedule/hooks.ts:160–165` | `invalidateQueries(['schedule','assignments'])` AND `invalidateQueries(['board','cards'])` |
| Route | `backend/src/routes/schedule.ts:333–351` | `DELETE /assignments/:id`, `requireRole('PM')` |
| Service | `backend/src/services/assignmentService.ts:345–410` | `deleteAssignment(id)` |
| Assignment delete | `backend/src/services/assignmentService.ts:357` | `prisma.assignment.delete({ where: { id } })` |
| Orphan guard (Phase 09) | `backend/src/services/assignmentService.ts:358–407` | After deleting the row, counts remaining assignments for each linked project; if count === 0, does `prisma.project.delete({ where: { id: pid } })` which cascades → BoardCard → BoardComment/BoardFile/BoardNotification |
| Server-side socket (assignment) | `backend/src/routes/schedule.ts:341` | `emitScheduleInvalidate('assignments')` |
| Server-side socket (board) | `backend/src/routes/schedule.ts:343` | `emitBoardInvalidate('cards')` — fires unconditionally on every assignment delete |
| Schedule sync listener | `frontend/src/features/schedule/useScheduleSync.ts:18–20` | `queryClient.invalidateQueries({ queryKey: ['schedule', resource] })` |
| Board sync listener | `frontend/src/features/board/useBoardSync.ts:21–24` | `queryClient.invalidateQueries({ queryKey: ['board', resource] })` |

**What does the planner delete actually delete?**

- Always: the `Assignment` row.
- Conditionally (last-assignment orphan guard, Phase 09):
  - If the deleted assignment was the LAST one referencing a given `projectId` or
    `splitProjectId` (count across BOTH FK columns === 0 for that project id), then:
    `prisma.project.delete(...)` is called, which cascades to delete the linked `BoardCard`
    and its children via the Prisma schema FK `BoardCard.projectId → onDelete: Cascade`.
  - If other assignments still reference the same project (multi-pentester scenario),
    the Project and its BoardCard are left untouched.
- The orphan guard is wrapped `try/catch` and marked best-effort; a board-side failure does
  not roll back the assignment delete.

---

## Data Model

From `backend/prisma/schema.prisma`:

```
Project (1) ──────── BoardCard (1)    [BoardCard.projectId @unique; onDelete: Cascade]
   │
   ├── primaryAssignments: Assignment[] via Assignment.projectId  (onDelete: SetNull)
   └── splitAssignments:   Assignment[] via Assignment.splitProjectId (onDelete: SetNull)
```

Key properties:
- **Project ↔ BoardCard is 1:1** (`BoardCard.projectId @unique`). One project, one card.
  (`schema.prisma:319–320`)
- **Project → BoardCard** has `onDelete: Cascade` (`schema.prisma:335`). Deleting the
  Project deletes the BoardCard and then cascades to BoardComment, BoardFile,
  BoardNotification.
- **Assignment.projectId** and **Assignment.splitProjectId** are `onDelete: SetNull`
  (`schema.prisma:219–220`). Deleting the Project nulls the FK on surviving Assignments —
  it does NOT delete the Assignment itself.
- **BoardCard.delete does NOT delete the Project.** The cascade arrow goes
  `Project → BoardCard`, not the reverse. Deleting a BoardCard leaves the Project row alive.
- An Assignment is eligible for auto-creation of a Board card only when it has `name +
  clientId + at least one tag` (Planner-eligible, Phase 24-R03). Non-eligible assignments
  have null `projectId` and generate no card. (`assignmentService.ts:107–114`)
- Many Assignments can reference the same Project (multi-pentester). The orphan guard must
  count across BOTH `projectId` and `splitProjectId` to avoid a false zero.

---

## Root Cause Assessment

### Scenario (a) — Design: the user's expectation is simply out of scope for Phase 01

**Claim:** Deleting ONE assignment in the planner does not (and should not) remove the
Board card when other assignments still reference the same project. The Board card correctly
remains.

**Evidence:**
- The orphan guard in `assignmentService.ts:383–407` only deletes the Project+card when
  the assignment count reaches **zero**. For a project with multiple pentester assignments
  (multi-week or multi-pentester), deleting one assignment leaves the Project and its card
  intact by design — the `NON-NEGOTIABLE` comment in the service makes this explicit.
- Phase 01 did not touch the planner delete path at all. The `AssignmentModal` delete flow
  was pre-existing and was intentionally left as-is by the phase.
- The Board card "Delete card" affordance is the Phase-01 surface, not the planner delete.

**Verdict for scenario (a):** Consistent with the report **only** if the project had more
than one assignment. In that case it is by-design and not a bug. However, this is the
**least likely interpretation** of the report: the usual planner UAT scenario involves a
single-pentester single-assignment card, not a multi-pentester one.

---

### Scenario (b) — Real bug: planner assignment delete should remove/refresh the Board card but doesn't

**Claim:** The user deleted the last (or only) assignment for a project, and the Board card
failed to disappear from the Board view.

**Sub-hypothesis b1 — The orphan guard ran but the Board UI was not refreshed.**

This is **ruled out** by the code:
- `backend/src/routes/schedule.ts:343` calls `emitBoardInvalidate('cards')` unconditionally
  on every assignment delete, regardless of whether the orphan guard ran.
- `frontend/src/features/schedule/hooks.ts:163–165` additionally calls
  `queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })` in the mutation's
  `onSuccess` handler.
- Both the server-push (WebSocket) and the optimistic client invalidation target
  `['board', 'cards']`, which is exactly what `useBoardSync` and the board query hooks listen
  on (`useBoardCards` uses `['board', 'cards', filters]` — the prefix invalidation covers
  it). So the Board cache is told to refetch.

**Sub-hypothesis b2 — The orphan guard ran, deleted the Project+card in the DB, but the
Board query returned a stale cached response.**

**Possible but unlikely:** The invalidation is doubly wired (client `onSuccess` + server
WebSocket). If the socket was not connected (e.g., WebSocket disconnected) and the query
cache had not expired, the Board could show stale data briefly, but the `onSuccess`
client-side invalidation in `useDeleteAssignment` fires on the HTTP 200 response regardless
of socket state — this covers the offline-socket case.

**Sub-hypothesis b3 — The orphan guard was triggered but the project/card delete failed
silently (best-effort try/catch) and the BoardCard survived in the DB.**

**Possible:** The orphan guard is wrapped in `try/catch` at `assignmentService.ts:383,
405–407`. A DB write failure (e.g., SQLite lock contention in a concurrent test environment,
or a constraint violation) would be swallowed and logged to the console, leaving the
Project+card alive. The Board query would then correctly return the surviving card. The
`emitBoardInvalidate('cards')` and client invalidation would still fire — but the DB still
has the card, so the Board re-renders it.

**Sub-hypothesis b4 — The assignment was NOT the last one for the project (multi-pentester),
so the orphan guard correctly left the card alive, but the user expected it to disappear.**

**Most likely cause:** If the project has multiple assignments (even from the same pentester
for different weeks), deleting one assignment does not reach count=0 and the card is
intentionally preserved. The user may not have been aware that the card represents the
Project across all its assignments, not just the one they deleted. This would be a UX
expectation mismatch rather than a code bug, but from the user's perspective the card
"stayed on board."

---

### Scenario (c) — The user used the Board card "Delete card" affordance and the Board did NOT refresh

**Claim:** The user actually used the Board UI's own "Delete card" button (Phase 01's
feature), and the Board UI failed to update after the delete.

**Evidence against this being a code bug in Phase 01:**
- `useDeleteCard` (`hooks.ts:61–71`) invalidates `['board','cards']` in `onSuccess`.
- The route also emits `emitBoardInvalidate('cards')` at `board.ts:251`.
- Both mechanisms should cause `useBoardCards` to refetch and drop the deleted card.
- The `DeleteCardDialog.tsx` also calls `onDeleted?.()` which typically closes the
  `CardDetailModal` and returns the user to the Board view.
- The test suite (`boardCardDelete.pm.test.ts`) verifies the cascade but does not cover
  the UI refresh end-to-end.

**Possible residual (c) scenario:** If the user opened the card from the Board, deleted it
via the Board dialog, but the `CardDetailModal` did not unmount (e.g., a stale `open` prop),
the Board grid behind the modal might not have visually updated. But once the modal closes
and the Board grid re-renders, the invalidated query would show the correct state. This
would be a transient visual artifact, not a persistent stale card.

**Verdict for scenario (c):** The report says "deleted from the planner" — this rules out
scenario (c). The user was specifically in the Planner/Schedule view.

---

### Final Verdict

**The most probable root cause is scenario (b4) combined with (b3) as a secondary possibility:**

1. **Primary (b4 — expectation mismatch / by-design for multi-assignment projects):**
   The user deleted one assignment for a project that still had at least one other
   assignment pointing at the same Project row. The orphan guard (`assignmentService.ts:
   383–407`) correctly left the Project+card intact (multi-pentester safety). The Board
   showed the card because it should — the project is still active. The Board cache was
   invalidated correctly. This is not a bug in Phase 01; it is a UX gap: the user expected
   "delete this schedule cell" to mean "remove the project entirely from the board."

2. **Secondary (b3 — silent orphan guard failure):**
   If the assignment WAS the last one, a DB error inside the best-effort try/catch would
   leave the card in the DB while the UI was told to refetch. In that case the card
   survives and correctly re-appears in the Board response. This is a real but hard-to-
   reproduce bug; it requires a DB write error during the orphan delete.

3. **Scenario (a) — by design for intentional multi-assignment projects:** Same mechanism
   as b4 but the multi-assignment state is deliberate (e.g., multiple pentesters assigned).

Phase 01's own feature (Board card delete) does NOT exhibit a refresh bug based on the
code trace. The user was in the Planner, not on the Board.

---

## Prior Fix Analysis

Phase 09 (UAT R01) specifically addressed this class of issue: the comment at
`backend/src/routes/schedule.ts:339–343` reads:

```
// Phase 09 (UAT R01): deleting the last assignment for a project fully
// deletes that orphaned Project + its cascaded BoardCard (see
// assignmentService.deleteAssignment); broadcast a board refresh so other
// connected clients' Planner drops the now-gone card too.
emitBoardInvalidate('cards');
```

And `assignmentService.ts:359–368` has a matching comment explaining the Phase 09 guard.
The `deleteAssignmentOrphan.delete.test.ts` test suite verifies the full cascade. This means
the "last assignment removes the card" path was specifically built and tested. The current
UAT failure represents either:

- A scenario the fix was not designed to cover (multi-assignment project — by-design), OR
- The fix running but the best-effort guard failing silently (b3), OR
- A user expectation gap: they expected deleting ANY assignment to remove the card, not
  only the last one.

---

## Recommendations

### Scope Call

**This is NOT a Phase-01 regression.** Phase 01 added `DELETE /api/board/cards/:id` with
`requireRole('PM')` and the Board UI affordance. The planner assignment delete path was not
changed by Phase 01 (it was addressed in Phase 09). The UAT failure is in the
assignment-delete → board-card propagation path, which Phase 09 already partially fixed.

### Recommended Remediation Options

#### Option 1 — Clarify UX in the planner delete confirmation (low effort, in-scope)

**If the root cause is (b4/a) — user expectation mismatch:**
Add context to the `AssignmentModal` delete confirmation: "Deleting this assignment will
remove the Board card only if no other pentesters are assigned to this project." No code
logic changes required.

- Effort: minimal (one UI string change)
- Risk: none
- Limitation: does not fix b3

#### Option 2 — Surface the orphan-guard failure to the user (medium effort, in-scope fix)

**If the root cause is (b3) — silent guard failure:**
Change the try/catch in `assignmentService.ts:383–407` from a silent log to either:
(a) re-throw so the HTTP 409/500 surfaces to the user, OR
(b) return a `{ warning: 'card_not_removed' }` flag in the response so the frontend can
toast a notice ("Assignment deleted; board card could not be removed — try refreshing").

The backend route (`schedule.ts:333–351`) currently does not inspect the orphan-guard
outcome. This would require: reading a return value from `deleteAssignment`, and adding a
conditional `toast.warning` in `useDeleteAssignment.onSuccess`.

- Effort: small (service + route + hook)
- Risk: low
- Limitation: does not fix b4 (multi-pentester by-design scenario)

#### Option 3 — Inform the user about surviving project assignments before planner delete (medium effort, potentially in-scope)

**If the root cause is (b4) and needs a UX fix rather than just a clarification:**
Before deleting the assignment, fetch the assignment's `projectId`, count remaining
assignments for that project, and if count > 1, warn: "This project has other pentesters
assigned. Deleting this assignment will NOT remove the Board card — only deleting ALL
assignments will remove the card."

- Effort: medium (one extra query in the FE or backend before delete)
- Risk: low
- Limitation: requires either a dedicated endpoint or embedding assignment count in the
  assignment response

#### Option 4 — Flag as out-of-scope: new work for a separate phase

**If the issue is purely a user expectation mismatch (b4/a) with no code bug:**
The current behavior (orphan guard deletes card on last-assignment delete, board is
invalidated) is correct and was already addressed by Phase 09. A user expecting "delete
any assignment = delete board card" is asking for new behavior (delete the Project when
any assignment is removed, regardless of other references). This would be a new feature —
potentially destructive for multi-pentester projects — and should be a separate phase with
explicit product decision.

- Effort: zero (this phase)
- Risk: none (this phase)
- Recommendation: document the behavior in UI copy and close as by-design, OR open a
  new phase if product decides all-or-nothing is the right model

### Decision Guidance

**Recommended approach:** Pursue Option 2 (surface orphan-guard failure) as a small
in-scope fix for the silent-failure case, combined with Option 1 (clarification text) for
the expectation-mismatch case. This covers both root-cause hypotheses without overstepping
Phase 01 scope.

If the tester can reproduce consistently and confirm that the assignment being deleted was
the ONLY one for that project (verifiable by checking `Assignment.count` for the project
before the delete), then b3 (silent DB failure) is the confirmed cause and Option 2 alone
is sufficient.

If the tester confirms there were multiple assignments for the project, then b4 is confirmed
and Option 1 / Option 4 applies — no code bug exists.

### Exact files to change per remediation path

**Option 1 (UI copy):**
- `frontend/src/features/schedule/components/AssignmentModal.tsx:283–287` — enhance the
  delete confirmation AlertDialog description (currently no AlertDialog wraps `handleDelete`
  — add one to match the remove-half pattern at lines 365–389)

**Option 2 (surface guard failure):**
- `backend/src/services/assignmentService.ts:383–407` — change the try/catch to collect
  `orphanDeleteFailed: boolean` and return it alongside the deleted row
- `backend/src/routes/schedule.ts:333–351` — read the flag and include it in the response
- `frontend/src/features/schedule/hooks.ts:154–168` — in `useDeleteAssignment.onSuccess`,
  if the response includes `orphanDeleteFailed: true`, toast a warning

No new query keys or socket channels are needed for either option.
