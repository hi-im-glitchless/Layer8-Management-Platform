---
phase: 10
plan: "01"
title: Planner card client name — bold + client colour (with light-colour legibility guard)
status: complete
completed: 2026-06-15
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - c53f6c0
  - ac24a11
deviations: []
pre_existing_issues: []
ac_results:
  - criterion: "FRONTEND-ONLY: only KanbanCard.tsx + its test touched; no backend/Prisma/API change"
    verdict: "pass"
    evidence: "git diff HEAD~2 HEAD shows only the 2 frontend files; git diff backend/ is 0 bytes"
  - criterion: "SCOPE = CARD PREVIEW ONLY: CardDetailModal/schedule/avatar.tsx untouched"
    verdict: "pass"
    evidence: "name-only diff grep for schema.prisma/migrations/CardDetailModal/features-schedule/avatar/boardService returns none"
  - criterion: "SCHEDULE ISOLATION: local luminance helper, no import from features/schedule/**"
    verdict: "pass"
    evidence: "grep 'features/schedule' KanbanCard.tsx exits 1; resolveClientNameColor is module-local"
  - criterion: "BOLD + CLIENT COLOUR: Row-2 <p> bold + inline style color, text-muted-foreground dropped"
    verdict: "pass"
    evidence: "KanbanCard.tsx Row-2 <p> font-bold + style={{ color: resolveClientNameColor(...) }}; test (1) asserts font-bold + rgb(51,102,255)"
  - criterion: "LEGIBILITY GUARD: luminance (0.299r+0.587g+0.114b)/255, >0.7 -> dark fallback; asserted"
    verdict: "pass"
    evidence: "resolveClientNameColor helper; test (2) #FFFACD -> rgb(26,26,26) not the pale hex"
  - criterion: "GRACEFUL FALLBACK: missing/empty client.color renders name safely, no crash"
    verdict: "pass"
    evidence: "helper returns #1a1a1a for null/empty/unparseable; test (3) empty colour -> rgb(26,26,26), name renders"
  - criterion: "MEMO COMPARATOR: client?.color guard added so a colour edit re-renders"
    verdict: "pass"
    evidence: "comparator line prev.card.project.client?.color === next.card.project.client?.color in KanbanCard.tsx"
  - criterion: "GREEN SUITE: vitest KanbanCard + tsc --noEmit pass"
    verdict: "pass"
    evidence: "15/15 tests pass (12 existing incl. 'Acme Corp' + 3 new); tsc --noEmit exit 0"
---

Planner Kanban card preview now renders the client name bold in the client's own colour, with a local luminance guard that falls back to a readable dark colour for pale/missing hexes — frontend-only, two files, both tasks committed and green.

## What Was Built

- A module-local pure helper `resolveClientNameColor(hex)` in `KanbanCard.tsx` that computes relative luminance `(0.299*r + 0.587*g + 0.114*b)/255` and returns the client's own hex for mid/dark colours, or the readable dark fallback `#1a1a1a` when the hex is missing/empty/unparseable or its luminance exceeds the documented `> 0.7` light threshold. No schedule import — the formula is duplicated locally.
- Row-2 client-name `<p>` restyled to `text-xs font-bold leading-tight` with `style={{ color: resolveClientNameColor(card.project.client.color) }}`, dropping `text-muted-foreground` on the coloured path; the existing `client?.name &&` guard is preserved.
- Memo comparator extended with `prev.card.project.client?.color === next.card.project.client?.color` so a live client-colour edit re-renders the card.
- Three new tests: (1) mid/dark hex -> bold + `rgb(51, 102, 255)`; (2) pale `#FFFACD` -> dark fallback `rgb(26, 26, 26)`, not the pale hex; (3) empty colour -> safe render with the dark default.

## Files Modified

- `frontend/src/features/board/components/KanbanCard.tsx` -- edit: add local luminance helper, restyle Row-2 client-name `<p>` (bold + client colour with legibility guard), extend memo comparator with client.color guard.
- `frontend/src/features/board/components/__tests__/KanbanCard.test.tsx` -- edit: add `clientNameEl` helper + a Phase-10 describe block with bold+colour, light-colour fallback, and missing-colour safety assertions.

## Deviations

None

## Notes

- DEVN-05: the pre-existing accepted KanbanCard ESLint finding (react-refresh/only-export-components on `findCardById`) was left untouched, as instructed; only the new lines were added.
- The PostToolUse Bash commit-format hook emitted a false-positive warning on the Task-1 commit: it parsed a wrapped body line ("...uted-foreground") instead of the subject. The actual subject `feat(board): bold client name in client colour on planner cards` is correctly formatted; commit c53f6c0 succeeded.
- The frontend KanbanCard suite was run in isolation and was fully green (15/15); no broader-suite run was performed in this plan, so no pre-existing failures were observed to report.
