---
phase: 1
round: 1
plan: R01
title: "Surface orphan-guard failures + clarify planner-delete UX (UAT P01-T01)"
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - backend/src/services/assignmentService.ts
  - backend/src/routes/schedule.ts
  - backend/src/services/__tests__/deleteAssignmentOrphanFailure.test.ts
  - frontend/src/features/schedule/api.ts
  - frontend/src/features/schedule/hooks.ts
  - frontend/src/features/schedule/components/AssignmentModal.tsx
  - frontend/src/features/schedule/components/__tests__/AssignmentModal.deleteConfirm.test.tsx
forbidden_commands: []
fail_classifications:
  - {id: "P01-T01", type: "code-fix", rationale: "Silent orphan-guard failure (research b3) leaves the project/board card alive while the user is told the delete succeeded — a real defect fixed by surfacing the failure; paired with a delete-confirmation dialog (Option 1) to make the by-design multi-assignment behavior (b4) understandable."}
known_issues_input: []
known_issue_resolutions: []
must_haves:
  truths:
    - "deleteAssignment still deletes the Assignment row unconditionally and still deletes the orphaned Project (cascading to BoardCard) ONLY when the project's remaining assignment count across projectId+splitProjectId is zero — multi-pentester safety unchanged."
    - "When the orphan cleanup throws inside the best-effort try/catch on a last-assignment delete, deleteAssignment reports the failure to its caller instead of swallowing it silently."
    - "The DELETE /assignments/:id response carries the orphan-cleanup-failure signal so the frontend can react."
    - "useDeleteAssignment shows a warning toast (not a silent success) when the response signals the orphan cleanup failed."
    - "The planner AssignmentModal Delete action requires a confirmation whose copy states the card is only removed when this is the project's last assignment."
  artifacts:
    - {path: "backend/src/services/assignmentService.ts", provides: "deleteAssignment returning an object carrying both the deleted row and an orphanCleanupFailed boolean", contains: "orphanCleanupFailed"}
    - {path: "backend/src/routes/schedule.ts", provides: "DELETE route that reads the flag and includes it in the JSON response", contains: "orphanCleanupFailed"}
    - {path: "frontend/src/features/schedule/hooks.ts", provides: "useDeleteAssignment warning toast on orphanCleanupFailed", contains: "orphanCleanupFailed"}
    - {path: "frontend/src/features/schedule/components/AssignmentModal.tsx", provides: "AlertDialog confirmation wrapping the Delete button", contains: "AlertDialog"}
    - {path: "backend/src/services/__tests__/deleteAssignmentOrphanFailure.test.ts", provides: "regression test asserting orphanCleanupFailed is true when the project delete throws and false on the happy path", contains: "orphanCleanupFailed"}
  key_links:
    - {from: "backend/src/services/assignmentService.ts", to: "backend/src/routes/schedule.ts", via: "deleteAssignment return value -> response body"}
    - {from: "backend/src/routes/schedule.ts", to: "frontend/src/features/schedule/hooks.ts", via: "orphanCleanupFailed flag in DELETE response -> warning toast"}
    - {from: "frontend/src/features/schedule/components/AssignmentModal.tsx", to: "frontend/src/features/schedule/hooks.ts", via: "AlertDialogAction onClick -> handleDelete -> useDeleteAssignment"}
