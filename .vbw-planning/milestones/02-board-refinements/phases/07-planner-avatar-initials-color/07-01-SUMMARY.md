---
phase: 7
plan: "01"
title: Planner Card Avatars — Initials & Account Colour
status: complete
completed: 2026-06-11
tasks_completed: 3
tasks_total: 3
commit_hashes:
  - 754c484
  - 0fd4638
  - 8742115
deviations:
  - "DEVN-01 (minor, inline, not escalated): Task-1 boundary kept tsc green by applying the avatarBgColor inline style on AvatarFallback within the Task-1 commit (the plan permitted either inlining the rename at the callsite or keeping the change self-consistent). Without consuming avatarBgColor, TS strict noUnusedLocals failed it as a declared-but-unused symbol. Task 2 then dropped the AvatarImage/avatarUrl photo branch + import and simplified the memo comparator as planned. No scope change."
pre_existing_issues: []
ac_results:
  - criterion: "PLANNER-ONLY: entire product change in KanbanCard.tsx + its test; avatar.tsx and ScheduleGrid.tsx NOT touched"
    verdict: pass
    evidence: "git status shows only KanbanCard.tsx + KanbanCard.test.tsx changed; avatar.tsx/ScheduleGrid.tsx/constants.ts/types.ts/boardService.ts/prisma all clean (commits 754c484,0fd4638,8742115)"
  - criterion: "TWO-INITIAL MONOGRAM: first+last initial uppercased; mononym -> single; missing/empty -> '?', never throws"
    verdict: pass
    evidence: "pentesterInitials() in KanbanCard.tsx; tests (b) 'Ana Sousa'->'AS', (b2) mononym->'A', (b3) whitespace-only->'?'"
  - criterion: "ACCOUNT-DERIVED DETERMINISTIC COLOUR: avatarBgColor(teamMemberId) pure *31 hash indexing AVATAR_PALETTE; stable across renders; rename never changes it"
    verdict: pass
    evidence: "avatarBgColor() hashes id.charCodeAt (no Date/Math.random); test (b4) same id -> same backgroundColor across separate renders"
  - criterion: "LEGIBLE FIXED PALETTE: ~12 mid-saturation hexes defined locally; pale/pastel excluded; constants.ts not imported"
    verdict: pass
    evidence: "module-local AVATAR_PALETTE (12 entries) in KanbanCard.tsx; no import of schedule/constants.ts"
  - criterion: "NO PHOTO ON BOARD: no avatarUrl read, no <AvatarImage>; AvatarImage import removed; no new no-unused-vars"
    verdict: pass
    evidence: "AvatarImage/avatarUrl only appear in comments; import line trimmed; eslint exit 0; test (a) queryAllByRole('img') length 0"
  - criterion: "COLOUR APPLIED AT CALLSITE via inline style on AvatarFallback (avatar.tsx not edited)"
    verdict: pass
    evidence: "style={{ backgroundColor: avatarBgColor(a.teamMemberId), color: '#fff' }} on AvatarFallback in KanbanCard.tsx"
  - criterion: "PHASE-4 BEHAVIOUR PRESERVED: uniquePentesters dedupe, AvatarGroup, cap-3 + '+N' overflow, name on Avatar title; pentesterName/uniquePentesters unchanged"
    verdict: pass
    evidence: "uniquePentesters(card.assignments), slice(0,3), AvatarGroupCount +{pentesters.length-3}, title={name||undefined} all present; tests (c)(d)(e) green"
  - criterion: "memo areEqual comparator stays correct and typechecks"
    verdict: pass
    evidence: "fingerprint simplified to a.teamMemberId on both sides; memo re-render test green; tsc -b exit 0"
  - criterion: "Test suite updated and GREEN: two-initial, mononym, deterministic colour, no <img>; dedupe/empty/overflow preserved"
    verdict: pass
    evidence: "9/9 tests pass via npx vitest run KanbanCard.test.tsx"
  - criterion: "tsc -b green, vitest passes, LSP clean; no migration; no schedule-table writes; no backend change"
    verdict: pass
    evidence: "tsc -b exit 0; 9/9 vitest; no backend/prisma changes in git status"
---

Board (Kanban) card pentester avatars now render a two-initial monogram on a deterministic account-derived background colour, dropping the uploaded photo; the Schedule view and shared avatar primitive are untouched.

## What Was Built

- `pentesterInitials()` helper: first-initial + last-initial monogram (uppercased), single initial for mononyms/usernames, `?` fallback for missing/whitespace-only names — parsed from the `displayName || user.displayName || user.username` chain by whitespace split.
- Module-local `AVATAR_PALETTE` (12 mid-saturation, white-text-legible hexes; pale pastels excluded) + pure deterministic `avatarBgColor(teamMemberId)` `*31`/charCodeAt hash, keyed on the stable cuid so a rename never changes the colour.
- Rewired the avatar render loop: dropped the `avatarUrl` read and `<AvatarImage>` photo branch (no `<img>` on board cards), removed the now-unused `AvatarImage` import, applied the colour inline via `style` on `AvatarFallback` at the callsite (shared `avatar.tsx` untouched), and simplified the memo comparator fingerprint to `teamMemberId`.
- Preserved Phase-4 behaviour: `uniquePentesters()` dedupe, `AvatarGroup`, cap-at-3 with `AvatarGroupCount` "+N" overflow, and the name on the `Avatar` title for a11y.
- Updated the Vitest suite (9 tests pass): two-initial monogram, mononym single initial, `?` fallback, deterministic per-account colour, absence of any `<img>`, plus the retained dedupe/empty-state/overflow and memo re-render cases.

## Files Modified

- `frontend/src/features/board/components/KanbanCard.tsx` -- edit: replace single-char initial with two-initial monogram + add `AVATAR_PALETTE`/`avatarBgColor`; drop photo branch + `AvatarImage` import; inline colour on `AvatarFallback`; simplify memo fingerprint.
- `frontend/src/features/board/components/__tests__/KanbanCard.test.tsx` -- edit: assert monogram, mononym, `?` fallback, deterministic colour, and no `<img>`; remove avatar-image assertions; keep dedupe/empty/overflow/memo tests.

## Deviations

DEVN-01 (minor, inline): The Task-1 commit applied the `avatarBgColor` inline style on `AvatarFallback` so the file kept `tsc -b` green at the task boundary (TS strict `noUnusedLocals` would otherwise reject the unused helper). The plan explicitly allowed keeping the Task-1 change self-consistent; the photo-branch removal, import trim, and memo simplification still landed in Task 2 as planned. No scope change. No pre-existing failures encountered.
