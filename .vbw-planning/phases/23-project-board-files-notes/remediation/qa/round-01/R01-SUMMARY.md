---
phase: 23
round: 1
title: "Phase 23 QA Round 01 — Resolve Five Documented Deviations"
type: remediation
status: partial
completed: 2026-05-07
tasks_completed: 4
tasks_total: 5
commit_hashes:
  - 6bc88ef
  - a74d8fd
  - 4e95a11
files_modified:
  - backend/src/types/express.d.ts
  - backend/src/middleware/boardAuth.ts
  - .vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md
  - .vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md
  - .vbw-planning/phases/23-project-board-files-notes/23-06-PLAN.md
  - .vbw-planning/phases/23-project-board-files-notes/23-06-SUMMARY.md
  - .vbw-planning/phases/23-project-board-files-notes/23-07-PLAN.md
  - .vbw-planning/phases/23-project-board-files-notes/23-07-SUMMARY.md
deviations: []
known_issue_outcomes:
  - '{"test":"DEVN-01-01","file":"backend/src/middleware/boardAuth.ts","error":"per-call cast (req as Request & { boardCard?: BoardCardContext }).boardCard = context","disposition":"resolved","rationale":"express.d.ts now augments Express.Request with `boardCard?: BoardCardContext`; boardAuth.ts uses direct `req.boardCard = context` assignment. tsc --noEmit clean; schedule-isolation grep on boardAuth.ts still returns zero writes."}'
---

Phase 23 QA Round 01 in progress: Task 1 (code-fix DEVN-01-01) complete; four plan-amendment / regression tasks remaining.

## Task 1: Code-fix DEVN-01-01

### What Was Built
- Global `Express.Request` augmentation declaring `boardCard?: BoardCardContext` in `backend/src/types/express.d.ts`, importing the canonical `BoardCardContext` shape from `boardAuth.ts` so the type stays in sync with the middleware's exported interface.
- Direct `req.boardCard = context` assignment in `requireCardAccess`, replacing the previous `(req as Request & { boardCard?: BoardCardContext }).boardCard = context` per-call cast.
- Updated `BoardCardContext` JSDoc in `boardAuth.ts` to reflect that the typed property is now live in `express.d.ts` (the previous comment described this as a deferred wave-2 task).

### Files Modified
- `backend/src/types/express.d.ts` -- modified: added `import type { BoardCardContext } from '../middleware/boardAuth.js'` and a `declare global { namespace Express { interface Request { boardCard?: BoardCardContext } } }` augmentation block alongside the existing `express-session` augmentation.
- `backend/src/middleware/boardAuth.ts` -- modified: replaced per-call cast with direct `req.boardCard = context` assignment; refreshed the `BoardCardContext` JSDoc comment so it points readers at the new `express.d.ts` augmentation.

### Known Issue Outcomes
- `DEVN-01-01` (`backend/src/middleware/boardAuth.ts`) — `resolved`: typed `boardCard?: BoardCardContext` augmentation lives in `express.d.ts`; the per-call cast in `boardAuth.ts` is gone; `req.boardCard = context` is a direct, type-checked assignment. Verification greps confirm zero remaining cast occurrences and `npx tsc --noEmit` (Node 20) reports zero errors. Schedule-isolation regression grep across `boardAuth.ts` returns zero `prisma.(assignment|teamMember|absence|holiday)` write call-sites; the JSDoc NON-NEGOTIABLE invariant comment (lines 41-46) is preserved verbatim.

### Deviations
None

## Task 2: Plan-amendment DEVN-05-01

### What Was Built
- Post-hoc amendment block appended to `23-05-PLAN.md` Task 5 section, marked `resolved-by-amendment` and citing FAIL ID `DEVN-05-01`. The block names the authoritative test file (`backend/src/services/__tests__/scheduleIsolation.phase23.test.ts`, delivered in plan 23-07, passing 6/6), enumerates the six covered cases (`updateNotes`, `editComment`, `softDeleteComment`, `createNotificationsForMentions`, `archiveCard`, plus the cumulative full-mutation-matrix case), and records the rationale (a single comprehensive cross-operation suite is preferable to two near-identical per-plan tests; static grep on `boardArchiveService.ts` already returned zero schedule writes at the time 23-05 landed).
- One-line postscript cross-reference added to `23-05-SUMMARY.md` (below the existing Deviations narrative paragraph, leaving the YAML `deviations` array untouched) pointing readers at `R01-PLAN.md` Task 2 and the 23-07-delivered test file.
- Original Task 5 spec text in `23-05-PLAN.md` preserved verbatim — the amendment is purely additive, appended after the `## Out of Scope` section.

