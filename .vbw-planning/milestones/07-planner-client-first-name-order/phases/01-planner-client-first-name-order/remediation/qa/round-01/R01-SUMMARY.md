---
phase: 1
round: 1
title: Phase 01 QA Remediation R01 — disposition the two carried known issues (Radix dialog description gap, repo-wide ESLint backlog)
type: remediation
status: complete
completed: 2026-08-31
tasks_completed: 1
tasks_total: 1
commit_hashes:
  - eb51be3200b02d5b705b099e0c32b09d289fa598
files_modified:
  - .vbw-planning/codebase/CONCERNS.md
deviations: []
known_issue_outcomes:
  - '{"test":"CardDetailModal.test.tsx (all cases)","file":"frontend/src/features/board/components/CardDetailModal.tsx","error":"Radix stderr warning: Missing Description or aria-describedby={undefined} for DialogContent. Pre-existing, fires on untouched Phase-03 cases too and on the 2 new cases added this phase; a warning, not a failure - independently observed in the re-run.","disposition":"accepted-process-exception","rationale":"Re-verified at HEAD in this round rather than carried over from the QA report (evidence captured at af619c4, the commit immediately preceding this documentation-only commit; no product code changed since). (1) Pre-existing and outside the phase diff: npx vitest run src/features/board/components/__tests__/CardDetailModal.test.tsx prints the warning once per case for all 7 cases - the 5 untouched Phase-03 cases (a) through (e) as well as the 2 new cases (1) and (2) added this phase - and git diff --name-only f2c8d86..HEAD lists only CardDetailModal.tsx, KanbanCard.tsx and their two test files, with the DialogContent invocation at CardDetailModal.tsx:497 absent from the diff. (2) Not a WCAG 4.1.2 failure: the rendered dialog carries aria-labelledby resolving to the DialogTitle, so the dialog has a correct accessible name, and this phase in fact improved that name by putting the client first. The genuine residual defect is a dangling aria-describedby IDREF, which assistive tech drops silently. (3) Deferred rather than patched inline: the Radix-sanctioned one-liner aria-describedby={undefined} only silences the warning and yields zero accessibility benefit, while a real DialogDescription requires description copy nobody has specified and would land in the exact DialogHeader subtree this phase just verified. The identical gap exists in ClientNotesModal.tsx:46, so the fix belongs in one scoped accessibility change covering both modals. Blocks nothing at HEAD: CardDetailModal.test.tsx is 7/7, the full frontend suite is 98/98 across 15 files, and npx tsc -b exits 0 with no output. Not silently dropped: recorded as tracked concern 18 in .vbw-planning/codebase/CONCERNS.md so the work is deferred with an owner rather than discharged."}'
  - '{"test":"repo-wide lint","file":"multiple (e.g. src/routes/Profile.tsx, src/routes/TemplateAdapter.tsx)","error":"eslint . reports 59 problems (45 errors, 14 warnings) outside the 4 files in this phase. Independently re-run and confirmed - none of the 59 are in KanbanCard.tsx or CardDetailModal.tsx.","disposition":"accepted-process-exception","rationale":"Re-verified mechanically at HEAD in this round, not by assertion (evidence captured at af619c4, immediately before this documentation-only commit). Ran npx eslint . -f json from frontend/ and aggregated the report: exactly 59 problems, 45 errors and 14 warnings, spread over 31 files, and the number of findings in the four phase files KanbanCard.tsx, CardDetailModal.tsx, __tests__/KanbanCard.test.tsx and __tests__/CardDetailModal.test.tsx is 0. git diff --name-only f2c8d86..HEAD lists exactly those same four files and nothing else, so the 59 findings and the phase diff are disjoint by construction rather than by coincidence. Non-blocking for THIS phase because the backlog gates nothing today: the frontend build script is tsc -b && vite build and never invokes ESLint, and the repo has no CI workflow (.github/workflows is absent, corroborating CONCERNS.md item 12), so these findings neither fail a build nor block a merge, while npx tsc -b exits 0 and the suite is 98/98. Remediating 59 findings across routes, admin, adapter, executive-report and schedule is a separate cleanup effort and is explicitly out of scope for a Planner name-order phase. Not silently dropped: recorded as tracked concern 19 in .vbw-planning/codebase/CONCERNS.md as a standing backlog needing its own phase."}'
---

Dispositioned both carried Phase 01 known issues as `accepted-process-exception` with evidence re-derived at HEAD, and recorded each acceptance as a durable tracked concern in `.vbw-planning/codebase/CONCERNS.md`; no product code, test, or phase artifact was touched.