---
<objective>
Remediate UAT P01-T01 ("deleted the card from the planner and it stayed in board"). The
cross-view sync is already wired and the multi-assignment behavior is by-design; the real
defect is the SILENT FAILURE edge (research b3): when the last-assignment orphan guard's
best-effort try/catch swallows a DB error, the Project/BoardCard survive but the user is
told the delete succeeded. Surface that failure as a warning toast (Option 2), and add a
delete-confirmation dialog with clarifying copy (Option 1) so the by-design "card stays
while other assignments exist" behavior (b4) is understandable. Do NOT re-architect the
delete model, do NOT add per-assignment board-card deletion, and do NOT touch Phase 01's
board-card delete feature. The zero-count-only orphan rule (multi-pentester safety,
NON-NEGOTIABLE) stays intact.
</objective>
<context>
@/home/rm/Documents/Layer8-Management-Platform/.vbw-planning/phases/01-pm-project-delete-and-lock/remediation/uat/round-01/R01-RESEARCH.md
Key reference points from the research (validated against current source):
- Orphan guard: backend/src/services/assignmentService.ts ~383-407 (try/catch swallows DB error; returns `deleted` row).
- Delete route: backend/src/routes/schedule.ts ~333-351 (discards deleteAssignment return; responds `{ success: true }`).
- FE hook: frontend/src/features/schedule/hooks.ts ~154-168 (useDeleteAssignment; `toast` from 'sonner' already imported; invalidates ['schedule','assignments'] and ['board','cards']).
- FE api: frontend/src/features/schedule/api.ts ~97 (deleteAssignment typed `<{ success: boolean }>`).
- Delete button: frontend/src/features/schedule/components/AssignmentModal.tsx ~555-567 (destructive Button calling handleDelete at ~283-288).
- Pattern to mirror for the dialog: the remove-primary AlertDialog at AssignmentModal.tsx ~365-389 (AlertDialog/Trigger/Content/Action all already imported).
- Backend test pattern to mirror: backend/src/services/__tests__/deleteAssignmentOrphan.delete.test.ts (uniqueSuffix, withDbRetry, seeded-id scoping, dev DB).
- FE test pattern to mirror: frontend/src/features/schedule/components/__tests__/AssignmentModal.lock.test.tsx.
</context>
<tasks>
<!-- Tasks are executed sequentially — task N+1 sees the results of task N. -->
<task type="auto">
  <name>Backend: surface orphan-cleanup failure from deleteAssignment</name>
  <files>
    backend/src/services/assignmentService.ts
  </files>
  <action>
Change deleteAssignment (~345-410) so the best-effort orphan cleanup no longer fails
silently:
- Introduce a local `let orphanCleanupFailed = false;` before the try block.
- Keep the existing try/catch and the zero-count-only delete logic EXACTLY as-is
  (linkedProjectIds de-dup, count over OR projectId/splitProjectId, project.findUnique
  guard, project.delete cascade). Do NOT change the multi-pentester safety rule.
- In the catch block, after the existing console.error, set `orphanCleanupFailed = true;`
  (do NOT re-throw — the assignment delete must still succeed; non-fatal contract preserved).
- Change the return from `return deleted;` to `return { deleted, orphanCleanupFailed };`.
- Update the surrounding comment ("deleteAssignment still returns the deleted row") to
  reflect the new `{ deleted, orphanCleanupFailed }` shape.
The only existing caller (schedule route) discards the return value today, so this shape
change is safe; the route is updated in the next task.
  </action>
  <verify>
cd backend && npx tsc --noEmit (no new errors in assignmentService.ts).
grep -n "orphanCleanupFailed" backend/src/services/assignmentService.ts shows the flag set
in catch and returned.
  </verify>
  <done>
deleteAssignment returns { deleted, orphanCleanupFailed }; failure path sets the flag, happy
path leaves it false, assignment-delete and zero-count orphan rule unchanged.
Commit: refactor(schedule): return orphan-cleanup-failure flag from deleteAssignment
  </done>
</task>
<task type="auto">
  <name>Backend: include orphan-cleanup-failure flag in DELETE response</name>
  <files>
    backend/src/routes/schedule.ts
  </files>
  <action>
In the DELETE /assignments/:id handler (~333-351):
- Capture the result: `const { orphanCleanupFailed } = await assignmentService.deleteAssignment(id);`
- Change the response from `res.json({ success: true })` to
  `res.json({ success: true, orphanCleanupFailed })`.
- Keep emitScheduleInvalidate('assignments') and emitBoardInvalidate('cards') firing
  unconditionally after the response, exactly as today (Phase 09 comment stays).
- Leave the locked-assignment 409 and generic 500 error handling unchanged.
  </action>
  <verify>
cd backend && npx tsc --noEmit (clean).
grep -n "orphanCleanupFailed" backend/src/routes/schedule.ts shows it destructured and in
the json response.
  </verify>
  <done>
DELETE /assignments/:id responds { success: true, orphanCleanupFailed }; invalidation
broadcasts and error handling unchanged.
Commit: feat(schedule): surface orphan-cleanup failure in assignment delete response
  </done>
</task>
<task type="auto">
  <name>Backend: regression test for orphan-cleanup-failure surfacing</name>
  <files>
    backend/src/services/__tests__/deleteAssignmentOrphanFailure.test.ts
  </files>
  <action>
