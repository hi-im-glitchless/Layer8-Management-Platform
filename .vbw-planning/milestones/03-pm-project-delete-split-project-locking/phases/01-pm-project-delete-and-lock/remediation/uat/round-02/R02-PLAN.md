---
phase: 1
round: 2
plan: R02
title: "Planner card delete cascades project + all linked assignments to schedule"
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - backend/src/routes/board.ts
  - backend/src/services/__tests__/boardCardDelete.pm.test.ts
  - frontend/src/features/board/hooks.ts
  - frontend/src/features/board/components/DeleteCardDialog.tsx
forbidden_commands: []
fail_classifications:
  - {id: "UAT-R02-DELETE-PROPAGATION", type: "code-fix", rationale: "Planner card delete does not remove linked schedule assignments; delete propagation is one-directional. Requires a behavioral code change to the board-card delete path plus tests."}
known_issues_input: []
known_issue_resolutions: []
must_haves:
  truths:
    - "Deleting a board card deletes the linked Project and EVERY Assignment row referencing it (primary + split, all pentesters); after the delete the schedule shows none of that project's assignments."
    - "Deleting a single assignment from the schedule still deletes only that one user's assignment; other pentesters' assignments for the same project and the BoardCard remain (round-01 orphan-guard + confirmation dialog + warning toast unchanged)."
    - "If ANY linked assignment is locked, the card delete is rejected with 409 and NOTHING is deleted (no Assignment, no Project, no BoardCard)."
    - "The card delete invalidates BOTH the board cache and the schedule cache (server broadcast + client query invalidation)."
  artifacts:
    - {path: "backend/src/routes/board.ts", provides: "card-delete cascades assignments + emits schedule invalidate", contains: "emitScheduleInvalidate('assignments')"}
    - {path: "frontend/src/features/board/hooks.ts", provides: "useDeleteCard invalidates schedule cache", contains: "['schedule', 'assignments']"}
    - {path: "frontend/src/features/board/components/DeleteCardDialog.tsx", provides: "dialog copy warns assignments will be removed", contains: "schedule"}
    - {path: "backend/src/services/__tests__/boardCardDelete.pm.test.ts", provides: "regression coverage for cascade, scoped-assignment-delete, and lock policy", contains: "isLocked"}
  key_links:
    - {from: "backend/src/routes/board.ts", to: "backend/src/services/assignmentService.ts", via: "deleteAssignment per linked assignment id (reuses lock-check + orphan-guard)"}
    - {from: "backend/src/services/boardService.ts", to: "backend/src/routes/board.ts", via: "getCard already includes project.primaryAssignments/splitAssignments — assignment ids available without extra query"}
---
<objective>
Fix the UAT major: deleting a board card (Planner) must propagate to the Schedule.
Make the board-card delete path delete ALL Assignment rows for the card's linked
Project, which triggers the existing assignmentService orphan-guard to delete the
Project and cascade the BoardCard. Invalidate both board and schedule caches. The
opposite direction (single-assignment delete from the schedule) must stay scoped
to one user and is NOT modified. Locked linked assignments block the whole delete
with a 409.
</objective>
<context>
@.vbw-planning/phases/01-pm-project-delete-and-lock/remediation/uat/round-02/R02-RESEARCH.md

Key facts (validated against source):
- `assignmentService.deleteAssignment(id)` (assignmentService.ts:345) already does
  the lock-check (throws "Cannot delete a locked assignment..." when isLocked) and
  the orphan-guard (deletes the Project when no Assignment references it, which
  cascades the BoardCard via BoardCard.projectId onDelete: Cascade). REUSE it — do
  not duplicate this logic.
- `boardService.getCard(id)` (boardService.ts:134) already includes
  `project.primaryAssignments` and `project.splitAssignments`; the board route
  pre-fetches `existing` via getCard. The shaped `existing.assignments` array
  carries the assignment ids — no extra query needed.
- The board route DELETE /cards/:id (board.ts:229) currently calls only
  `boardService.deleteCard(id)` + `emitBoardInvalidate('cards')`. It must instead
  delete the linked assignments and ALSO `emitScheduleInvalidate('assignments')`.
