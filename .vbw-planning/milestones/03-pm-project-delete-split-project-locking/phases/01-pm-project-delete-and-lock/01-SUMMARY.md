---
phase: 1
plan: "01"
title: PM Board Card Delete + Audit Trail + Confirmation Dialog
status: complete
completed: 2026-06-22
tasks_completed: 5
tasks_total: 5
commit_hashes:
  - a884a3b
  - 195840b
  - fdcf527
  - d9f1af6
  - 41e08eb
deviations:
  - none
pre_existing_issues: []
ac_results:
  - criterion: "DELETE /api/board/cards/:id is gated by requireRole('PM') so PM and ADMIN pass, NORMAL gets 403 (server authoritative, RBAC hierarchy NORMAL<PM<ADMIN)"
    verdict: pass
    evidence: "backend/src/routes/board.ts:229 requireRole('PM') (commit a884a3b); NORMAL<PM<ADMIN hierarchy in middleware/auth.ts"
  - criterion: "Every successful board card delete writes a board.card.delete entry to the audit trail via logAuditEvent with cardId, projectName, and the acting user id"
    verdict: pass
    evidence: "board.ts logAuditEvent action 'board.card.delete' details {cardId, projectName, userId} (a884a3b); asserted in boardCardDelete.pm.test.ts (d9f1af6)"
  - criterion: "A confirmation AlertDialog is shown before the destructive delete; Cancel aborts with no mutation, Confirm calls useDeleteCard().mutate(cardId)"
    verdict: pass
    evidence: "DeleteCardDialog.tsx AlertDialog (195840b); cancel/confirm asserted in DeleteCardDialog.test.tsx (41e08eb)"
  - criterion: "The PM-gated delete affordance renders in CardDetailModal for PM and ADMIN roles, and does not render for NORMAL role"
    verdict: pass
    evidence: "CardDetailModal.tsx Delete button + DeleteCardDialog guarded by canDelete (role ADMIN||PM) (fdcf527)"
  - criterion: "Deleting a board card cascades to its comments/files/notifications but leaves the linked Project row and any referencing Assignment untouched (no schedule data loss)"
    verdict: pass
    evidence: "boardCardDelete.pm.test.ts asserts cascade + Project/Assignment survival (d9f1af6); schema FKs card→project SetNull/Cascade"
  - criterion: "NORMAL-role access is unchanged; no other board route guards are altered"
    verdict: pass
    evidence: "git diff a884a3b: only DELETE /cards/:id guard + import + extractIp changed; canArchive stays ADMIN-only (board.ts, CardDetailModal.tsx:487)"
  - criterion: "artifact backend/src/routes/board.ts contains requireRole('PM')"
    verdict: pass
    evidence: "board.ts:229 (a884a3b)"
  - criterion: "artifact backend/src/routes/board.ts contains board.card.delete"
    verdict: pass
    evidence: "board.ts:245 (a884a3b)"
  - criterion: "artifact frontend/src/features/board/components/DeleteCardDialog.tsx contains AlertDialog"
    verdict: pass
    evidence: "DeleteCardDialog.tsx (195840b)"
  - criterion: "artifact frontend/src/features/board/components/CardDetailModal.tsx contains DeleteCardDialog"
    verdict: pass
    evidence: "CardDetailModal.tsx:42 import + :701 render (fdcf527)"
  - criterion: "artifact backend/src/services/__tests__/boardCardDelete.pm.test.ts contains board.card.delete"
    verdict: pass
    evidence: "boardCardDelete.pm.test.ts (d9f1af6); 1 test passing"
  - criterion: "artifact frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx contains useDeleteCard"
    verdict: pass
    evidence: "DeleteCardDialog.test.tsx vi.mock('../../hooks') useDeleteCard (41e08eb); 3 tests passing"
  - criterion: "key_link CardDetailModal Delete button -> DeleteCardDialog via deleteOpen state + setDeleteOpen(true)"
    verdict: pass
    evidence: "CardDetailModal.tsx deleteOpen useState + Delete button onClick setDeleteOpen(true) (fdcf527)"
  - criterion: "key_link DeleteCardDialog confirm -> useDeleteCard via deleteCard.mutate(cardId)"
    verdict: pass
    evidence: "DeleteCardDialog.tsx handleConfirm deleteCard.mutate(cardId) (195840b)"
  - criterion: "key_link DELETE handler -> logAuditEvent via board.card.delete action with cardId/projectName/userId"
    verdict: pass
    evidence: "board.ts delete handler logAuditEvent call (a884a3b)"
---

PM-role users can now hard-delete a board card behind an AlertDialog confirmation, with every delete written to the hash-chained audit trail; the linked project and schedule assignments are preserved.

## What Was Built

- Opened DELETE /api/board/cards/:id from `requireRole('ADMIN')` to `requireRole('PM')`; PM and ADMIN pass, NORMAL still 403.
- Added audit logging on delete: pre-fetch the card (404 before any destructive write if absent), then write a `board.card.delete` entry via `logAuditEvent` with `{cardId, projectName, userId}` (extractIp pattern mirrored from boardAdmin.ts). Preserved `emitBoardInvalidate('cards')` and P2025→404 handling.
- New `DeleteCardDialog` AlertDialog component (mirrors ArchiveCardDialog): permanent-delete warning, project name in title, Confirm calls `useDeleteCard().mutate(cardId)`, Cancel aborts, Confirm disabled while pending. No native confirm().
- Wired a PM-gated destructive "Delete card" button + `DeleteCardDialog` into CardDetailModal (guarded by existing `canDelete`); ADMIN sees Archive + Delete, PM sees only Delete, NORMAL sees neither. `canArchive` remains ADMIN-only. onDeleted closes the modal.
- Backend test: cascade to comments/files/notifications, Project + Assignment survival, and `board.card.delete` audit entry (1 test passing, scoped seeding + afterEach teardown).
- Frontend test: DeleteCardDialog render / cancel / confirm via mocked `useDeleteCard` (3 tests passing).

## Files Modified

- `backend/src/routes/board.ts` -- modified: delete route guard ADMIN→PM, extractIp helper, logAuditEvent import + board.card.delete audit call.
- `frontend/src/features/board/components/DeleteCardDialog.tsx` -- created: AlertDialog hard-delete confirmation component.
- `frontend/src/features/board/components/CardDetailModal.tsx` -- modified: deleteOpen state, Trash2 + DeleteCardDialog imports, PM-gated Delete button + dialog render.
- `backend/src/services/__tests__/boardCardDelete.pm.test.ts` -- created: cascade/survival/audit test.
- `frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx` -- created: render/cancel/confirm test.

## Deviations

None.