Create a new vitest suite mirroring deleteAssignmentOrphan.delete.test.ts conventions
(import { deleteAssignment } from '../assignmentService.js'; uniqueSuffix; withDbRetry;
afterEach cleanup scoped to seeded ids; runs against dev DB per backend/vitest.config.ts).
Assert two cases:
- HAPPY PATH: seed a Client + Project + BoardCard + TeamMember + a single Assignment
  referencing the project. Call deleteAssignment(id). Expect the returned object's
  `orphanCleanupFailed === false`, and confirm the Project + BoardCard are gone (cascade),
  matching the existing zero->deleted invariant.
- FAILURE PATH: force the orphan project.delete to throw and assert the flag flips to true
  while the assignment is still deleted and the card survives. Implement the forced failure
  WITHOUT changing production code — preferred approach: use `vi.spyOn(prisma.project, 'delete')`
  (import { vi } and { prisma } from '../../db/prisma.js') to throw once for the last-
  assignment delete, then call deleteAssignment and assert `result.orphanCleanupFailed === true`,
  the Assignment row no longer exists, and the BoardCard still exists. Restore the spy in a
  finally/afterEach. If spying on the prisma client proves impractical in this setup, fall
  back to asserting only the happy-path flag value and add a TODO note — but attempt the spy
  first since it directly proves the b3 fix.
Keep all assertions scoped to seeded ids (parallel-safe) and wrap writes in withDbRetry to
tolerate SQLite busy errors.
  </action>
  <verify>
cd backend && npx vitest run src/services/__tests__/deleteAssignmentOrphanFailure.test.ts
— both cases pass. Also run the existing guard suite to confirm no regression:
npx vitest run src/services/__tests__/deleteAssignmentOrphan.delete.test.ts.
  </verify>
  <done>
New suite proves orphanCleanupFailed is false on success and true when the project delete
throws (assignment still deleted, card survives); existing orphan-guard suite still green.
Commit: test(schedule): assert orphan-cleanup failure is surfaced from deleteAssignment
  </done>
</task>
<task type="auto">
  <name>Frontend: warn on orphan-cleanup failure in useDeleteAssignment</name>
  <files>
    frontend/src/features/schedule/api.ts
    frontend/src/features/schedule/hooks.ts
  </files>
  <action>
- api.ts (~97): widen the deleteAssignment response type from `<{ success: boolean }>` to
  `<{ success: boolean; orphanCleanupFailed?: boolean }>` so the hook can read the flag.
- hooks.ts useDeleteAssignment (~154-168): change the mutation so onSuccess receives the
  response data (`onSuccess: (data) => { ... }`). Keep BOTH existing invalidations
  (['schedule','assignments'] and ['board','cards']). After invalidating, if
  `data?.orphanCleanupFailed` is true, call
  `toast.warning('Assignment deleted, but the project/board card could not be cleaned up — please retry or remove it from the Board.')`.
  `toast` is already imported from 'sonner'. Leave onError/handleMutationError unchanged.
  </action>
  <verify>
cd frontend && npx tsc --noEmit (clean).
grep -n "orphanCleanupFailed" frontend/src/features/schedule/hooks.ts frontend/src/features/schedule/api.ts
shows the type widened and the conditional warning toast wired.
  </verify>
  <done>
useDeleteAssignment surfaces a warning toast when the backend reports orphanCleanupFailed,
without altering the success/invalidation behavior on the normal path.
Commit: feat(schedule): warn user when planner delete leaves an orphaned board card
  </done>
</task>
<task type="auto">
  <name>Frontend: confirmation dialog with clarifying copy on planner Delete</name>
  <files>
    frontend/src/features/schedule/components/AssignmentModal.tsx
  </files>
  <action>
Wrap the footer destructive Delete button (~555-567) in an AlertDialog mirroring the
existing remove-primary pattern (~365-389) — all AlertDialog parts are already imported:
- Replace the bare `<Button ... onClick={handleDelete}>Delete</Button>` with an
  `<AlertDialog>` whose `<AlertDialogTrigger asChild>` holds that same destructive Button
  (keep variant="destructive", size="sm", className="mr-auto", the Trash2 icon, and
  `disabled={deleteMutation.isPending || isLocked}`); remove the onClick from the trigger
  Button.
