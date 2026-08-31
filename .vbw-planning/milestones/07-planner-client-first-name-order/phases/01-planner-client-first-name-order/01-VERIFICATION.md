---
phase: 01
tier: DEEP
result: PASS
passed: 31
failed: 0
total: 32
date: 2026-08-31
verified_at_commit: af619c43ad2b2f30d8908c5f42d6ad7c422b4353
writer: write-verification.sh
plans_verified:
  - 01-01
---

## Must-Have Checks

| # | ID | Truth/Condition | Status | Evidence |
|---|-----|-----------------|--------|----------|
| 1 | MH1 | KanbanCard row 1 renders CLIENT with text-lg font-semibold leading-tight line-clamp-2; row 2 renders PROJECT with text-sm font-bold leading-tight | PASS | KanbanCard.tsx:164-171 (read directly): row-1 <p> has exactly these 4 classes wrapping the chained-OR headline; row-2 <p> has text-sm font-bold leading-tight wrapping card.project.name. Test (1) in 'client-first name order' asserts both class sets and DOM order. |
| 2 | MH2 | Headline is chained-OR card.project.client?.name &#124;&#124; card.project.name &#124;&#124; '(No project)'; no new '(No client)' placeholder | PASS | grep -n "card.project.client?.name &#124;&#124; card.project.name" KanbanCard.tsx returns exactly 1 match (line 166); grep -i "No client" across the 4 changed files returns no match. |
| 3 | MH3 | When client name is falsy, row-2 project line is NOT rendered - project name appears exactly once, never blank first line | PASS | Code: row-2 <p> guarded by card.project.client?.name (KanbanCard.tsx:174). Test (2) asserts getAllByText('Acme Pentest') has length 1 and carries text-lg+font-semibold. Verified by direct code read, not test-only. |
| 4 | MH4 | Pin stays in same div.flex.items-start.justify-between.gap-1 wrapper as headline <p>; stageLockedBy condition unchanged | PASS | KanbanCard.tsx:163-170: Pin is sibling of headline <p> inside the same wrapper div, condition card.stageLockedBy && card.stageLockedBy !== 'auto' byte-identical to pre-change. Tests (3)/(4) confirm row carries justify-between+items-start and contains an svg, with and without a client. |
| 5 | MH5 | Client name carries no inline colour, not muted; Phase-10 rationale comment moves with it to row 1 | PASS | KanbanCard.tsx:156-163 comment carries the Phase-10 legibility rationale, now attached to row 1. Headline <p> has no style prop. 3 tests assert el.style.color === '' (grep -c returns 3); test (1) also asserts not.toContain('text-muted-foreground'). |
| 6 | MH6 | memo comparator (KanbanCard.tsx L223-241 pre-change) byte-for-byte unchanged | PASS | git diff f2c8d86..HEAD -- KanbanCard.tsx piped through grep -iE 'prev.&#124;next.' returns EMPTY - zero lines in the comparator changed. Independently re-derived, not trusted from SUMMARY. |
| 7 | MH7 | CardDetailModal DialogTitle is project.client?.name &#124;&#124; project.name &#124;&#124; '(No project)'; project-name line follows inside DialogHeader, guarded on client | PASS | CardDetailModal.tsx:507 (title span) and :525-533 (guarded p inside DialogHeader, still before DialogHeader close). grep for the chained-OR in DialogTitle returns exactly 1 match. |
| 8 | MH8 | Duplicate client span in meta row REMOVED; row guard collapses to project.tags.length > 0; tag span markup unchanged | PASS | grep for the old className=font-medium client.name span returns no match (exit 1). Line 552 reads project.tags.length > 0 &&. Tag span block (lines 553-559) diff-identical to pre-change. |
| 9 | MH9 | 3 tests in KanbanCard client name styling keep style.color=== verbatim; only weight changes font-bold->font-semibold; test(1) keeps not.toContain text-muted-foreground | PASS | Diff review of the 3 cases: only className assertion string changed per case (font-bold -> font-semibold); style.color assertion line untouched in all 3; not.toContain assertion untouched in case (1). |
| 10 | MH10 | CardDetailModal.test.tsx gains header-order coverage incl. clientless fallback (previously zero DialogTitle assertions) | PASS | describe('CardDetailModal client-first header name order') added with 2 new cases; ran the file - 7/7 pass (5 pre-existing untouched + 2 new). |
| 11 | MH11 | No file outside the 4 in files_modified changed; AssignmentCell.tsx/exportHtml.ts/dashboard ProjectCard.tsx untouched; no backend changes | PASS | git diff --name-only f2c8d86..HEAD lists exactly the 4 planner files. git diff over AssignmentCell.tsx, exportHtml.ts, dashboard ProjectCard.tsx returns 0 lines. No backend/ paths in the diff. |
| 12 | MH12 | Pre-existing accepted ESLint finding DEVN-05 on KanbanCard.tsx NOT fixed, NOT suppressed, NOT treated as a regression | PASS | No eslint-disable comment anywhere in the diff. npx eslint src/features/board exits 0. Root cause independently established: the findCardById non-component export that originally triggered DEVN-05 (per project memory) is no longer present in the file at all (only export const KanbanCard remains) - the file was refactored since Phase 22, unrelated to this diff, so this is a pre-existing non-reproduction, not something this phase fixed. |

