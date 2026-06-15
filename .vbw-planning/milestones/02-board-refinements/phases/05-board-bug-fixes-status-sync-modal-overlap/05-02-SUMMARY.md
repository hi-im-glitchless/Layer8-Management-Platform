---
phase: 5
plan: "02"
title: Card detail modal — stop close ✕ / pin icon overlap
status: complete
completed: 2026-06-03
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 191fa6eb6c4016cf3d46b379d0d0536529b4bdab
deviations: []
pre_existing_issues:
  - '{"test": "eslint src/features/board/components/CardDetailModal.tsx", "file": "frontend/src/features/board/components/CardDetailModal.tsx:91", "error": "react-hooks/purity — Cannot call impure function (Date.now()/new Date()) during render in editability check. Pre-existing on HEAD, unrelated to the title-row padding change."}'
  - '{"test": "eslint src/features/board/components/CardDetailModal.tsx", "file": "frontend/src/features/board/components/CardDetailModal.tsx:404", "error": "react-hooks/refs — Cannot update ref (markReadRef.current) during render. Pre-existing on HEAD, unrelated to the title-row padding change."}'
ac_results:
  - criterion: "DialogTitle row reserves right padding so the pin icon clears the shadcn close ✕ (absolute right-4 top-4)"
    verdict: "pass"
    evidence: "191fa6e — CardDetailModal.tsx:487 className now 'flex items-center gap-2 pr-8' (32px right padding > 16px ✕ inset)"
  - criterion: "Both the close ✕ and the pin button remain fully visible and clickable; the project-name span still truncates/flexes as before"
    verdict: "pass"
    evidence: "pr-8 only adds right padding to the flex row; the flex-1 name span and the pin button onClick/Tooltip are unchanged (CardDetailModal.tsx:488-505)"
  - criterion: "Only CardDetailModal.tsx is changed — shared dialog.tsx untouched; AssignmentModal and other dialogs unaffected"
    verdict: "pass"
    evidence: "git diff for 191fa6e shows 1 file changed, +1/-1; dialog.tsx not in the diff"
  - criterion: "No change to Phase-4 card layout, modal content, or behavior beyond the title-row padding"
    verdict: "pass"
    evidence: "single-line className edit; color accent bar, header, content, and pin behavior unchanged"
  - criterion: "artifact CardDetailModal.tsx provides DialogTitle with right padding clearing the close button (contains pr-8)"
    verdict: "pass"
    evidence: "CardDetailModal.tsx:487 contains 'pr-8'"
---

Fixed Bug 2 by adding `pr-8` to the card detail modal's `DialogTitle` flex row so the "manually placed" pin button clears the shadcn close ✕ button instead of overlapping it in the top-right corner.

## What Was Built

- Added `pr-8` (32px right padding) to the `DialogTitle` className in `CardDetailModal.tsx` (line 487), pushing the rightmost flex child (the pin button) clear of the absolutely-positioned close ✕ at `right-4` (16px). Both icons now stay visible and clickable; the pin simply shifts left of the ✕.
- Verified the shared `dialog.tsx` primitive and other dialogs (e.g. AssignmentModal) are untouched, so only the board card detail modal is affected.

## Files Modified

- `frontend/src/features/board/components/CardDetailModal.tsx` -- edit: appended `pr-8` to the `DialogTitle` className so the pin icon clears the close ✕.

## Deviations

None.