## Task 1: Record both accepted exceptions as tracked concerns in CONCERNS.md

### What Was Built
- `CONCERNS.md` item 18 under a new `## Accessibility` heading — the Radix `DialogContent` rendered without a `Description` in `CardDetailModal.tsx:497` and `ClientNotesModal.tsx:46`, naming the dangling `aria-describedby` IDREF as the real residual defect, recording that `aria-labelledby` still resolves to the `DialogTitle` so WCAG 4.1.2 is satisfied, and scoping the deferred fix to one accessibility change covering both modals.
- `CONCERNS.md` item 19 under a new `## Lint / tooling debt` heading — the standing repo-wide ESLint backlog of 59 problems across 31 files, recording that neither `build` (`tsc -b && vite build`) nor CI gates it, and that it needs its own cleanup phase.
- Items 1-17 were left byte-identical; in particular item 17 (DEVN-05) is unchanged, so this round does not contradict the QA finding that DEVN-05 no longer reproduces.

### Files Modified
- `.vbw-planning/codebase/CONCERNS.md` — appended: two new sections carrying tracked concerns 18 and 19, continuing the existing sequential numbering.

### Evidence Re-Captured At HEAD

Captured at `af619c4`, the commit immediately preceding the documentation-only commit `eb51be3` produced by this round; no product code changed between the two.

**1. Radix warning — `npx vitest run src/features/board/components/__tests__/CardDetailModal.test.tsx` (from `frontend/`)**

The warning `Warning: Missing 'Description' or 'aria-describedby={undefined}' for {DialogContent}.` was emitted on stderr once for each of the 7 cases, in this order:

```
(a) renders client notes above the project notes when both are present
(b) renders no client-notes section when the project has no client
(c) renders no client-notes section when the client notes are empty
(d) exposes no edit affordance in the client-notes subtree, even for ADMIN
(e) opens the project-notes editor Preview-first (Preview tab selected on mount)
(1) titles the modal with the client name and follows it with the project name
(2) falls back to the project name as the title when there is no client
```

```
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Cases (a) through (e) are the Phase-03 cases this phase never touched, confirming the warning is pre-existing and independent of the header change. Exit code 0 — a warning, not a failure.

**2. ESLint totals — `npx eslint . -f json` (from `frontend/`), report aggregated**

```
total problems: 59   errors: 45   warnings: 14
files with findings: 31
findings in the 4 phase files (KanbanCard.tsx, CardDetailModal.tsx,
  __tests__/KanbanCard.test.tsx, __tests__/CardDetailModal.test.tsx): 0
```

**3. Phase diff scope — `git diff --name-only f2c8d86..HEAD`**

```
frontend/src/features/board/components/CardDetailModal.tsx
frontend/src/features/board/components/KanbanCard.tsx
frontend/src/features/board/components/__tests__/CardDetailModal.test.tsx
frontend/src/features/board/components/__tests__/KanbanCard.test.tsx
```

Exactly the four phase files, so the 59 lint findings and the phase diff are disjoint by construction.

**4. Regression net still green**

```
npx vitest run   ->  Test Files 15 passed (15),  Tests 98 passed (98)
npx tsc -b       ->  exit 0, no output
```

**5. Round diff scope — `git diff --name-only` after the append**

Only `.vbw-planning/codebase/CONCERNS.md`; no `frontend/` or `backend/` path appears, and `git status --porcelain frontend backend` is empty at HEAD.

### Known Issue Outcomes
- `CardDetailModal.test.tsx (all cases)` (`frontend/src/features/board/components/CardDetailModal.tsx`) — `accepted-process-exception`: pre-existing and outside the phase diff (fires identically on the 5 untouched Phase-03 cases), and not a WCAG 4.1.2 failure since the dialog is correctly named via `aria-labelledby`. The residual defect is a dangling `aria-describedby` IDREF that assistive tech drops silently. Deferred rather than patched because the cheap silencer buys no accessibility and a real `DialogDescription` needs unspecified copy landing in the just-verified header subtree, plus a matching change to `ClientNotesModal.tsx`. Tracked as CONCERNS.md item 18.
- `repo-wide lint` (`multiple (e.g. src/routes/Profile.tsx, src/routes/TemplateAdapter.tsx)`) — `accepted-process-exception`: 59 problems across 31 files with 0 in the 4 files this phase changed, proven disjoint against the phase diff; lint gates neither `build` nor CI, so the backlog fails no build and blocks no merge. A 59-finding cleanup across routes, admin, adapter, executive-report and schedule is a separate effort, out of scope for a Planner name-order phase. Tracked as CONCERNS.md item 19.

### Deviations
None