## Artifact Checks

| # | ID | Artifact | Exists | Contains | Status |
|---|-----|----------|--------|----------|--------|
| 1 | ART1 | frontend/src/features/board/components/KanbanCard.tsx | Yes | card.project.client?.name &#124;&#124; card.project.name | PASS |
| 2 | ART2 | frontend/src/features/board/components/CardDetailModal.tsx | Yes | project.client?.name &#124;&#124; project.name | PASS |
| 3 | ART3 | frontend/src/features/board/components/__tests__/KanbanCard.test.tsx | Yes | client-first name order | PASS |
| 4 | ART4 | frontend/src/features/board/components/__tests__/CardDetailModal.test.tsx | Yes | client-first header name order | PASS |

## Key Link Checks

| # | ID | From | To | Via | Status |
|---|-----|------|-----|-----|--------|
| 1 | KL1 | KanbanCard.tsx | KanbanCard.test.tsx | client name is the headline (font-semibold, style.color empty) and precedes the project name (font-bold) | PASS |
| 2 | KL2 | CardDetailModal.tsx | CardDetailModal.test.tsx | DialogTitle holds client name; project name follows in DialogHeader; clientless falls back to project name | PASS |

## Other Checks

| # | ID | Check | Status | Evidence |
|---|-----|-------|--------|----------|
| 1 | OTH1 | Full frontend suite re-run independently (not trusted from SUMMARY) | PASS | npx vitest run (frontend/): 98/98 tests passed across 15 files. Matches SUMMARY claim, independently reproduced. |
| 2 | OTH2 | Typecheck re-run independently | PASS | npx tsc -b: no output, exit 0, no errors. |
| 3 | OTH3 | Lint re-run independently; no new findings in the 4 phase files | PASS | npm run lint: 59 problems (45 errors,14 warnings), all in files outside this phase (Profile.tsx, TemplateAdapter.tsx, AssignmentModal.tsx, ColorPalette.tsx, ScheduleGrid.tsx, ExecutiveReport.tsx, Board.tsx). Only routes/Board.tsx mentions 'board' in lint output (pre-existing, untouched by this phase, a warning not error). Zero findings in KanbanCard.tsx or CardDetailModal.tsx. |
| 4 | OTH4 | KanbanCard.test.tsx targeted run: exact test count 16->20 | PASS | npx vitest run on the file alone reports 20 tests passed; diff shows 4 new cases added, 0 removed. |
| 5 | OTH5 | CardDetailModal.test.tsx targeted run: exact test count 5->7 | PASS | npx vitest run on the file alone reports 7 tests passed; diff shows 2 new cases added, 0 removed. |
| 6 | OTH6 | Commit count and format: exactly 4 commits, one per task, type(board): description | PASS | git log f2c8d86..HEAD --oneline: cbcdcb2 feat(board), 82b135a test(board), 3e1cb23 feat(board), af619c4 test(board) - matches plan's task-type mapping (tasks 1/3 feat, tasks 2/4 test). |
| 7 | OTH7 | Clientless fallback verified at the CODE level (not only via tests) for KanbanCard | PASS | Direct read of KanbanCard.tsx:164-174 confirms: headline uses chained OR so project.name substitutes when client?.name is falsy; row-2 guard uses the same falsy check so it cannot render when client is absent - project name can never appear twice and first line can never be blank, by construction, independent of test coverage. |
| 8 | OTH8 | Clientless fallback verified at the CODE level for CardDetailModal | PASS | Direct read of CardDetailModal.tsx:505-533 confirms the identical chained-OR + guard construction as the card, so the same by-construction guarantee holds in the modal header. |
| 9 | OTH9 | Roadmap Phase 1 success criteria (7 bullets) cross-checked individually against delivered code+tests | PASS | All 7 ROADMAP.md bullets (client-first card, clientless headline fallback, pin top-right, modal header order+fallback, no inline colour, tests updated+full suite passes, byte-identical out-of-scope surfaces) independently confirmed true by the checks above. |
| 10 | OTH10 | ESLint rule react-refresh/only-export-components confirmed genuinely active (not silently disabled) when re-verifying DEVN-05 non-reproduction | PASS | npx eslint --print-config on KanbanCard.tsx shows the rule at severity 2 (error) with allowConstantExport:true - the clean lint result is real, not because the rule is off or the file is ignored. |
| 11 | OTH11 | Scope guard: git diff --name-only f2c8d86..HEAD matches exactly the 4 files_modified paths, no more no less | PASS | Output was exactly: CardDetailModal.tsx, KanbanCard.tsx, __tests__/CardDetailModal.test.tsx, __tests__/KanbanCard.test.tsx - 4 lines, all under frontend/src/features/board/components/. |
| 12 | AMD1 | Orchestrator decision 1 (task-3 verify amendment): delivered behaviour matches the amendment's and the original check's shared intent - client name renders exactly once in the modal, meta row is tags-only | PASS | Independently confirmed: old duplicate span grep returns no match; meta-row guard is project.tags.length > 0 with no client disjunct; delivered code was NOT altered to dodge a weakened check - it is the same code the amended AND the original check's intent both describe. |
| 13 | AMD2 | Orchestrator decision 1: the amendment's STATED JUSTIFICATION ('the pattern still legitimately matches the DialogTitle headline and the row-2 guard') was independently tested for factual accuracy | WARN | Tested directly: grep -n client.name (unescaped regex, dot = wildcard) against the current CardDetailModal.tsx returns exactly ONE match - line 551, an unrelated comment (the client name now leads), where the wildcard matches the space in client name. It does NOT match the DialogTitle line or the row-2 guard, because both use client?.name - two characters (? and .) separate client and name there, not the single wildcard character the pattern requires. So the amendment's specific claim that the pattern still legitimately matches those two code lines is factually wrong; verified by running the exact grep and isolating each candidate line. This does NOT indicate a behavioural gap or a check weakened to fit the code (AMD1 confirms delivered behaviour is correct and matches original intent) - the original check's qualitative wording (shows the client name is no longer rendered in the row) was in fact satisfiable and, read carefully, would have passed too (the row itself has zero client.name matches; only an unrelated comment matches). The real defect in the original verify line was that it was not mechanically unambiguous without human judgement to discount the comment match, not that it could never pass. Recommend the plan's amendment note be corrected to describe this accurately rather than the never returns empty framing, but this is a record-keeping precision issue, not a deviation warranting FAIL - no behaviour was papered over. |
| 14 | AMD3 | Orchestrator decision 2 (meta-row comment update classified as non-violation, not DEVN-02) | PASS | Independently agree this is a non-violation. CONVENTIONS.md requires rationale comments be kept accurate rather than contradict the code; the row genuinely became tags-only after removing the client span, so leaving the old Client + tags row label would itself be the inaccuracy. The 1-line comment reword is inseparable from correctly executing task 3 as specified, touches no other behavior, and is not scope creep. |

## Pre-existing Issues

| Test | File | Error |
|------|------|-------|
| repo-wide lint | multiple (e.g. src/routes/Profile.tsx, src/routes/TemplateAdapter.tsx) | eslint . reports 59 problems (45 errors, 14 warnings) outside the 4 files in this phase. Independently re-run and confirmed - none of the 59 are in KanbanCard.tsx or CardDetailModal.tsx. |
| CardDetailModal.test.tsx (all cases) | frontend/src/features/board/components/CardDetailModal.tsx | Radix stderr warning: Missing Description or aria-describedby={undefined} for DialogContent. Pre-existing, fires on untouched Phase-03 cases too and on the 2 new cases added this phase; a warning, not a failure - independently observed in the re-run. |

## Summary

**Tier:** DEEP
**Result:** PASS
**Passed:** 31/32
**Failed:** None