- `<AlertDialogContent>` with title "Delete this assignment?" and a description that makes
  the by-design behavior explicit, e.g.: "This removes the schedule entry. The project's
  Board card is only removed when this is the project's last assignment — if other
  assignments remain, the card stays on the Board."
- Footer: `<AlertDialogCancel>Cancel</AlertDialogCancel>` and
  `<AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>`.
- Keep handleDelete (~283-288) exactly as-is. Do NOT change any other footer button.
  </action>
  <verify>
cd frontend && npx tsc --noEmit (clean) and npx eslint src/features/schedule/components/AssignmentModal.tsx.
grep -n "Delete this assignment\|last assignment" frontend/src/features/schedule/components/AssignmentModal.tsx
confirms the dialog copy is present.
  </verify>
  <done>
The planner Delete action opens a confirmation AlertDialog whose copy explains the
last-assignment card-removal rule; confirming triggers the existing handleDelete.
Commit: feat(schedule): confirm planner assignment delete with card-removal clarification
  </done>
</task>
<task type="auto">
  <name>Frontend: test the delete-confirmation dialog</name>
  <files>
    frontend/src/features/schedule/components/__tests__/AssignmentModal.deleteConfirm.test.tsx
  </files>
  <action>
Create a component test mirroring AssignmentModal.lock.test.tsx setup (same render
harness, QueryClient/provider wrapper, and mocking style it uses). Render AssignmentModal
in edit mode (with an existing assignment) and assert:
- Clicking the footer "Delete" button opens the confirmation dialog (the clarifying copy
  about the card being removed only on the last assignment is visible).
- Confirming via the dialog's "Delete" action invokes the delete mutation (assert the
  mocked scheduleApi.deleteAssignment / useDeleteAssignment mutationFn is called with the
  assignment id), and Cancel dismisses without calling it.
Reuse whatever mock pattern lock.test.tsx already uses for the schedule api/hooks so the
test stays consistent with the suite. If the existing harness makes asserting the mutation
call impractical, at minimum assert the dialog opens with the clarifying copy and that
Cancel closes it without deleting.
  </action>
  <verify>
cd frontend && npx vitest run src/features/schedule/components/__tests__/AssignmentModal.deleteConfirm.test.tsx
passes. Run the sibling suite to confirm no shared-harness regression:
npx vitest run src/features/schedule/components/__tests__/AssignmentModal.lock.test.tsx.
  </verify>
  <done>
A frontend test confirms the Delete confirmation dialog opens with the clarifying copy and
that confirming (not cancelling) triggers the delete.
Commit: test(schedule): cover planner delete confirmation dialog
  </done>
</task>
</tasks>
<verification>
1. Backend typechecks: cd backend && npx tsc --noEmit (clean).
2. Frontend typechecks: cd frontend && npx tsc --noEmit (clean).
3. Backend suites green: npx vitest run src/services/__tests__/deleteAssignmentOrphanFailure.test.ts and src/services/__tests__/deleteAssignmentOrphan.delete.test.ts.
4. Frontend suites green: npx vitest run src/features/schedule/components/__tests__/AssignmentModal.deleteConfirm.test.tsx and AssignmentModal.lock.test.tsx.
5. grep confirms orphanCleanupFailed threads service -> route -> api -> hook, and the AlertDialog copy is present in AssignmentModal.tsx.
6. Manual trace: a last-assignment delete whose project.delete throws returns orphanCleanupFailed:true -> route responds with the flag -> hook fires toast.warning; multi-assignment delete leaves the card (count != 0) and the flag stays false.
</verification>
<success_criteria>
- The silent-failure edge (research b3) is closed: an orphan-cleanup DB error on a last-assignment delete produces a user-visible warning toast instead of a silent success.
- The planner Delete action shows a confirmation dialog whose copy explains the by-design last-assignment card-removal rule (addresses the b4 expectation mismatch).
- The zero-count-only orphan rule and multi-pentester safety are unchanged; the assignment delete remains non-fatal w.r.t. board cleanup.
- Phase 01's board-card delete feature is untouched; no per-assignment board-card deletion or delete-model re-architecture introduced.
- New backend and frontend tests pass; the existing orphan-guard and lock suites still pass.
</success_criteria>
<known_issue_workflow>
- No carried known issues for this round; known_issues_input and known_issue_resolutions are both empty arrays.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