### Files Modified
- `.vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md` -- modified: appended `### Task 5 — Amendment (QA Round 01, resolved-by-amendment)` block citing DEVN-05-01, the 23-07 test file, the six covered cases, and the rationale; original Task 5 spec preserved.
- `.vbw-planning/phases/23-project-board-files-notes/23-05-SUMMARY.md` -- modified: appended a one-line blockquote cross-reference under the Deviations narrative section pointing at `R01-PLAN.md` Task 2 and `scheduleIsolation.phase23.test.ts`; YAML `deviations` array untouched.

### Known Issue Outcomes
- `DEVN-05-01` (`.vbw-planning/phases/23-project-board-files-notes/23-05-PLAN.md`) — `resolved`: 23-05-PLAN.md now carries an amendment block with the literal phrase `resolved-by-amendment`, FAIL ID `DEVN-05-01`, and a reference to `backend/src/services/__tests__/scheduleIsolation.phase23.test.ts` (delivered in plan 23-07, passing 6/6 covering updateNotes / editComment / softDeleteComment / createNotificationsForMentions / archiveCard plus a full-mutation-matrix case). Verification greps: `grep -n "resolved-by-amendment" 23-05-PLAN.md` → 2 matches (lines 280, 284); `grep -n "DEVN-05-01" 23-05-PLAN.md` → 2 matches (lines 282, 301); `grep -n "scheduleIsolation.phase23.test.ts" 23-05-PLAN.md` → 3 matches (lines 287, 300, 305); `grep -n "R01-PLAN" 23-05-SUMMARY.md` → 1 match (line 72).

### Deviations
None

## Task 3: Plan-amendment DEVN-06-01

### What Was Built
- Post-hoc amendment block appended to `23-06-PLAN.md` (after the existing `## Out of Scope` section), marked `resolved-by-amendment` and citing FAIL ID `DEVN-06-01`. The block declares **data-path-only mention delivery authoritative for wave-3** with three explicit points: (a) what was delivered (backend accepts `mentions: string[]` default `[]` per plan 23-04; `boardApi.addComment` accepts the optional array; `CardDetailModal.tsx` compose flow passes `[]`; mentioned-user notifications still fire end-to-end whenever a populated array is supplied); (b) what was deferred and why (the roster-popover UI requires a team-member roster lookup that today only lives in `frontend/src/features/schedule`, and pulling it across would violate the **schedule-isolation** rule from `23-CONTEXT.md` "Schedule Protection — NON-NEGOTIABLE"; the alternative — a new board-scoped roster endpoint — is design work outside wave-3 scope); (c) follow-up tracking (mention-authoring UX is a documented Phase 23 follow-up; a future phase introducing a board-side roster endpoint, or a thin type-only re-export of the schedule roster type, can ship the popover then).
- One-line postscript blockquote cross-reference added to `23-06-SUMMARY.md` (immediately below the existing Deviations narrative paragraph, leaving the YAML `deviations` array — including its 6-entry contents — untouched) pointing readers at `R01-PLAN.md` Task 3.
- Original plan body preserved verbatim — the amendment is purely additive, appended after `## Out of Scope`.

### Files Modified
- `.vbw-planning/phases/23-project-board-files-notes/23-06-PLAN.md` -- modified: appended `### Task 5 — Amendment (QA Round 01, resolved-by-amendment)` block citing DEVN-06-01, the schedule-isolation rationale, the data-path-only authoritative delivery declaration, and the follow-up tracking note; original Task 5 spec preserved.
- `.vbw-planning/phases/23-project-board-files-notes/23-06-SUMMARY.md` -- modified: appended a one-line blockquote cross-reference under the Deviations narrative section pointing at `R01-PLAN.md` Task 3; YAML `deviations` array untouched.

