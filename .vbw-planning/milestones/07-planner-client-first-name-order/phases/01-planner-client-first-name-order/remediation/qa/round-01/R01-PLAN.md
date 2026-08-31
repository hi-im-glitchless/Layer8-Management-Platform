---
phase: 1
round: 1
plan: R01
title: Phase 01 QA Remediation R01 — disposition the two carried known issues (Radix dialog description gap, repo-wide ESLint backlog)
type: remediation
autonomous: true
effort_override: thorough
skills_used: []
files_modified:
  - .vbw-planning/codebase/CONCERNS.md
forbidden_commands: []
fail_classifications: []
known_issues_input:
  - '{"test":"CardDetailModal.test.tsx (all cases)","file":"frontend/src/features/board/components/CardDetailModal.tsx","error":"Radix stderr warning: Missing Description or aria-describedby={undefined} for DialogContent. Pre-existing, fires on untouched Phase-03 cases too and on the 2 new cases added this phase; a warning, not a failure - independently observed in the re-run."}'
  - '{"test":"repo-wide lint","file":"multiple (e.g. src/routes/Profile.tsx, src/routes/TemplateAdapter.tsx)","error":"eslint . reports 59 problems (45 errors, 14 warnings) outside the 4 files in this phase. Independently re-run and confirmed - none of the 59 are in KanbanCard.tsx or CardDetailModal.tsx."}'
known_issue_resolutions:
  - '{"test":"CardDetailModal.test.tsx (all cases)","file":"frontend/src/features/board/components/CardDetailModal.tsx","error":"Radix stderr warning: Missing Description or aria-describedby={undefined} for DialogContent. Pre-existing, fires on untouched Phase-03 cases too and on the 2 new cases added this phase; a warning, not a failure - independently observed in the re-run.","disposition":"accepted-process-exception","rationale":"Re-verified at HEAD, not taken on report. (1) Pre-existing: npx vitest run on CardDetailModal.test.tsx emits the warning once per case for all 7 cases, including the 5 Phase-03 cases (a)-(e) this phase never touched; git diff f2c8d86..HEAD over CardDetailModal.tsx shows the DialogContent invocation at line 497 is absent from the diff - only the DialogHeader subtree changed. (2) Not a WCAG failure: probed the rendered dialog directly and role=dialog carries aria-labelledby resolving to the DialogTitle whose text is the client name, so the dialog has a correct accessible name and 4.1.2 Name Role Value is satisfied. This phase in fact improved that accessible name by putting the client first. (3) The residual defect is real but minor and is NOT a missing name: Radix sets aria-describedby to id radix-_r_2_, which resolves to no element - a dangling IDREF that assistive tech drops silently. (4) Not cheap to fix correctly here: the Radix-sanctioned one-liner aria-describedby={undefined} only silences the warning and yields zero accessibility benefit, while a genuine DialogDescription requires new description copy that nobody has specified and lands in the exact DialogHeader subtree MH7 and KL2 just verified, on a phase whose only purpose is header name order. The identical gap exists in ClientNotesModal.tsx, so a one-file patch would leave the repo pattern half-addressed while every other dialog already uses DialogDescription. Non-blocking for THIS phase because it predates the phase, fires identically on untouched code, leaves the dialog correctly named, and blocks no test - the suite is 7/7 green and the full frontend suite 98/98. Not silently dropped: recorded as tracked concern 18 in CONCERNS.md for a scoped accessibility change covering both modals."}'
  - '{"test":"repo-wide lint","file":"multiple (e.g. src/routes/Profile.tsx, src/routes/TemplateAdapter.tsx)","error":"eslint . reports 59 problems (45 errors, 14 warnings) outside the 4 files in this phase. Independently re-run and confirmed - none of the 59 are in KanbanCard.tsx or CardDetailModal.tsx.","disposition":"accepted-process-exception","rationale":"Re-verified mechanically at HEAD, not by assertion. Ran npx eslint . -f json from frontend/ and aggregated the report: exactly 59 problems (45 errors, 14 warnings) spread over 31 files, and the number of findings in the 4 phase files (KanbanCard.tsx, CardDetailModal.tsx, __tests__/KanbanCard.test.tsx, __tests__/CardDetailModal.test.tsx) is 0. git diff --name-only f2c8d86..HEAD lists exactly those same 4 files and nothing else, so every one of the 59 findings sits in a file this phase never opened - the two are disjoint by construction, not by coincidence. Note routes/Board.tsx carries 2 warnings and is the only board-named file in the report; it is not one of the 4 phase files and is untouched by the diff. Non-blocking for THIS phase because the backlog gates nothing: the frontend build script is tsc -b && vite build and never invokes ESLint, and the repo has no CI workflow (.github/workflows is absent, corroborating CONCERNS.md item 12), so these 59 findings neither fail a build nor block a merge today, and typecheck plus the 98/98 suite are green. Remediating 59 findings across routes, admin, adapter, executive-report and schedule is a separate cleanup effort and is explicitly out of scope for a Planner name-order phase. Not silently dropped: recorded as tracked concern 19 in CONCERNS.md as a standing backlog needing its own phase."}'