- The schedule DELETE /assignments/:id (schedule.ts:333) is the reference pattern
  for the 409-on-lock handling (`error.message.includes('locked')` → 409) and for
  emitting BOTH invalidations. Mirror it.
- Round-01 single-assignment-delete path (AssignmentModal confirmation dialog,
  orphanCleanupFailed warning toast, multi-pentester safety) MUST remain unchanged.
- LOCK POLICY (explicit decision): if ANY linked assignment is locked, reject the
  whole card delete with 409 and delete NOTHING. This is consistent with the
  schedule surface's existing lock semantics. Do NOT partial-delete.
</context>
<tasks>
<!-- Tasks are executed sequentially — task N+1 sees the results of task N. -->

<task type="auto">
  <name>Cascade assignment deletes from the board card-delete route (all-or-nothing on lock)</name>
  <files>
    backend/src/routes/board.ts
  </files>
  <action>
In the `DELETE /cards/:id` handler (board.ts:229) replace the bare
`await boardService.deleteCard(id)` with cascade-through-assignments logic:

1. Import `emitScheduleInvalidate` alongside the existing `emitBoardInvalidate`
   from `'../services/socketService.js'`, and `import * as assignmentService from
   '../services/assignmentService.js'`.
2. After the `existing = await boardService.getCard(id)` / 404 guard, collect the
   distinct linked assignment ids from `existing.assignments` (the shaped array
   already returned by getCard; de-dup with a Set since a split half can appear
   once per project view). 
3. PRE-CHECK LOCKS (all-or-nothing): before deleting anything, if ANY linked
   assignment is locked, return `409 { error: '<message about locked assignment>' }`
   WITHOUT deleting any Assignment / Project / BoardCard. Read isLocked from the
   shaped assignment objects if present; if isLocked is not exposed on the shaped
   object, fetch the lock state cheaply (e.g. `prisma.assignment.findMany({ where:
   { id: { in: ids } }, select: { id: true, isLocked: true } })`) and reject if any
   isLocked. This guarantees the 409 fires BEFORE the first destructive write.
4. For each linked assignment id, call `await assignmentService.deleteAssignment(id)`.
   This reuses the lock-check + orphan-guard. The orphan-guard deletes the Project
   when its last assignment is gone, which cascades the BoardCard away — so the card
   is removed as a side effect. If, after the loop, the card still exists (project
   had no linked assignments — a card with zero assignments), fall back to
   `await boardService.deleteCard(id)` so a zero-assignment card still deletes.
5. Keep the existing `logAuditEvent({ action: 'board.card.delete', ... })` call.
6. After the deletes succeed, emit BOTH `emitBoardInvalidate('cards')` AND
   `emitScheduleInvalidate('assignments')` (mirror schedule.ts:338-343).
7. In the catch block, add a branch BEFORE the generic 500: if the error message
   includes `'locked'`, return `409 { error: error.message }` (mirror
   schedule.ts:345-347), keeping the existing P2025 → 404 branch.

Update the route's doc-comment (board.ts:215-227) to state the new behavior:
deleting a card now deletes the linked Project and ALL its schedule assignments;
a locked linked assignment blocks the whole delete with 409.
  </action>
  <verify>
Run `cd backend && npx tsc --noEmit` (or the project typecheck) — no type errors.
Confirm via grep: `grep -n "emitScheduleInvalidate\|assignmentService.deleteAssignment\|locked" backend/src/routes/board.ts` shows the schedule invalidate, the per-assignment delete loop, and the 409 lock branch.
  </verify>
  <done>
The card-delete route deletes all linked assignments via assignmentService,
rejects with 409 (deleting nothing) when any linked assignment is locked, and
emits both board and schedule invalidations. Typecheck clean.
  </done>
</task>

<task type="auto">
  <name>Update the existing board-card delete service test to the new cascade behavior</name>
  <files>
    backend/src/services/__tests__/boardCardDelete.pm.test.ts
  </files>
  <action>
The existing suite (boardCardDelete.pm.test.ts:182) asserts the now-OBSOLETE
"PROJECT SURVIVAL" and "ASSIGNMENT SURVIVAL" invariants — these are the exact
behaviors the fix inverts, so the test will now fail and must be rewritten to
exercise the route-level behavior (not the bare boardService.deleteCard, which no
longer represents the delete path).

