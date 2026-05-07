---
phase: 24
plan: 05
title: "Board filter fix (My Projects bug + role-aware default), swap-orphan repair, Phase 24 schedule-isolation regression"
wave: 3
status: complete
completed: 2026-05-07
tasks_completed: 5
tasks_total: 5
commit_hashes:
  - 6dd27b35c58122c8b0bf7a0325293d34f92eeecf
  - e40e9e68ef4f16b0ca31af3c07a67c6b449feee7
  - e093f926032347761012d5cf97f34b6e7b2d6dde
  - 4acbf39143c2c496fdf99c4877b54d60562e431c
  - 81df4f15d568518c737f4721c0db1b9a65c3febf
  - f40f79a6339133f66ece51be609c3d95dc4e6d38
files_modified:
  - backend/src/services/boardService.ts
  - backend/src/services/assignmentService.ts
  - backend/src/services/__tests__/scheduleIsolation.phase24.test.ts
  - frontend/src/features/board/types.ts
  - frontend/src/routes/Board.tsx
deviations:
  - code: DEVN-05
    summary: "Phase 23's existing scheduleIsolation tests fail 4/6 when run CONCURRENTLY with the new Phase 24 isolation suite, because Phase 23's snapshotScheduleTables reads ALL rows in the dev DB and is sensitive to any concurrent test seed/teardown. Pre-existing in Phase 23's test design (visible only because Phase 24 is the second isolation file). Phase 23 still passes 6/6 when run alone (verified). Phase 24 passes 3/3 both alone AND when concurrent with Phase 23 (the new tests scope their snapshots to seeded ids only). Out of scope to fix Phase 23 in this plan."
pre_existing_issues:
  - '{"test": "scheduleIsolation.phase23 (concurrent run)", "file": "backend/src/services/__tests__/scheduleIsolation.phase23.test.ts", "error": "4/6 tests fail when run concurrently with scheduleIsolation.phase24.test.ts due to global-snapshot sensitivity in Phase 23s snapshotScheduleTables — Phase 23 still passes 6/6 when run in isolation"}'
