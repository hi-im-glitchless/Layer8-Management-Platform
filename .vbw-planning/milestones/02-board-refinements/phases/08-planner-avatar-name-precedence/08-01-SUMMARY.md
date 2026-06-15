---
phase: 8
plan: "01"
title: Flip planner avatar name precedence to prefer user.displayName over TeamMember alias
status: complete
completed: 2026-06-11
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - 22e738e
  - 233a98c
deviations: []
pre_existing_issues: []
ac_results:
  - criterion: "Both pentesterName() and pentesterInitials() resolve tm?.user?.displayName FIRST, then tm?.displayName (alias), then tm?.user?.username, then the fallback ('' / '?')"
    verdict: pass
    evidence: "grep -c 'tm?.user?.displayName || tm?.displayName' KanbanCard.tsx returns 2 (both helpers); commit 22e738e"
  - criterion: "Linked member alias 'Rui' + user.displayName 'Rui Marques' renders 'RM' (two initials) with a 'Rui Marques' hover/title, NOT 'R'/'Rui'"
    verdict: pass
    evidence: "test (b1): avatarTitles == ['Rui Marques'], title='Rui' is null, findByText('RM') present, queryByText('R') null"
  - criterion: "Backlog member (user null) with alias 'Futuro 1' still resolves the name to 'Futuro 1' — unchanged from Phase 07"
    verdict: pass
    evidence: "test (b1b): avatarTitles == ['Futuro 1'], monogram 'F1' (unchanged two-token splitter); test (b1c): mononym alias 'Futuro' -> 'F'"
  - criterion: "All Phase-07 behaviour preserved: deterministic colour by teamMemberId, no <img>/photo, dedupe by teamMemberId, cap-3 '+N', mononym -> single initial, blank -> '?'"
    verdict: pass
    evidence: "avatarBgColor/AVATAR_PALETTE/uniquePentesters/render loop/memo comparator byte-unchanged; tests (a)(b)(b2)(b3)(b4)(c)(d)(e) all green"
  - criterion: "Only KanbanCard.tsx + its co-located test change; ScheduleGrid.tsx, avatar.tsx, constants.ts, boardService.ts, backend/prisma untouched; no migration"
    verdict: pass
    evidence: "git status shows only KanbanCard.tsx (Task 1) + KanbanCard.test.tsx (Task 2); forbidden-file guard reported NONE TOUCHED; no prisma commands run"
  - criterion: "Accepted DEVN-05 ESLint finding (react-refresh on findCardById) NOT re-opened; no new lint error introduced"
    verdict: pass
    evidence: "findCardById untouched; eslint on both changed files exit 0 (no errors)"
  - criterion: "tsc -b green and the KanbanCard Vitest suite passes"
    verdict: pass
    evidence: "npx tsc -b exit 0; npx vitest run KanbanCard.test.tsx -> 12/12 tests pass"
---

Planner/board card avatars now derive their name (and two-initial monogram + hover) from the linked account's full `user.displayName` instead of the editable TeamMember alias, fixing the production single-initial bug; backlog members with no linked user still fall through to the alias, and all Phase-07 behaviour is unchanged.

## What Was Built

- Flipped the name-resolution chain in BOTH `pentesterName()` and `pentesterInitials()` from `tm?.displayName || tm?.user?.displayName || tm?.user?.username` to `tm?.user?.displayName || tm?.displayName || tm?.user?.username` (fallback `''` / `'?'`). A real member whose alias holds only a first name ("Rui") while `user.displayName` is the full "Rui Marques" now renders "RM" with a "Rui Marques" hover; backlog members (no `tm.user`) correctly fall through to the alias ("Futuro 1"). Updated both helper doc-comments to record the Phase-08 precedence rationale.
- Left everything else byte-for-byte unchanged: the whitespace split + first/last-initial logic, the `'?'`/single-initial/mononym branches, `AVATAR_PALETTE`, the `teamMemberId` colour hash (`avatarBgColor`), `uniquePentesters` dedupe, the no-`<img>` render loop, the cap-3 "+N" overflow, and the memo comparator. `findCardById` and its accepted DEVN-05 react-refresh comment were not touched.
- Extended the test helper with an optional `alias` override so the TeamMember alias can diverge from the linked `user.displayName`, then added regression cases: (b1) alias "Rui" vs `user.displayName` "Rui Marques" -> "RM" + "Rui Marques" hover; (b1b) backlog "Futuro 1" (no user) still resolves the alias and renders the unchanged two-token "F1"; (b1c) backlog mononym alias "Futuro" -> single "F". All retained Phase-07 cases (one-avatar-per-pentester/no-img, two-initial monogram, mononym/username single initial, whitespace "?", deterministic colour, dedupe, zero-assignment no-group, cap-3 "+N") and the memo re-render case stay green — 12/12.

## Files Modified

- `frontend/src/features/board/components/KanbanCard.tsx` -- edit: flip the name-resolution precedence in `pentesterName()` and `pentesterInitials()` so `user.displayName` wins over the TeamMember alias; refresh the two helper doc-comments. (commit 22e738e)
- `frontend/src/features/board/components/__tests__/KanbanCard.test.tsx` -- edit: add optional `alias` override to `makeAssignment`; add alias-shadow (b1) + backlog (b1b/b1c) regression cases; keep all Phase-07 assertions. (commit 233a98c)

## Deviations

None