must_haves:
  truths:
    - "Both carried known issues are dispositioned accepted-process-exception with evidence re-derived at HEAD in this round, and neither is dropped from known_issues_input or known_issue_resolutions."
    - "No file under frontend/ or backend/ is modified in this round. The Phase 01 delivered code and its 98/98 passing suite are left byte-identical."
    - "Both accepted exceptions are recorded as durable tracked concerns in .vbw-planning/codebase/CONCERNS.md, so acceptance defers the work rather than discharging it."
  artifacts:
    - path: ".vbw-planning/codebase/CONCERNS.md"
      provides: "tracked entries 18 (Radix dialog description gap, incl. the dangling aria-describedby IDREF and the ClientNotesModal sibling) and 19 (standing repo-wide ESLint backlog)"
      contains: "aria-describedby"
  key_links:
    - from: ".vbw-planning/codebase/CONCERNS.md"
      to: "frontend/src/features/board/components/CardDetailModal.tsx"
      via: "concern 18 names the DialogContent that lacks a DialogDescription and the sibling ClientNotesModal.tsx with the identical gap"
---
<objective>
Close Phase 01 QA round 01. This is a disposition round, not a code-fix round.

QA returned PASS 31/32 with 0 FAIL and no declared deviations — the delivered code is verified correct, so `fail_classifications` is empty. The deterministic gate routed here solely because two tracked pre-existing entries sit in `known-issues.json` and unresolved tracked known issues block UAT (`input_mode=known-issues`, `qa_gate_known_issues_override=true`).

Both issues are dispositioned `accepted-process-exception`. The evidence for each was re-derived at HEAD while writing this plan, not carried over from the QA report:

- **Radix dialog description warning** — fires on all 7 `CardDetailModal.test.tsx` cases including the 5 untouched Phase-03 cases; the `DialogContent` line is absent from this phase's diff. Crucially, the dialog IS correctly named (`aria-labelledby` resolves to the `DialogTitle`, which this phase improved by putting the client name first), so there is no WCAG 4.1.2 failure. The genuine residual defect is a dangling `aria-describedby` IDREF. This was weighed as an accessibility matter rather than dismissed as cosmetic: the cheap silencer buys no accessibility, and the honest fix needs unspecified description copy landing in the exact header subtree MH7/KL2 just verified, plus a matching change to `ClientNotesModal.tsx`. It belongs in a scoped a11y change.
- **Repo-wide ESLint backlog** — 59 problems over 31 files, 0 in the 4 phase files; the phase diff touches exactly those 4 files, and lint runs in neither `build` nor CI.

The single executable task records both acceptances as durable tracked concerns so the debt is deferred with an owner, not silently discharged. No product code, no test, and no phase artifact is edited.

Do NOT fix the 59 unrelated lint problems. Do NOT edit `CardDetailModal.tsx`, `ClientNotesModal.tsx`, `KanbanCard.tsx`, or either test file in this round.

