---
phase: 23
round: 1
plan: R01
title: "Phase 23 UAT R01 — CardDetailModal Detail-Query Wiring + File Mutation Cache-Key Alignment"
type: uat-remediation
status: complete
completed: 2026-05-07
tasks_completed: 2
tasks_total: 2
commit_hashes: ["0fdec0e"]
files_modified:
  - frontend/src/features/board/components/CardDetailModal.tsx
  - frontend/src/routes/Board.tsx
  - frontend/src/features/board/hooks.ts
  - .vbw-planning/phases/23-project-board-files-notes/remediation/uat/round-01/R01-SUMMARY.md
deviations: []
---

## What Was Built

UAT major defect P03-T1 fix: the CardDetailModal now sources its card data from the detail endpoint (`useBoardCard`) instead of the list query. Files, comments, and notes — which the list endpoint omits — now render correctly. File-mutation cache keys are aligned with the modal's read key so uploads and deletes refresh the modal without manual reload. Backend untouched.

### Task 1 — Switch CardDetailModal to fetch via useBoardCard, update Props and parent wiring

#### What Was Built

- `CardDetailModal` `Props` changed from `card: BoardCard | null` to `cardId: string | null`.
- Added `useBoardCard` import; component now calls `const { data: card } = useBoardCard(cardId ?? '')` internally. The hook's `enabled: !!id` guard keeps the query inert when no card is selected.
- `markRead` effect re-gated on `cardId` (not `card?.id`) so it fires immediately on open without waiting for the detail fetch.
- Early return updated to `if (!cardId || !card) return null` so the modal stays empty until the detail query resolves.
- All references to `card.files`, `card.comments`, `card.notes`, `card.checklist`, `card.assignment`, `card.archivedAt`, `card.id`, `card.notesUpdatedAt`, `card.notesUpdatedBy`, `card.stageLockedBy` left untouched — they now read from the detail-endpoint payload, which DOES include files/comments/notes.
- Removed unused `BoardCard` type import (kept `BoardComment`, still used by `CommentRow`/`CommentSection`). `noUnusedLocals` is on, so this was required.
- `Board.tsx`: removed the `selectedCard` `useMemo` block; the `<CardDetailModal>` mount now passes `cardId={selectedCardId}` directly. `findCardById` import retained — still used by the `activeCard` overlay memo.

#### Files Modified

- frontend/src/features/board/components/CardDetailModal.tsx
- frontend/src/routes/Board.tsx

#### Deviations

None.

### Task 2 — Align useUploadFile and useDeleteFile cache invalidation with the detail query key

#### What Was Built

- `useUploadFile.onSuccess` now invalidates `['board', 'cards', cardId]` (the modal's read key) AND retains `['board', 'files', cardId]` as a secondary safety net for the public `useBoardFiles` hook.
- `useDeleteFile.onSuccess` updated identically.
- Pattern now matches the existing `useAddComment` / `useDeleteComment` mutations, which already invalidate both the comments key and the cards key.
- No other hooks touched (signatures, exports, error handlers all unchanged).

#### Files Modified

- frontend/src/features/board/hooks.ts

#### Deviations

None.

## Files Modified

- frontend/src/features/board/components/CardDetailModal.tsx
- frontend/src/routes/Board.tsx
- frontend/src/features/board/hooks.ts
- .vbw-planning/phases/23-project-board-files-notes/remediation/uat/round-01/R01-SUMMARY.md

## Verification

- `cd frontend && npx tsc --noEmit` — clean exit 0, zero errors.
- All Task 1 grep gates pass: `useBoardCard` appears as one import + one call site in `CardDetailModal.tsx`; `card={selectedCard}` returns zero matches in `Board.tsx`; `cardId={selectedCardId}` returns one match; only `selectedCardId` references remain.
- All Task 2 grep gates pass: `['board', 'cards', cardId]` matches >=4 (9 actual: useAddComment, useDeleteComment, useUploadFile, useDeleteFile + 5 other hooks); `['board', 'files', cardId]` matches >=3 (3 actual: useBoardFiles + retained safety nets in useUploadFile/useDeleteFile).
- `git diff --stat backend/` returns zero — backend is byte-identical (success_criteria: "No backend code is modified").

## Pre-existing Issues

ESLint surfaced 3 pre-existing errors in files this round touched, but none were introduced by R01. Per DEVN-05 they are out of scope; the plan's `<verify>` only requires `tsc --noEmit` (which passes), not `eslint`. Logged here for visibility:

- `frontend/src/features/board/components/CardDetailModal.tsx:89` — `react-hooks/purity` — `Date.now()` called during render inside `CommentRow.inWindow` derivation. Predates this round; `CommentRow` was not part of Task 1's scope.
- `frontend/src/features/board/components/CardDetailModal.tsx:257` — `react-hooks/refs` — `markReadRef.current = markReadMutate` assigned during render. The ref-assignment line itself was unchanged by Task 1; only the dependent `useEffect` gate moved from `card?.id` to `cardId`.
- `frontend/src/routes/Board.tsx:33` — `@typescript-eslint/no-unused-vars` — `hasRole` destructured from `useAuth` but never used. Pre-existing in `Board()`'s opening line, untouched by Task 1.
