---
phase: 1
plan: "01"
title: Planner Client-First Name Order (card + detail modal)
status: complete
completed: 2026-08-31
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - cbcdcb2
  - 82b135a
  - 3e1cb23
  - af619c4
deviations: []
pre_existing_issues:
  - "eslint . reports 59 problems repo-wide (45 errors, 14 warnings), all outside the four files in this phase - for example src/routes/Profile.tsx no-unused-vars and src/routes/TemplateAdapter.tsx react-hooks/set-state-in-effect. Not touched."
  - "Every CardDetailModal test case emits a Radix stderr warning: Missing Description or aria-describedby={undefined} for {DialogContent}. Pre-existing, fires on the untouched Phase-03 cases too, and is a warning rather than a failure."
ac_results:
  - criterion: "KanbanCard row 1 renders the CLIENT name with the headline classes text-lg font-semibold leading-tight line-clamp-2; row 2 renders the PROJECT name with text-sm font-bold leading-tight."
    verdict: pass
    evidence: "cbcdcb2 KanbanCard.tsx:158-171; test (1) renders the client name as the headline above the project name in KanbanCard.test.tsx"
  - criterion: "The headline text is the chained-OR fallback card.project.client?.name || card.project.name || (No project) (Option A). No new placeholder such as (No client) is introduced."
    verdict: pass
    evidence: "cbcdcb2 KanbanCard.tsx:166; grep for the chained OR returns exactly one match and no (No client) string exists"
  - criterion: "When card.project.client?.name is falsy the row-2 project line is NOT rendered - the project name appears exactly once, never twice, and the first line is never blank."
    verdict: pass
    evidence: "82b135a test (2) falls the project name back into the headline when there is no client - getAllByText has length 1 and carries text-lg + font-semibold"
  - criterion: "The Pin stays inside the SAME div.flex.items-start.justify-between.gap-1 wrapper as the headline p, and its condition card.stageLockedBy && card.stageLockedBy !== auto is unchanged."
    verdict: pass
    evidence: "cbcdcb2 KanbanCard.tsx:168-170 (pin block unchanged in the diff); 82b135a tests (3) and (4) assert the row carries justify-between + items-start and contains the svg, with and without a client"
  - criterion: "The client name carries NO inline colour and is not muted: no style prop, so el.style.color === empty holds, and its className does not contain text-muted-foreground. The Phase-10 legibility rationale comment moves with the client name to row 1 rather than being deleted."
    verdict: pass
    evidence: "cbcdcb2 KanbanCard.tsx:157-164 (Phase-10 rationale folded into the row-1 comment); three surviving style.color assertions plus not.toContain(text-muted-foreground) in case (1)"
  - criterion: "The memo comparator (KanbanCard.tsx:223-241 pre-change) is byte-for-byte unchanged."
    verdict: pass
    evidence: "git diff HEAD~4..HEAD on KanbanCard.tsx filtered for prev./next. lines returns empty; the file diff hunk ends at row 2"
  - criterion: "CardDetailModal DialogTitle text is project.client?.name || project.name || (No project); a project-name line follows it inside DialogHeader, rendered only when project.client?.name is truthy."
    verdict: pass
    evidence: "3e1cb23 CardDetailModal.tsx:507 (title) and :525-533 (guarded project line inside DialogHeader); af619c4 test (1)"
  - criterion: "The duplicate client span in the modal's Client + tags row is REMOVED and that row's guard collapses to project.tags.length > 0 - the client name renders exactly once in the modal. The tag span markup itself is unchanged."
    verdict: pass
    evidence: "3e1cb23 CardDetailModal.tsx:551-552; the only two client-name references left are the title chain (507) and the row-2 guard (528); af619c4 test (1) asserts getAllByText(Acme Corp) within the header has length 1"
  - criterion: "The three tests in describe(KanbanCard client name styling) keep their el.style.color toBe empty assertion verbatim; only the weight expectation changes from font-bold to font-semibold, plus test (1) keeps not.toContain(text-muted-foreground)."
    verdict: pass
    evidence: "cbcdcb2; grep -c for the style.color guard returns 3; the only test-file changes in that block are the three weight strings and two doc comments"
  - criterion: "CardDetailModal.test.tsx gains header-order coverage (it currently asserts nothing about DialogTitle), including the clientless fallback case."
    verdict: pass
    evidence: "af619c4 describe(CardDetailModal client-first header name order) at CardDetailModal.test.tsx:220 with cases (1) and (2); file goes 5 -> 7 passing cases"
  - criterion: "No file outside the four in files_modified is changed. Specifically AssignmentCell.tsx, exportHtml.ts and dashboard ProjectCard.tsx are untouched, and there are no backend/schema/API changes."
    verdict: pass
    evidence: "git diff --name-only HEAD~4..HEAD lists exactly the four frontend/src/features/board/components paths; git diff over the three named out-of-scope files returns empty"
  - criterion: "The pre-existing accepted ESLint finding on KanbanCard.tsx (DEVN-05) is NOT fixed, NOT suppressed, and NOT treated as a regression from this diff."
    verdict: pass
    evidence: "No eslint-disable comment appears anywhere in the diff; npx eslint src/features/board exits 0 both before and after this diff (see Implementation Notes)"
  - criterion: "artifact KanbanCard.tsx provides client-first card rows with emphasis following position, containing card.project.client?.name || card.project.name"
    verdict: pass
    evidence: "cbcdcb2 KanbanCard.tsx:166"
  - criterion: "artifact CardDetailModal.tsx provides client-first modal header with project name below, containing project.client?.name || project.name"
    verdict: pass
    evidence: "3e1cb23 CardDetailModal.tsx:507"
  - criterion: "artifact KanbanCard.test.tsx provides updated styling guards + new order/fallback/pin cases, containing client-first name order"
    verdict: pass
    evidence: "82b135a KanbanCard.test.tsx:429 describe(KanbanCard client-first name order); 20 cases pass"
  - criterion: "artifact CardDetailModal.test.tsx provides new header-order + clientless-fallback cases, containing client-first header name order"
    verdict: pass
    evidence: "af619c4 CardDetailModal.test.tsx:220; 7 cases pass"
  - criterion: "key_link KanbanCard.tsx -> KanbanCard.test.tsx: client name is the headline (font-semibold, style.color empty) and precedes the project name (font-bold)"
    verdict: pass
    evidence: "82b135a test (1) asserts text-lg + font-semibold on the client, text-sm + font-bold on the project, and DOCUMENT_POSITION_FOLLOWING ordering"
  - criterion: "key_link CardDetailModal.tsx -> CardDetailModal.test.tsx: DialogTitle holds the client name; project name follows in DialogHeader; clientless falls back to the project name"
    verdict: pass
    evidence: "af619c4 tests (1) and (2), scoped to the DialogHeader via within()"