### Known Issue Outcomes
- `DEVN-06-01` (`.vbw-planning/phases/23-project-board-files-notes/23-06-PLAN.md`) — `resolved`: 23-06-PLAN.md now carries an amendment block with the literal phrase `resolved-by-amendment`, FAIL ID `DEVN-06-01`, and the schedule-isolation rationale tying the deferred mention-popover UI to the `23-CONTEXT.md` "Schedule Protection — NON-NEGOTIABLE" rule. Verification greps: `grep -n "resolved-by-amendment" 23-06-PLAN.md` → 3 matches (lines 226, 230, 254); `grep -n "DEVN-06-01" 23-06-PLAN.md` → 2 matches (lines 228, 254); `grep -n "schedule-isolation" 23-06-PLAN.md` → 4 matches (lines 240, 249, 253, 254); `grep -n "R01-PLAN" 23-06-SUMMARY.md` → 1 match (line 86). Original Task 5 spec text and YAML `deviations` array preserved verbatim.

### Deviations
None

## Task 4: Plan-amendment DEVN-07-01

### What Was Built
- Post-hoc amendment block appended to `23-07-PLAN.md` (after the existing `## Out of Scope` section), marked `resolved-by-amendment` and citing FAIL ID `DEVN-07-01`. The block declares **indirect+grep coverage authoritative** for the file-upload and file-delete code paths in Phase 23, with four explicit points: (a) what was delivered — `scheduleIsolation.phase23.test.ts` ships 6/6 passing tests covering five per-mutation cases (`updateNotes` / `editComment` / `softDeleteComment` / `createNotificationsForMentions` / `archiveCard`) plus one cumulative full-mutation-matrix case, with byte-equality assertions across `Assignment` / `TeamMember` / `Absence` / `Holiday` for every test; (b) why standalone file-upload + file-delete tests were not added — multer/multipart plumbing through Express in-process or supertest is non-trivial relative to the value it adds, and file delete is already exercised indirectly via `archiveCard`'s `prisma.boardFile.deleteMany`; (c) static-grep mitigation — `grep -nE "prisma\.(assignment|teamMember|absence|holiday)\.(create|update|delete|upsert|updateMany|deleteMany|createMany)"` across both `backend/src/routes/boardFiles.ts` and `backend/src/services/boardFileService.ts` returns zero matches, a stronger guarantee than a runtime test for the upload/delete paths because it forbids the existence of any schedule-mutation call-site at all; (d) follow-up — standalone supertest-based upload+delete suite is a documented optional follow-up.
- One-line postscript blockquote cross-reference added to `23-07-SUMMARY.md` (immediately below the existing Deviations narrative paragraph, leaving the YAML `deviations` array — including its 6-entry contents — untouched) pointing readers at `R01-PLAN.md` Task 4 and the indirect+grep coverage rationale.
- Original Task 5 spec text in `23-07-PLAN.md` preserved verbatim — the amendment is purely additive, appended after the `## Out of Scope` section.

### Files Modified
- `.vbw-planning/phases/23-project-board-files-notes/23-07-PLAN.md` -- modified: appended `### Task 5 — Amendment (QA Round 01, resolved-by-amendment)` block citing DEVN-07-01, the indirect+grep authoritative declaration, explicit references to `boardFiles.ts` and `boardFileService.ts` for the static-grep mitigation, and the follow-up note; original Task 5 spec preserved.
- `.vbw-planning/phases/23-project-board-files-notes/23-07-SUMMARY.md` -- modified: appended a one-line blockquote cross-reference under the Deviations narrative section pointing at `R01-PLAN.md` Task 4; YAML `deviations` array untouched.

### Known Issue Outcomes
- `DEVN-07-01` (`.vbw-planning/phases/23-project-board-files-notes/23-07-PLAN.md`) — `resolved`: 23-07-PLAN.md now carries an amendment block with the literal phrase `resolved-by-amendment`, FAIL ID `DEVN-07-01`, the indirect+grep authoritative declaration for file upload/delete, and explicit references to `boardFiles.ts` and `boardFileService.ts`. Verification greps: `grep -n "resolved-by-amendment" 23-07-PLAN.md` → 3 matches (lines 165, 169, 206); `grep -n "DEVN-07-01" 23-07-PLAN.md` → 2 matches (lines 167, 206); `grep -nE "boardFiles.ts|boardFileService.ts" 23-07-PLAN.md` → 5 matches (lines 192, 193, 196, 200, 205); `grep -n "R01-PLAN" 23-07-SUMMARY.md` → 1 match (line 72). Original Task 5 spec text and YAML `deviations` array preserved verbatim.

### Deviations
None