ac_results:
  - criterion: "Filter bug fix: Board.tsx 'mine' filter compares card.assignment.teamMember.userId === user.id (NOT card.assignment.teamMemberId === user.id which is the existing buggy comparison at lines 98-102 — userId and teamMemberId are different identifiers per schema.prisma:170)"
    verdict: "pass"
    evidence: "frontend/src/routes/Board.tsx:139 (commit e40e9e6) — `(card) => card.assignment?.teamMember?.userId === user.id`; the buggy `teamMemberId === user.id` comparison is replaced and survives only as a comment at line 135 explaining the prior bug"
  - criterion: "Backend support for the filter fix: boardService.listCards / getCard Prisma include adds teamMember: { select: { userId: true } } nested under assignment.teamMember; this is a READ-ONLY join expansion — zero schedule writes"
    verdict: "pass"
    evidence: "backend/src/services/boardService.ts:50-58 and 73-80 (commit 6dd27b3) — both listCards and getCard widen `include: { assignment: true }` to `include: { assignment: { include: { teamMember: { select: { userId: true } } } } }`; Task 5 grep verified zero prisma.assignment/teamMember/absence/holiday writes anywhere in boardService.ts"
  - criterion: "FE board types (frontend/src/features/board/types.ts): the assignment shape gains teamMember.userId so the filter comparison compiles and works without an any-cast"
    verdict: "pass"
    evidence: "frontend/src/features/board/types.ts:32-40 (commit e40e9e6) — `teamMember?: { userId: string | null } | null` added to BoardCard.assignment; cd frontend && npx tsc --noEmit exits 0"
  - criterion: "Default filter: Board.tsx initializes filterMode to 'all' for role 'PM' or 'ADMIN', and 'mine' for role 'NORMAL'; on the brief flicker where useAuth() is still loading and role defaults to 'NORMAL', a useEffect re-derives the default once isLoading flips false"
    verdict: "pass"
    evidence: "frontend/src/routes/Board.tsx:55 useState initial = `role === 'NORMAL' ? 'mine' : 'all'`; lines 65-71 useEffect re-derives once authLoading flips false; eslint-disable for exhaustive-deps is intentional"
  - criterion: "Swap-orphan repair: ⚠ LIVE VALIDATION REQUIRED — first run a manual swap of two assignments-with-cards in the dev DB and confirm whether the orphan actually occurs. Only fix if confirmed."
    verdict: "pass"
    evidence: "Live-validated 2026-05-07 against backend/dev.db using a tsx one-shot script: pre-swap cardA.assignmentId / cardB.assignmentId both populated; post-swap both went to NULL (orphan REPRODUCED on both cards). Fix applied at backend/src/services/assignmentService.ts:307-326 (commit e093f92): capture pre-swap card linkages, then post-transaction relink each card via prisma.boardCard.update({ where: { id: card.id }, data: { assignmentId: ... } }); fallback to createCardForAssignment for legacy assignments with no card. Re-validation after the fix: orphan(cardA)=false, orphan(cardB)=false on both swap-and-restore cycles. Repair runs OUTSIDE the schedule transaction in try/catch — schedule writes always succeed."
  - criterion: "Phase 24 schedule-isolation regression test: a new file backend/src/services/__tests__/scheduleIsolation.phase24.test.ts that follows the byte-equality pattern from scheduleIsolation.phase23.test.ts and exercises every NEW write path introduced in Phase 24"
    verdict: "pass"
    evidence: "backend/src/services/__tests__/scheduleIsolation.phase24.test.ts (commits 4acbf39 + f40f79a) — 3 cases: (1) swapAssignments leaves swap-invariant unchanged (TeamMember/Absence/Holiday byte-identical, Assignment id-set + row-count + slot-set unchanged), (2) swapAssignments preserves BoardCard linkage (locks in the Phase 24-05 fix), (3) createCardForAssignment idempotent re-call leaves all four schedule tables byte-identical. Snapshots are scoped to seeded ids only so the suite is robust to concurrent test runs. Phase 24 alone: 3/3 pass. Phase 23 alone: 6/6 pass (no regression)."
  - criterion: "Phase 24 schedule-isolation invariant: every change in this plan touches BoardCard / FE state / regression test only — zero writes to Assignment / TeamMember / Absence / Holiday tables"
    verdict: "pass"
    evidence: "Task 5 grep walkthrough (commit 81df4f1): boardService.ts has zero prisma.(assignment|teamMember|absence|holiday).(create|update|upsert|delete*|update*) matches; assignmentService.ts has 8 matches, all in pre-Phase-24 functions (updateAssignment line 272, deleteAssignment 289, swapAssignments 316/317/319/338, addBacklogMember 409, toggleLock 425). Phase 24-05 additions to swapAssignments touch only prisma.boardCard. Runtime byte-equality test confirms the same invariant at execution time."
  - criterion: "artifact: frontend/src/routes/Board.tsx contains 'teamMember', 'userId', \"role === 'NORMAL'\""
    verdict: "pass"
    evidence: "grep verified — line 139 `card.assignment?.teamMember?.userId === user.id`; line 55 and 68 `role === 'NORMAL' ? 'mine' : 'all'`"
  - criterion: "artifact: frontend/src/features/board/types.ts contains 'userId'"
    verdict: "pass"
    evidence: "grep -n 'userId' frontend/src/features/board/types.ts → line 37 `userId: string | null`"
  - criterion: "artifact: backend/src/services/boardService.ts contains 'userId'"
    verdict: "pass"
    evidence: "grep -n 'userId: true' backend/src/services/boardService.ts → lines 56 and 77"
  - criterion: "artifact: backend/src/services/__tests__/scheduleIsolation.phase24.test.ts contains 'snapshotScheduleTables', 'swap', 'Phase 24'"
    verdict: "pass"
    evidence: "grep verified — `snapshotScheduleTables` defined at line ~38 and called in test 3; `swap` appears throughout (swapAssignments imported and called); `'Phase 24 schedule isolation'` is the describe block label"
  - criterion: "key link: FE filter relies on userId being present on the card.assignment.teamMember shape, which boardService include now provides"
    verdict: "pass"
    evidence: "Backend Prisma include at boardService.ts:53-58 emits `assignment.teamMember.userId`; FE consumes at Board.tsx:139 via `card.assignment?.teamMember?.userId`. Type bridge at frontend/src/features/board/types.ts:36-39 declares the matching shape. Both ends compile clean."
  - criterion: "key link: Phase 24 regression reuses the snapshotScheduleTables + seed pattern from Phase 23's runtime-byte-equality test"
    verdict: "pass"
    evidence: "scheduleIsolation.phase24.test.ts uses the same seedDataset / teardownDataset / beforeEach+afterEach + snapshotScheduleTables structure as Phase 23 (just with broader seed: 2 TeamMembers + 2 Assignments + 2 BoardCards for the swap path), and applies the same JSON.stringify byte-equality assertion. The only added helper is snapshotSwapInvariant which is a tightened projection for the swap path's row-permutation case."
  - criterion: "key link: Swap-orphan repair calls createCardForAssignment after the swap transaction commits — same pattern as the existing post-upsertAssignment call at assignmentService.ts:198-204"
    verdict: "partial"
    evidence: "Repair lives post-transaction in a try/catch — same pattern as the existing post-upsertAssignment call at lines 198-204. But the actual relink mechanism is `prisma.boardCard.update({ where: { id }, data: { assignmentId } })` for the existing-card case, with createCardForAssignment as fallback for legacy assignments with no card. createCardForAssignment alone is insufficient because its upsert key is assignmentId (unique) — when a card is orphaned, its assignmentId is NULL, so the upsert finds nothing and creates a NEW card (leaving the original orphaned card intact). Direct update by primary key is the correct relink. Plan acknowledged this nuance in passing (truth #5 says 'OR re-link the existing orphaned cards by querying for cards whose assignmentId was set to NULL during the swap')."
---