Rewrite the suite to drive the new behavior. Because the cascade logic now lives
in the route, exercise it the way the route does: collect the linked assignment ids
and call `assignmentService.deleteAssignment(id)` for each (the route's mechanism),
then assert:
  (a) CASCADE: after deleting the project's only linked assignment, the Project AND
      its BoardCard (and BoardComment/BoardFile/BoardNotification children) are gone.
  (b) AUDIT: a `board.card.delete` AuditLog row is still written by the route
      (keep this assertion if the test continues to call logAuditEvent as before).
Update the file's header comment block (lines 1-28) to describe the NEW invariants
(cascade deletes Project + Assignment + card), replacing the old survival language.
Keep the withDbRetry helper, uniqueSuffix, scoped-id cleanup, and dev-DB usage
exactly as-is (do NOT introduce mocks; this is an integration test against the dev DB).
  </action>
  <verify>
Run `cd backend && npx vitest run src/services/__tests__/boardCardDelete.pm.test.ts`
— suite passes and no longer asserts project/assignment survival.
`grep -n "SURVIVAL\|not deleted\|preserves Project" backend/src/services/__tests__/boardCardDelete.pm.test.ts` returns nothing.
  </verify>
  <done>
The pre-existing delete test reflects the cascade behavior and passes; obsolete
survival assertions removed.
  </done>
</task>

<task type="auto">
  <name>Invalidate the schedule query cache on the frontend after a card delete</name>
  <files>
    frontend/src/features/board/hooks.ts
  </files>
  <action>
In `useDeleteCard` (hooks.ts:61), add a second invalidation in `onSuccess` so the
schedule grid refetches after a card delete (mirror the pattern in
`useDeleteAssignment` which invalidates both `['board','cards']` and
`['schedule','assignments']`):

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['board', 'cards'] })
      queryClient.invalidateQueries({ queryKey: ['schedule', 'assignments'] })
    },

Do not change the per-call onSuccess in DeleteCardDialog (it handles dialog close).
  </action>
  <verify>
`grep -n "schedule', 'assignments'" frontend/src/features/board/hooks.ts` shows the
new invalidation inside useDeleteCard. Run `cd frontend && npx tsc --noEmit` — clean.
  </verify>
  <done>
useDeleteCard invalidates both the board and schedule query caches on success.
  </done>
</task>

<task type="auto">
  <name>Correct the DeleteCardDialog copy to warn that assignments will be removed</name>
  <files>
    frontend/src/features/board/components/DeleteCardDialog.tsx
  </files>
  <action>
The dialog description (DeleteCardDialog.tsx:57-61) currently states "The linked
schedule assignments are not affected" — this is now the OPPOSITE of the behavior.
Rewrite the AlertDialogDescription to clearly warn that deleting the card removes
the project AND all its linked schedule assignments, and that this cannot be undone.
State HOW MANY assignments will be removed: thread the linked-assignment count into
the dialog. Add an optional `assignmentCount?: number` prop to DeleteCardDialogProps
and have the parent (CardDetailModal, which already has the card's assignments
loaded) pass it; render e.g. "This permanently deletes the card, the project, and
its {assignmentCount} schedule assignment(s) (for all pentesters). This cannot be
undone." Keep the existing AlertDialog pattern, the projectName in the title, and
the disabled/isPending behavior unchanged. Do NOT use native confirm().
Also update the component doc-comment (lines 21-29) to match the new behavior.
If wiring the count from the parent is not cleanly available, fall back to copy that
omits the exact number but still clearly states all linked schedule assignments for
every pentester will be removed — but prefer showing the count.
  </action>
  <verify>
`grep -n "not affected" frontend/src/features/board/components/DeleteCardDialog.tsx`
returns nothing. `grep -n "schedule assignment\|assignmentCount" frontend/src/features/board/components/DeleteCardDialog.tsx`
shows the new warning copy. Run `cd frontend && npx tsc --noEmit` — clean (including
the caller passing the new prop if added).
  </verify>
  <done>
The dialog warns the user that the card delete removes the project and all linked
schedule assignments (showing the count); the misleading "not affected" line is gone.
  </done>
