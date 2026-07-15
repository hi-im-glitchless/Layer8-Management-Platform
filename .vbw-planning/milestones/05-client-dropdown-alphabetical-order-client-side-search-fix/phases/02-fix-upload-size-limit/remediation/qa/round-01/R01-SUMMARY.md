---
phase: 2
round: 1
title: Fix stale DeleteCardDialog expected-text assertion
type: remediation
status: complete
completed: 2026-07-08
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - 226cab8db73035806245697c67dbef6b971c7f60
files_modified:
  - frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx
deviations:
  - "none"
known_issue_outcomes:
  - '{"test":"DeleteCardDialog.test.tsx (unnamed shows destructive delete warning test)","file":"frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx:46","error":"TestingLibraryElementError: Unable to find element with text matching /permanently deletes the card and all attached.../i - actual rendered text is This permanently deletes the card, the project, and all its linked schedule assignments (for all pentesters), along with all attached comments, notes, and files. Text/copy drifted from what the test expects. Predates Phase 2 (component/test last touched in commits 41e08eb/687a82c/195840b, none of which are part of this phases b764f97/4a48358/735a581/b6cc33c, and DeleteCardDialog.tsx/test.tsx are not in files_modified for 02-01).","disposition":"resolved","rationale":"Updated the stale expected-text assertion to a stable substring matching the current DeleteCardDialog fallback copy; the assertion now matches the rendered text and the DeleteCardDialog suite passes 3/3 with a clean tsc build. Component copy was not changed."}'
---

Resolved the one tracked known issue by updating the stale destructive-warning assertion in the DeleteCardDialog test to match the current dialog copy; suite now passes 3/3 and tsc is clean.

## Task 1: Update stale destructive-warning assertion in DeleteCardDialog test

### What Was Built
- Replaced the stale matcher `/permanently deletes the card and all attached comments/i` at line 46 with the stable substring matcher `/permanently deletes the card, the project/i`, which matches the current `AlertDialogDescription` fallback copy (rendered when `assignmentCount` is omitted).
- Left the `/cannot be undone/i` and project-name assertions unchanged; did not modify `DeleteCardDialog.tsx` component copy.

### Files Modified
- `frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx` -- edit: updated the destructive-warning expected-text assertion to a stable substring of the current dialog copy.

### Known Issue Outcomes
- `DeleteCardDialog.test.tsx (unnamed shows destructive delete warning test)` (`frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx:46`) — `resolved`: assertion now matches the current rendered copy; `npx vitest run src/features/board/components/__tests__/DeleteCardDialog.test.tsx` passes 3/3 and `npx tsc -b --noEmit` is clean.

### Deviations
None
