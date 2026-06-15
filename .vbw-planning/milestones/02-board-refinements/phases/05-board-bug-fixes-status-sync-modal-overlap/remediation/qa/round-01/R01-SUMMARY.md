---
phase: 5
round: 1
title: Fix react-hooks purity & refs lint violations in CardDetailModal
type: remediation
status: complete
completed: 2026-06-04
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 544ad47d9e1b6ce8b72df52b1712d88b9b567004
files_modified:
  - frontend/src/features/board/components/CardDetailModal.tsx
deviations: []
known_issue_outcomes:
  - '{"test":"eslint src/features/board/components/CardDetailModal.tsx","file":"frontend/src/features/board/components/CardDetailModal.tsx:404","error":"react-hooks/refs — Cannot update ref (markReadRef.current) during render. Pre-existing on HEAD, unrelated to the title-row padding change.","disposition":"resolved","rationale":"Moved markReadRef.current = markReadMutate out of the render body into a dedicated useEffect([markReadMutate]); the mark-read effect still fires markReadRef.current({ cardId }) keyed on [open, cardId] with the if (open && cardId) guard, preserving once-per-open-transition behavior. ESLint no longer reports react-hooks/refs on the file."}'
  - '{"test":"eslint src/features/board/components/CardDetailModal.tsx","file":"frontend/src/features/board/components/CardDetailModal.tsx:91","error":"react-hooks/purity — Cannot call impure function (Date.now()/new Date()) during render in editability check. Pre-existing on HEAD, unrelated to the title-row padding change.","disposition":"resolved","rationale":"Removed the render-time Date.now() call; the affordance gate now uses the pure isAuthor && !comment.isDeleted check, and the 10-minute EDIT_WINDOW_MS is enforced against the live clock at interaction time via isWithinEditWindow() in handleStartEdit/handleSave. Same edit-window semantics preserved; formatRelative untouched. ESLint no longer reports react-hooks/purity on the file."}'
---

Resolved both carried react-hooks ESLint violations in CardDetailModal.tsx as pure lint-correctness fixes; comment edit-window and mark-read-on-open behavior preserved, and `npx eslint` on the file is now clean (0 problems).

## Task 1: Fix purity (line ~91) and refs (line ~404) violations in CardDetailModal.tsx

### What Was Built
- react-hooks/refs: `markReadRef.current = markReadMutate` moved out of the render body into a dedicated `useEffect(() => { markReadRef.current = markReadMutate }, [markReadMutate])`; the firing effect remains keyed on `[open, cardId]` with the `if (open && cardId)` guard, so mark-read still fires exactly once per open transition.
- react-hooks/purity: removed the render-time `Date.now()` clock read; the edit affordance is gated on the pure `isAuthor && !comment.isDeleted` check, and the 10-minute `EDIT_WINDOW_MS` is enforced at interaction time via a new `isWithinEditWindow()` helper called inside `handleStartEdit` and `handleSave`. `formatRelative` (~line 59) left untouched.
- Verified: `npx eslint src/features/board/components/CardDetailModal.tsx` → 0 problems (neither react-hooks/purity nor react-hooks/refs fires); `npx tsc -b` green; `npx vite build` green; no CardDetailModal-specific tests exist. Phase-5 Bug-2 title-row `pr-8` padding intact.

### Files Modified
- `frontend/src/features/board/components/CardDetailModal.tsx` -- edit: move ref assignment into a useEffect and lift the edit-window clock read out of render into interaction-time handlers.

### Known Issue Outcomes
- `eslint src/features/board/components/CardDetailModal.tsx` (`frontend/src/features/board/components/CardDetailModal.tsx:404`) — `resolved`: ref assignment moved into a useEffect; effect fires keyed on [open, cardId] with guard, once-per-open preserved; rule no longer fires.
- `eslint src/features/board/components/CardDetailModal.tsx` (`frontend/src/features/board/components/CardDetailModal.tsx:91`) — `resolved`: render-time Date.now() removed; EDIT_WINDOW_MS enforced at interaction time; rule no longer fires.

### Deviations
None