</task>

<task type="auto">
  <name>Add route-level regression tests for cascade, scoped-assignment-delete, and lock policy</name>
  <files>
    backend/src/services/__tests__/boardCardDelete.pm.test.ts
  </files>
  <action>
Add regression test cases to the suite (reuse withDbRetry, uniqueSuffix, scoped-id
cleanup; integration against the dev DB; NO mocks; parallel-safe scoped ids).
Exercise the route mechanism (collect linked assignment ids → deleteAssignment per
id, plus the 409-lock pre-check the route performs). Cover all three required cases:

  (a) MULTI-ASSIGNMENT CASCADE: seed one Project with a BoardCard and TWO+ linked
      Assignment rows for DIFFERENT TeamMembers (one via projectId, one via
      splitProjectId or a second projectId). Delete the card (delete all linked
      assignments). Assert: ALL linked Assignment rows are gone, the Project is
      gone, and the BoardCard is gone.

  (b) SCOPED SINGLE-ASSIGNMENT DELETE (no regression): seed one Project + BoardCard
      with TWO linked Assignments for different pentesters. Call
      `assignmentService.deleteAssignment` for ONLY ONE assignment id. Assert: the
      OTHER pentester's Assignment still exists, the Project still exists, and the
      BoardCard still exists. (Proves the round-01 multi-pentester safety holds.)

  (c) LOCKED LINKED ASSIGNMENT: seed a Project + BoardCard with a linked Assignment
      where `isLocked: true`. Assert that the lock policy holds: calling
      `assignmentService.deleteAssignment` on the locked id throws (message includes
      "locked"), and that NOTHING was deleted — the Assignment, Project, and
      BoardCard all still exist afterward. (This proves the route's all-or-nothing
      409 pre-check leaves the DB untouched.)

Name the test cases descriptively. Scope every assertion to seeded ids.
  </action>
  <verify>
Run `cd backend && npx vitest run src/services/__tests__/boardCardDelete.pm.test.ts`
— all cases (including the existing rewritten one and the three new ones) pass.
`grep -n "isLocked\|different\|still exists\|toBeNull\|locked" backend/src/services/__tests__/boardCardDelete.pm.test.ts`
confirms the three scenarios are present.
  </verify>
  <done>
Regression coverage proves: (a) multi-assignment card delete cascades everything,
(b) single-assignment delete stays scoped and preserves the card + other pentesters,
(c) a locked linked assignment blocks the delete and leaves all rows intact. Suite green.
  </done>
</task>
</tasks>
<verification>
1. `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` both clean.
2. `cd backend && npx vitest run src/services/__tests__/boardCardDelete.pm.test.ts` — all cases pass.
3. Run the broader backend schedule/board delete suites (e.g. `npx vitest run src/services/__tests__/deleteAssignmentOrphan.delete.test.ts src/routes/__tests__`) — the round-01 single-assignment-delete behavior and orphan-guard tests still pass (no regression).
4. `grep -n "emitScheduleInvalidate" backend/src/routes/board.ts` shows the board route now broadcasts schedule invalidation.
5. `grep -n "not affected" frontend/src/features/board/components/DeleteCardDialog.tsx` returns nothing (misleading copy removed).
</verification>
<success_criteria>
- Deleting a board card removes the linked Project and EVERY linked Assignment (primary + split, all pentesters); the schedule shows none of that project's assignments afterward, and both the board and schedule UIs refresh.
- Deleting a single assignment from the schedule still deletes only that one user's assignment; other pentesters' assignments and the BoardCard remain, and the round-01 confirmation dialog + orphan-cleanup warning toast are unchanged.
- A card delete with any locked linked assignment is rejected with 409 and deletes nothing (Assignment, Project, and BoardCard all survive).
- The DeleteCardDialog clearly warns that the delete removes the project and all linked schedule assignments (stating how many).
- Typecheck clean on both packages; the rewritten + new tests in boardCardDelete.pm.test.ts pass and no round-01 delete test regresses.
</success_criteria>
<known_issue_workflow>
- No carried known issues this round: `known_issues_input: []` and `known_issue_resolutions: []`.
</known_issue_workflow>
<output>
R02-SUMMARY.md
</output>
