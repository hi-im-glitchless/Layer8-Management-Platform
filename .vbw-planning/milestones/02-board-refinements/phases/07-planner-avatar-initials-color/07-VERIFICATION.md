---
phase: 07
tier: deep
result: FAIL
passed: 15
failed: 1
total: 16
date: 2026-06-11
verified_at_commit: 874211526e75f43156df3dcee0e06e8b12d7a1c4
writer: write-verification.sh
plans_verified:
  - 07-01
---

## Must-Have Checks

| # | ID | Truth/Condition | Status | Evidence |
|---|-----|-----------------|--------|----------|
| 1 | DEVN-01 | DEVN-01 declared deviation: Task-1 commit (754c484) applied avatarBgColor inline style on AvatarFallback within the Task-1 boundary, even though the plan instructed Task-1 to stay focused on helpers and defer the full render rewire to Task 2. Recorded in both SUMMARY.md frontmatter deviations: array and body ## Deviations section. | FAIL | git diff 754c484^..754c484 shows AvatarFallback style={{ backgroundColor: avatarBgColor(a.teamMemberId), color: '#fff' }} added in Task-1 commit while <AvatarImage> and avatarUrl read still present — cross-task render rewire at Task-1 boundary. SUMMARY.md frontmatter deviations[] and body ## Deviations both document this as DEVN-01. |
| 2 | MH-01 | PLANNER-ONLY: entire product change lives in KanbanCard.tsx and its test; avatar.tsx, ScheduleGrid.tsx, constants.ts, types.ts, boardService.ts NOT touched; no backend/prisma changes | PASS | git show --stat for commits 754c484, 0fd4638, 8742115 shows only KanbanCard.tsx and KanbanCard.test.tsx modified. git log on avatar.tsx shows last change is initial app scaffold (f4040c8). ScheduleGrid.tsx/constants.ts last touched in earlier phase commits. No migration files newer than 20260514130000_project_entity. |
| 3 | MH-02 | TWO-INITIAL MONOGRAM: pentesterInitials() present in KanbanCard.tsx; parses first+last token; single initial for mononyms; '?' fallback for empty/whitespace-only; never throws | PASS | KanbanCard.tsx lines 55-62: pentesterInitials() splits displayName fallback chain on /\s+/, returns single char for mononyms, (first+last).toUpperCase() for multi-token, '?' for empty. Test (b) asserts 'Ana Sousa'->'AS'; (b2) mononym->'A'; (b3) whitespace-only->'?'. 9/9 green. |
| 4 | MH-03 | ACCOUNT-DERIVED DETERMINISTIC COLOUR: avatarBgColor(teamMemberId) present; pure *31+charCodeAt hash; indexes AVATAR_PALETTE; no Date/Math.random; stable across renders; rename-proof | PASS | KanbanCard.tsx lines 82-88: hash = (hash * 31 + id.charCodeAt(i)) >>> 0; return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]. No external state. Test (b4) renders same id twice in separate render calls and asserts identical backgroundColor. |
| 5 | MH-04 | LEGIBLE FIXED PALETTE: AVATAR_PALETTE is 12 mid-saturation hexes defined locally in KanbanCard.tsx; constants.ts NOT imported or modified | PASS | KanbanCard.tsx lines 71-74: AVATAR_PALETTE const with 12 entries as const. grep for 'import.*constants' in KanbanCard.tsx returns only a comment reference. No pale/pastel entries present. |
| 6 | MH-05 | NO PHOTO ON BOARD: no avatarUrl read in render block; no <AvatarImage>; AvatarImage import removed; no new no-unused-vars | PASS | grep 'AvatarImage' in KanbanCard.tsx returns only a comment (line 187). grep 'avatarUrl' returns only comments (lines 187, 220). Import line (line 4) has Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount only. Test (a) asserts queryAllByRole('img') length 0 even when avatarUrl set in fixture. |
| 7 | MH-06 | COLOUR APPLIED AT CALLSITE: inline style on AvatarFallback at KanbanCard callsite; avatar.tsx NOT edited | PASS | KanbanCard.tsx line 190: style={{ backgroundColor: avatarBgColor(a.teamMemberId), color: '#fff' }} on AvatarFallback. git log on avatar.tsx shows last change is f4040c8 (initial scaffold) — not touched in this phase. |
| 8 | MH-07 | PHASE-4 BEHAVIOUR PRESERVED: uniquePentesters dedupe, AvatarGroup, cap-3 + AvatarGroupCount '+N' overflow, name on Avatar title; pentesterName/uniquePentesters unchanged | PASS | KanbanCard.tsx: uniquePentesters (line 34), pentesters.slice(0,3) (line 184), AvatarGroupCount>+{pentesters.length-3} (line 197), title={name&#124;&#124;undefined} (line 189). Tests (c) dedupe, (d) empty-state, (e) cap-3+'+2' overflow all pass. |
| 9 | MH-08 | MEMO COMPARATOR correct: fingerprint simplified to a.teamMemberId on both sides; still re-renders on pentester set change; typechecks | PASS | KanbanCard.tsx lines 222-224: prev.card.assignments.map((a) => a.teamMemberId).join() === next.card.assignments.map((a) => a.teamMemberId).join(). avatarUrl not in comparator. Memo re-render test (Phase-05 describe block) still passes 9/9. tsc -b exit 0. |
| 10 | MH-09 | tsc -b green; vitest 9/9 pass; no migration; no schedule-table writes; no backend change | PASS | npx tsc -b from frontend/ exits 0 (no output). npx vitest run KanbanCard.test.tsx: 9 passed. git log on backend/prisma/migrations shows no new migration since 20260514130000_project_entity. No backend files in phase commits. |

## Artifact Checks

| # | ID | Artifact | Exists | Contains | Status |
|---|-----|----------|--------|----------|--------|
| 1 | ART-01 | Artifact: frontend/src/features/board/components/KanbanCard.tsx exists and contains 'avatarBgColor' | Yes | avatarBgColor | PASS |
| 2 | ART-02 | Artifact: frontend/src/features/board/components/__tests__/KanbanCard.test.tsx exists and contains 'AS' monogram assertion | Yes | AS | PASS |

## Key Link Checks

| # | ID | From | To | Via | Status |
|---|-----|------|-----|-----|--------|
| 1 | KL-01 | KanbanCard.tsx avatarBgColor callsite on AvatarFallback | KanbanCard.tsx module-local AVATAR_PALETTE + *31 hash | hash of stable teamMemberId indexes fixed palette for deterministic account-tied colour | PASS |
| 2 | KL-02 | KanbanCard.tsx pentesterInitials() | KanbanCard.tsx AvatarFallback children | parsed first+last initial (or single initial for mononyms) rendered as monogram text | PASS |
| 3 | KL-03 | frontend/src/features/board/components/__tests__/KanbanCard.test.tsx | frontend/src/features/board/components/KanbanCard.tsx | imports KanbanCard and renders BoardCard fixtures exercising all required assertion paths | PASS |
| 4 | KL-04 | frontend/src/features/board/components/KanbanCard.tsx | frontend/src/components/ui/avatar.tsx | imports Avatar/AvatarFallback/AvatarGroup/AvatarGroupCount; AvatarImage removed; avatar.tsx not modified | PASS |

## Summary

**Tier:** deep
**Result:** FAIL
**Passed:** 15/16
**Failed:** DEVN-01
