---
phase: 9
round: 1
title: Full-delete orphaned project/card when last pentester assignment removed
type: remediation
status: complete
completed: 2026-06-12
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - 8900677
  - 97765c9
files_modified:
  - backend/src/services/assignmentService.ts
  - backend/src/routes/schedule.ts
  - backend/src/services/__tests__/deleteAssignmentOrphan.delete.test.ts
deviations: []
known_issue_outcomes:
  - '{"test":"rateLimit.test.ts (tsc TS2835 relative import extension)","file":"backend/src/middleware/__tests__/rateLimit.test.ts","error":"Relative import paths need explicit file extensions in ECMAScript imports when --moduleResolution is nodenext","disposition":"accepted-process-exception","rationale":"Pre-existing tsc error in an unmodified file, unrelated to this change; out of scope for the UAT fix"}'
---

UAT R01: orphaned project cards are now hard-deleted (Project + cascaded BoardCard/comments/files) instead of parked in 'stopped' when the last pentester assignment is removed.

## Task 1: Full-delete orphaned Project in deleteAssignment

### What Was Built
- `deleteAssignment` now hard-deletes the orphaned `Project` (via `prisma.project.delete`) when the post-delete assignment count over `OR:[{projectId},{splitProjectId}]` is exactly 0, replacing the prior `BoardCard.stage='stopped'` action
- The Project delete cascades the whole board subtree: `Project -> BoardCard -> {BoardComment, BoardFile, BoardNotification}`, plus the card's `checklist`/`notes` columns (verified `onDelete: Cascade` chain in schema.prisma)
- Preserved invariants: multi-pentester safety (zero-count-only over both halves), split-cell independence (dedupe ids, skip nulls), backlog/null no-op, and the best-effort try/catch so the schedule delete still returns 200 even if the board step throws
- Updated the `schedule.ts` DELETE route comment to reflect delete semantics; `emitScheduleInvalidate`/`emitBoardInvalidate('cards')` broadcast left intact

### Files Modified
- `backend/src/services/assignmentService.ts` -- edit: replace stage='stopped' with guarded Project delete on zero remaining assignments
- `backend/src/routes/schedule.ts` -- edit: update broadcast rationale comment (no behavior change; broadcast kept)

### Known Issue Outcomes
- `rateLimit.test.ts (tsc TS2835)` (`backend/src/middleware/__tests__/rateLimit.test.ts`) — `accepted-process-exception`: pre-existing tsc error in an unmodified file, unrelated to this change

### Deviations
None

## Task 2: Update orphan regression suite to assert delete semantics

### What Was Built
- Renamed `deleteAssignmentOrphan.stopped.test.ts` -> `deleteAssignmentOrphan.delete.test.ts`
- (a) zero-remaining: asserts the Project + BoardCard are deleted and seeded `BoardComment`/`BoardFile` rows cascade away (gone from DB), not moved to 'stopped'
- (c) split-cell: the A half (zero remaining) is deleted while the B half (still referenced) is untouched
- (b) multi-pentester untouched, (d) backlog/null no-op, (e) cardless project non-fatal — all preserved and green

### Files Modified
- `backend/src/services/__tests__/deleteAssignmentOrphan.delete.test.ts` -- rewrite (renamed from .stopped.test.ts): assert full delete + cascade instead of stage='stopped'

### Known Issue Outcomes
- `rateLimit.test.ts (tsc TS2835)` (`backend/src/middleware/__tests__/rateLimit.test.ts`) — `accepted-process-exception`: pre-existing, unrelated to this change

### Deviations
None

## Notes
The PostToolUse commit-format hook emitted a false-positive warning on both commits ("does not match {type}({scope}): {desc}"); the hook only inspected the truncated first token. Both messages do conform (`fix(schedule): ...`, `test(schedule): ...`) and both commits landed.

Cascade chain verified directly in `backend/prisma/schema.prisma`: `BoardCard.projectId` -> Project is `onDelete: Cascade`; `BoardComment.cardId`, `BoardFile.cardId`, `BoardNotification.cardId` -> BoardCard are all `onDelete: Cascade`; checklist/notes are columns on BoardCard. Every inbound `Assignment.projectId`/`splitProjectId` FK is `onDelete: SetNull`, so the Project delete can never be blocked by an FK constraint. No explicit pre-delete of children was needed.

Schedule isolation holds: the only writes are board-domain rows (Project + cascaded board children); no Assignment/TeamMember/Absence/Holiday writes. No schema change — `git diff backend/prisma/` is empty; no `prisma migrate`/`db push` was run.

Quality gates: `deleteAssignmentOrphan.delete.test.ts` 5/5, `boardAutoMove.stopped.test.ts` 2/2, `scheduleIsolation.phase23/phase24` 8/8 — all green. `tsc --noEmit` clean on all changed files.