---

The Planner now reads client-first on both surfaces: the Kanban card leads with the client name as its headline and the card detail modal titles itself with the client, each falling back to the project name when a project has no client.

## What Was Built

- KanbanCard rows 1 and 2 swapped: the client name takes the `text-lg font-semibold leading-tight line-clamp-2` headline and the project name drops to the `text-sm font-bold leading-tight` second line. The pin travels with row 1, staying top-right in the same flex wrapper.
- A chained-OR headline (`client?.name || project.name || '(No project)'`) with the second line guarded on the client name, so a clientless project promotes its own name into the headline and renders it exactly once — no blank first line, no duplicate.
- The card detail modal header mirrors the card: `DialogTitle` carries the client name with the project name on a smaller bold line beneath it, and the meta row below is now tags-only.
- Regression coverage for both surfaces: four new KanbanCard cases (order + emphasis, clientless fallback, pin placement with and without a client) and two new modal cases (header order, clientless title fallback).

## Files Modified

- `frontend/src/features/board/components/KanbanCard.tsx` -- modified: rows 1-2 swapped to client-first with the chained-OR headline and guarded project line; Phase-10 no-inline-colour rationale carried into the row-1 comment.
- `frontend/src/features/board/components/__tests__/KanbanCard.test.tsx` -- modified: three styling assertions re-anchored to `font-semibold`, two stale "Row-2" doc comments reworded; added `describe('KanbanCard client-first name order')` with four cases.
- `frontend/src/features/board/components/CardDetailModal.tsx` -- modified: `DialogTitle` leads with the client name, a guarded project-name line added inside `DialogHeader`, duplicate client span removed and the meta row collapsed to tags-only.
- `frontend/src/features/board/components/__tests__/CardDetailModal.test.tsx` -- modified: added `within` import and `describe('CardDetailModal client-first header name order')` with two cases.

## Deviations

None. The delivered code matches the plan exactly. Two items were raised during execution and both were classified by the orchestrator as non-violations rather than deviations — see Implementation Notes for each, with reasoning. Nothing was dropped or hidden; only the classification differs.

## Implementation Notes

- Verification evidence: full frontend suite 98/98 across 15 files; `npx tsc -b` exit 0 after every task; `npx eslint src/features/board` exit 0.
- Both pinned constraints held: the clientless fallback is Option A (chained OR) exactly as specified, and the memo comparator shows a zero diff — it already compared `project.name` and `project.client?.name`, so the reorder reads no new field.
- Test-mechanics note: header assertions in the modal are scoped through `within(heading.parentElement)` because the project name also appears elsewhere in the modal body; Testing Library's `getNodeText` matches only direct text-node children, so each name resolves to exactly one element with no ancestor ambiguity.

### Items raised during execution, classified as non-violations

- **Task 3 verify command was unsatisfiable (originally raised as DEVN-01).** The plan's `grep -n "client.name"` check said the client name should be "no longer rendered" in the meta row, but that pattern still legitimately matches the `DialogTitle` chained-OR headline and the new row-2 guard, so it can never return empty. Execution verified the specific change instead: `className="font-medium">{project.client.name}` returns no match, and the meta-row guard reads `project.tags.length > 0` with no client disjunct. **Resolution: the plan defect was repaired at source** — `01-01-PLAN.md` task 3's verify block was amended on 2026-08-31 with the correct check and a dated note explaining what the old line got wrong. Not carried as a deviation because the plan no longer says the thing that was departed from, and the delivered behaviour never differed.
- **Meta-row label comment updated (originally raised as DEVN-02).** Removing the client span left that row commented "Client + tags row" on a now tags-only row. The comment was updated to match. Task 3 already rewrites this row; leaving a comment that contradicts the code it labels would be shipping the edit incompletely, and CONVENTIONS.md directs that rationale comments be kept accurate rather than dropped. Doing the specified edit correctly is not a departure from the plan's intent. The tag `<span>` markup is unchanged.
- **DEVN-05 does not currently reproduce.** `npx eslint src/features/board` exits 0, with `react-refresh/only-export-components` confirmed enabled as an error via `--print-config` and the file not ignored — a genuinely clean result, not a disabled rule. Identical before and after this diff (verified by checking the four files out at `HEAD~4`, re-linting, and restoring). Left entirely untouched: no fix, no disable comment. Recorded here rather than under `pre_existing_issues` because it is an observation that a previously recorded issue is clean, not a new issue; filing it as a known issue would push a phantom entry into `known-issues.json`. `CONCERNS.md:30` still carries it as open and may be worth reconciling separately — outside this phase's scope.
