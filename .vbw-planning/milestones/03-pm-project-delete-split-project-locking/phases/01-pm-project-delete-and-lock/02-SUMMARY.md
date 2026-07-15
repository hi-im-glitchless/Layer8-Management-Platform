---
phase: 1
plan: "02"
title: Split-Cell Lock Toggle + Assignment Modal Lock Control
status: complete
completed: 2026-06-23
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - 210cfb6
  - e6db49f
  - 93e03ec
  - 986040d
deviations:
  - "DEVN-01: added `group` class to the SplitCell wrapper div so the hover-visible lock button's `group-hover:opacity-60` resolves (mirrors the non-split branch, which already sits on a `group` element). Minimal, in-scope."
  - "DEVN-01: corrected the `Assignment` type import path in both new test files from `../types` to `../../types` (the `__tests__/` dir is one level deeper); caught by tsc and folded into the test commits before finalizing."
pre_existing_issues:
  - "{\"test\": \"eslint react-hooks/set-state-in-effect\", \"file\": \"frontend/src/features/schedule/components/AssignmentModal.tsx:199\", \"error\": \"Avoid calling setState() directly within an effect — pre-existing in the open-reset useEffect (authored 2026-03-18, commit 6d0b71ff); not in any line I changed.\"}"
  - "{\"test\": \"eslint prefer-const\", \"file\": \"frontend/src/features/schedule/components/ColorPalette.tsx:31-33\", \"error\": \"'r'/'g'/'b' are never reassigned, use const — pre-existing in hexToHsl (authored 2026-03-25, commit 16b0c336); unrelated to the added disabled prop.\"}"
ac_results:
  - criterion: "SplitCell exposes a clickable lock/unlock affordance that calls onLockToggle, mirroring the non-split cell (single isLocked boolean, no backend change)"
    verdict: pass
    evidence: "210cfb6; AssignmentCell.split-lock.test.tsx case (a)"
  - criterion: "onLockToggle is threaded from the AssignmentCell exported component into SplitCell (previously silently dropped)"
    verdict: pass
    evidence: "210cfb6; grep onLockToggle in SplitCell props + invocation (line 456)"
  - criterion: "Split-cell lock affordance follows the three (canEdit,isLocked) cases"
    verdict: pass
    evidence: "210cfb6; AssignmentCell.split-lock.test.tsx cases (a)(b)(c)"
  - criterion: "The lock button onClick calls e.stopPropagation() so onCellClick does not fire"
    verdict: pass
    evidence: "210cfb6; AssignmentCell.split-lock.test.tsx case (d)"
  - criterion: "AssignmentModal shows a lock/unlock toggle (footer, near Delete) driven by assignment.isLocked from the prop; clicking calls useToggleLock().mutate(assignment.id)"
    verdict: pass
    evidence: "e6db49f; AssignmentModal.lock.test.tsx case (3)"
  - criterion: "While locked, all editable fields + Save + Delete are disabled, but the lock-toggle button stays enabled"
    verdict: pass
    evidence: "e6db49f; AssignmentModal.lock.test.tsx case (1)"
  - criterion: "Existing backend lock/edit/delete guards and NORMAL-role access unchanged (frontend-only)"
    verdict: pass
    evidence: "git diff HEAD~4..HEAD touches only frontend/src/features/schedule (+ ColorPalette); no backend files"
---

Surfaced a clickable lock toggle on split assignment cells and added a lock/unlock control with locked-field disabling to the assignment-edit modal, frontend-only, against the already-complete PM lock backend.

## What Was Built

- SplitCell now threads `onLockToggle` (previously dropped) and renders the three-case clickable lock pattern from the non-split branch: visible-clickable when `canEdit && isLocked`, hover-visible-clickable when `canEdit && !isLocked`, static icon when `!canEdit && isLocked`; the lock button stops propagation so the cell `onCellClick` does not fire.
- AssignmentModal imports `useToggleLock`, derives `isLocked` from `assignment.isLocked` (server-authoritative), disables every editable field plus Save and Delete while locked, and renders a footer Lock/Unlock toggle that itself stays enabled so the user can unlock.
- `ColorPalette` and the modal-local `ClientSelect`/`TagSelector` gained a forwarded `disabled` prop (no behavior change when false/undefined).
- Two vitest suites (7 tests) covering split-cell lock visibility/callback/stopPropagation and modal locked/unlocked disabling, toggle label, and mutate-with-id.

## Files Modified

- `frontend/src/features/schedule/components/AssignmentCell.tsx` -- edit: thread `onLockToggle` into SplitCell, replace static lock icon with three-case clickable pattern, add `group` to SplitCell wrapper.
- `frontend/src/features/schedule/components/AssignmentModal.tsx` -- edit: add lock toggle, derive `isLocked`, disable fields/Save/Delete while locked, add `disabled` to local ClientSelect/TagSelector.
- `frontend/src/features/schedule/components/ColorPalette.tsx` -- edit: add optional `disabled` prop forwarded to swatch + custom-toggle controls.
- `frontend/src/features/schedule/components/__tests__/AssignmentCell.split-lock.test.tsx` -- add: split-cell lock visibility + callback + stopPropagation tests.
- `frontend/src/features/schedule/components/__tests__/AssignmentModal.lock.test.tsx` -- add: modal lock-state disabling + toggle label + mutate tests.

## Deviations

- DEVN-01 (minor): added `group` to the SplitCell wrapper so the hover-visible lock button's `group-hover` utility resolves, matching the non-split cell. In-scope, no behavior change beyond the intended hover reveal.
- DEVN-01 (minor): fixed the `Assignment` type import path in the two new test files (`../types` -> `../../types`) flagged by tsc; folded into the respective test commits.
- DEVN-05 (pre-existing): two ESLint errors in unmodified code (`AssignmentModal.tsx:199` set-state-in-effect; `ColorPalette.tsx:31-33` prefer-const) confirmed via git blame to predate this plan (March 2026). Not fixed — out of scope. See `pre_existing_issues`.