Phase 24 wave 3: fixed the Board "My Projects" filter bug (was comparing TeamMember.id to User.id), made the default filter role-aware (NORMAL → mine, PM/ADMIN → all), live-validated and repaired the swapAssignments orphan path on BoardCards, and added a Phase 24 schedule-isolation regression test plus a backend-file grep walkthrough that double-net the data-safety constraint.

## What Was Built

- Backend: widened the Prisma include in `boardService.listCards` and `getCard` so the assignment payload exposes `teamMember.userId` — pure read-only join expansion, no schedule writes.
- Frontend: `BoardCard.assignment` type gained the matching `teamMember?.userId` field; `Board.tsx` "My Projects" filter now compares `card.assignment?.teamMember?.userId === user.id` (was broken since Phase 22 because TeamMember.id and User.id are distinct). Default filter is now role-aware: NORMAL gets 'mine', PM/ADMIN gets 'all', with a useEffect that re-derives once useAuth() finishes loading (covers the brief loading-default-NORMAL window).
- Backend: live-validated the swap-orphan hypothesis against backend/dev.db with a one-shot tsx script — both seeded BoardCards had `assignmentId` set to NULL after `swapAssignments` (orphan REPRODUCED). Applied the fix in `swapAssignments`: capture pre-swap card linkages via findUnique, run the existing transaction unchanged, then post-transaction relink each card via `prisma.boardCard.update` (with `createCardForAssignment` as fallback for legacy assignments with no card). Repair runs outside the transaction in try/catch so a board failure cannot roll back the schedule write. Re-validation after the fix: orphan no longer reproduces.
- New test file `scheduleIsolation.phase24.test.ts` mirrors the byte-equality pattern from Phase 23 with three cases: (1) swap leaves the schedule swap-invariant unchanged, (2) swap preserves BoardCard linkage (locks in the repair), (3) createCardForAssignment idempotent re-call leaves all four schedule tables byte-identical. Snapshots scoped to seeded ids so the suite is robust to concurrent test runs. Passes 3/3 alone and concurrently with Phase 23. Phase 23 still passes 6/6 alone.
- Backend grep walkthrough (Task 5): boardService.ts has zero schedule-table writes; assignmentService.ts has 8 schedule writes, ALL in pre-Phase-24 functions. The Phase 24-05 additions to swapAssignments only touch `prisma.boardCard.*`. Static-grep + runtime byte-equality together double-net the data-safety constraint.

## Files Modified

- `backend/src/services/boardService.ts` -- modify: extend Prisma includes in listCards and getCard with `assignment: { include: { teamMember: { select: { userId: true } } } }`. Read-only.
- `backend/src/services/assignmentService.ts` -- modify: in swapAssignments, capture pre-swap BoardCards via findUnique, then post-transaction relink each via boardCard.update (or createCardForAssignment fallback). Repair wrapped in try/catch so board failure cannot roll back the schedule write.
- `backend/src/services/__tests__/scheduleIsolation.phase24.test.ts` -- create: new file with 3 test cases asserting swap and re-link preserve schedule data; snapshots scoped to seeded ids for concurrency robustness.
- `frontend/src/features/board/types.ts` -- modify: add optional `teamMember?: { userId: string | null } | null` field to the assignment shape on BoardCard.
- `frontend/src/routes/Board.tsx` -- modify: destructure role+isLoading from useAuth; initialize filterMode role-aware (`role === 'NORMAL' ? 'mine' : 'all'`); add useEffect to re-derive default once auth finishes loading; fix the broken "mine" filter comparison to use `assignment?.teamMember?.userId === user.id`.

## Deviations

- **DEVN-05 (Pre-existing):** Phase 23's `scheduleIsolation.phase23.test.ts` fails 4/6 when run CONCURRENTLY with the new Phase 24 isolation file (`npm test -- scheduleIsolation` runs both in parallel). This is caused by Phase 23's `snapshotScheduleTables` reading ALL rows from the dev DB (no id filter), so any concurrent test's seed/teardown contaminates the snapshot. Pre-existing test-design issue in Phase 23 — never visible before because Phase 24 is the second schedule-isolation file in the suite. Verified Phase 23 still passes 6/6 when run alone. Phase 24 passes 3/3 in both modes (its snapshots are scoped to seeded ids). Out of scope for plan 24-05 to refactor Phase 23's test design.

## Process Exception Reference

*See `.vbw-planning/phases/24-project-board-schedule-integration/remediation/qa/round-01/R01-PLAN.md` `<process_exception_rationale id="DEVN-05">` block (and the resulting `R01-SUMMARY.md`) for the formal `accepted-process-exception` classification of DEVN-05. Rationale: pre-existing Phase 23 test-design issue at `scheduleIsolation.phase23.test.ts:44-57` (unfiltered global findMany). Phase 24 isolation test passes 3/3 alone and concurrently. Out of scope for Phase 24 contract. The R01 rationale block records the alone-vs-concurrent run-mode evidence (Phase 23 alone 6/6, Phase 24 alone 3/3, Phase 24 concurrent 3/3) and the Phase 23 follow-up recommendation. The existing `deviations[]` and `pre_existing_issues[]` YAML entries above are preserved verbatim; this section is purely additive cross-referencing per the QA contract.*