Note: `DEVN-05` (`react-refresh/only-export-components` on `KanbanCard.tsx`, listed open at `CONCERNS.md:30` as item 17) was independently confirmed by QA to no longer reproduce. It is not one of the two carried issues and is out of scope here — leave item 17 exactly as written.
</objective>
<context>
@.vbw-planning/phases/01-planner-client-first-name-order/01-VERIFICATION.md
@.vbw-planning/phases/01-planner-client-first-name-order/remediation/qa/round-01/R01-KNOWN-ISSUES.json
@.vbw-planning/codebase/CONCERNS.md
As-built reference (do NOT edit): frontend/src/features/board/components/CardDetailModal.tsx:497 — `<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">` with a `DialogTitle` at :506 and no `DialogDescription`. Sibling with the identical gap: frontend/src/features/schedule/components/ClientNotesModal.tsx:46.
Constraints: no frontend/** or backend/** edits; do not weaken, skip, or delete any passing test (98/98 frontend, 7/7 in CardDetailModal.test.tsx); do not add `aria-describedby={undefined}` or a `DialogDescription` in this round; do not renumber or reword existing CONCERNS.md items 1-17.
</context>
<tasks>
<task type="auto">
  <name>Record both accepted exceptions as tracked concerns in CONCERNS.md</name>
  <files>
    .vbw-planning/codebase/CONCERNS.md
  </files>
  <action>
Append two new sections to the END of `.vbw-planning/codebase/CONCERNS.md`, continuing the existing sequential numbering (the file currently ends at item 17). Do not renumber, reorder, or reword items 1-17 — in particular leave item 17 (DEVN-05) exactly as it stands.

Append:

## Accessibility
18. **Radix `DialogContent` rendered without a `Description`** — `frontend/src/features/board/components/CardDetailModal.tsx:497` and `frontend/src/features/schedule/components/ClientNotesModal.tsx:46` render `DialogContent` with a `DialogTitle` but no `DialogDescription`. Radix therefore logs `Missing Description or aria-describedby={undefined} for DialogContent` on every render (visible as stderr noise across the whole `CardDetailModal.test.tsx` suite) and wires `aria-describedby` to an id that no element carries — a dangling IDREF. Both dialogs *are* correctly named: `aria-labelledby` resolves to the `DialogTitle`, so WCAG 4.1.2 is satisfied and the practical assistive-tech impact is negligible (a dangling IDREF is dropped silently). The residual gap is the absent supplementary description. Every other dialog in the repo already uses `DialogDescription`; these two are the outliers. Accepted as non-blocking for Phase 01 QA round 01 — the warning predates the phase and fires identically on untouched Phase-03 cases. Deferred rather than fixed inline because the real fix requires new description copy (a content decision) landing in the header subtree, and should cover both modals in one scoped accessibility change. Fixing it as `aria-describedby={undefined}` alone would silence the warning without improving accessibility and is not the wanted outcome.

## Lint / tooling debt
19. **Standing repo-wide ESLint backlog** — `npm run lint` in `frontend/` reports 59 problems (45 errors, 14 warnings) across 31 files (`routes/Profile.tsx`, `routes/TemplateAdapter.tsx`, `admin/*`, `features/adapter/*`, `features/executive-report/*`, `features/schedule/*`, `routes/Board.tsx`, and others). Nothing gates it: `build` is `tsc -b && vite build` and never invokes ESLint, and there is no CI (see 12), so the backlog neither fails a build nor blocks a merge and grows unchecked. Accepted as non-blocking for Phase 01 QA round 01 — zero findings fall in the four Planner files that phase touched. Needs its own cleanup phase; per-phase acceptance is not a fix.

Make no other change to the file. Do not edit any file under `frontend/` or `backend/`.
  </action>
  <verify>
- `grep -n "^18\." .vbw-planning/codebase/CONCERNS.md` returns the Radix dialog description entry, and `grep -n "^19\." .vbw-planning/codebase/CONCERNS.md` returns the ESLint backlog entry.
- `grep -c "aria-describedby" .vbw-planning/codebase/CONCERNS.md` returns a non-zero count.
- `grep -n "^17\." .vbw-planning/codebase/CONCERNS.md` still returns the DEVN-05 line unchanged, and `grep -c "^1[0-7]\." .vbw-planning/codebase/CONCERNS.md` shows items 10-17 all still present.
- `git diff --name-only` shows ONLY `.vbw-planning/codebase/CONCERNS.md` — no `frontend/` or `backend/` path appears.
- Regression net still green, confirming this round changed no behaviour: from `frontend/`, `npx vitest run` is 98/98 across 15 files, `npx vitest run src/features/board/components/__tests__/CardDetailModal.test.tsx` is 7/7, and `npx tsc -b` exits 0 with no output.
- Both dispositions still hold at HEAD (capture the raw output for the SUMMARY): the CardDetailModal run still prints the Radix warning for the untouched Phase-03 cases `(a)`-`(e)` as well as the 2 new cases; and `npx eslint . -f json` still totals 59 problems (45 errors, 14 warnings) with 0 findings in `KanbanCard.tsx`, `CardDetailModal.tsx`, `KanbanCard.test.tsx`, `CardDetailModal.test.tsx`.
  </verify>
  <done>
CONCERNS.md carries new items 18 and 19 recording both accepted exceptions with their evidence and their deferred fix; items 1-17 are untouched; no product code or test changed; the 98/98 suite and typecheck are still green. One commit: `docs(concerns): record accepted Radix dialog description and repo-wide lint exceptions (R01)`.
  </done>
</task>
</tasks>
<verification>
1. `fail_classifications` is empty and no code-fix task exists — correct for a round where QA returned PASS 31/32 with 0 FAIL and no deviations.
2. Both carried known issues appear in `known_issues_input` AND `known_issue_resolutions` with byte-identical `{test,file,error}` copied from R01-KNOWN-ISSUES.json; neither is dropped, and both dispositions are `accepted-process-exception`.
3. Each rationale is grounded in evidence re-derived at HEAD in this round — the per-case warning output across all 7 CardDetailModal cases, the `git diff f2c8d86..HEAD` scope check, the rendered-dialog `aria-labelledby`/`aria-describedby` probe, and the aggregated `eslint . -f json` counts — so an independently re-checking QA agent can reproduce each claim.
4. `git diff --name-only` for this round shows only `.vbw-planning/codebase/CONCERNS.md`; the Phase 01 delivered code, both test files, and all phase artifacts are untouched.
5. Neither acceptance discharges the underlying work: both are recorded as tracked CONCERNS.md items naming the deferred fix and its proper scope.
6. CONCERNS.md item 17 (DEVN-05) is unchanged, so this round does not contradict the QA finding that DEVN-05 no longer reproduces.
</verification>
<success_criteria>
- Both tracked known issues carry an explicit, defensible `accepted-process-exception` disposition, letting Phase 01 clear the known-issues gate and proceed to UAT.
- The Radix warning is accepted on accessibility grounds that were actually tested (dialog correctly named via `aria-labelledby`; residual defect is a dangling `aria-describedby` IDREF), not waved through as cosmetic — and the fix is scoped and tracked rather than dropped.
- The ESLint backlog is accepted on a disjointness proof (59 findings across 31 files vs. exactly 4 changed files, 0 overlap) plus the fact that lint gates neither build nor CI.
- No product code, no test, and no phase artifact is modified; the 98/98 frontend suite and `tsc -b` remain green.
- The round expands into neither a repo-wide lint cleanup nor an unscoped a11y refactor.
</success_criteria>
<known_issue_workflow>
- `known_issues_input` and `known_issue_resolutions` each carry both carried issues, copied byte-for-byte from R01-KNOWN-ISSUES.json in the canonical `{test,file,error}` shape.
- Both dispositions are `accepted-process-exception`: each was independently re-verified at HEAD as pre-existing, disjoint from this phase's diff, and blocking no test or build gate.
- Neither is `resolved` — no code changed, so claiming resolution would be false. Neither is `unresolved` — both are accepted for this phase with a recorded rationale, not punted to a further round.
- Acceptance is scoped to Phase 01 only. Both remain live repo concerns (CONCERNS.md items 18 and 19) and must be re-dispositioned on their merits if they resurface in a later phase.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
