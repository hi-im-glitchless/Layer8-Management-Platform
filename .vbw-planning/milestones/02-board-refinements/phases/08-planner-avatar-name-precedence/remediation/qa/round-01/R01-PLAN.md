---
phase: 8
round: 1
plan: R01
title: Amend 08-01-PLAN.md to record correct backlog-alias initials behaviour (Futuro 1 -> F1)
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md
forbidden_commands: []
fail_classifications:
  - {id: "DEV-01", type: "plan-amendment", rationale: "The plan's stated expectation (backlog alias 'Futuro 1' renders monogram 'F') was wrong; the unchanged Phase-07 whitespace splitter treats 'Futuro 1' as two tokens and deterministically yields first+last initial 'F1'. The implementation and tests are already correct (assert 'F1' for the two-token alias and add a true-mononym case 'Futuro' -> 'F'). No product code or test is warranted — the fix is to amend the original plan text to record the actual, correct behaviour.", source_plan: "08-01-PLAN.md"}
known_issues_input: []
known_issue_resolutions: []
must_haves:
  truths:
    - "08-01-PLAN.md no longer claims the backlog alias 'Futuro 1' renders 'F' anywhere; every prior 'Futuro 1' -> 'F' expectation (lines ~23, ~109, ~136) now states the two-token alias 'Futuro 1' yields 'F1' (first+last initial via the unchanged whitespace splitter)."
    - "08-01-PLAN.md additionally records that a true single-token mononym alias (e.g. 'Futuro') yields one initial 'F', matching the test's added mononym case."
    - "No product, source, or test code is modified in this remediation round: KanbanCard.tsx and KanbanCard.test.tsx are unchanged; the only file edited is the original plan 08-01-PLAN.md."
    - "DEVN-01 is recorded as resolved-by-amendment; the plan text now agrees with the implementation and tests, removing the un-amended deviation that QA failed."
  artifacts:
    - path: ".vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md"
      provides: "Corrected plan expectation for the backlog-alias monogram: two-token 'Futuro 1' -> 'F1', single-token mononym 'Futuro' -> 'F'."
      contains: "Futuro 1"
  key_links:
    - from: ".vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md"
      to: "frontend/src/features/board/components/__tests__/KanbanCard.test.tsx"
      via: "amended plan expectation ('Futuro 1' -> 'F1', 'Futuro' -> 'F') now matches the assertions already implemented in the test (cases b1b and b1c)"
---
<objective>
Resolve QA FAIL DEV-01 (deviation DEVN-01) by amending the ORIGINAL phase-08 plan so its
stated expectation matches the verified, correct behaviour. The plan's must_have truth #3
and two downstream references claim the backlog alias 'Futuro 1' renders the monogram 'F'.
That expectation is wrong: the unchanged Phase-07 two-initial splitter treats 'Futuro 1'
as TWO whitespace tokens and deterministically yields 'F1' (first + last initial). The
implementation and tests are already CORRECT — the test asserts 'F1' for the two-token
alias (case b1b) and adds a separate true-mononym case 'Futuro' -> 'F' (case b1c). The
deviation was a mistaken plan expectation, never amended in writing, so QA failed it as an
un-amended deviation. This is a plan-amendment: edit 08-01-PLAN.md to record the actual
behaviour and mark DEVN-01 resolved-by-amendment. Do NOT touch any product or test code —
KanbanCard.tsx and KanbanCard.test.tsx are already correct.
</objective>
<context>
@.vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md
@.vbw-planning/phases/08-planner-avatar-name-precedence/08-VERIFICATION.md

The QA FAIL (08-VERIFICATION.md row 15, DEV-01) is the sole failure; 29/30 checks pass.
It cites 08-01-PLAN.md lines 23, 109, and 136 as still reading 'Futuro 1' -> 'F' while
test case (b1b) asserts 'F1' and (b1c) asserts 'F' for the single-token mononym 'Futuro'.
The amendment must align the plan with that already-correct test behaviour. No KanbanCard
code change is warranted — the two-initial whitespace splitter and all Phase-07 branches
are byte-identical and verified PASS in rows 6, 24 of the verification table.
</context>
<tasks>
<task type="auto">
  <name>Amend 08-01-PLAN.md: backlog alias 'Futuro 1' -> 'F1', mononym 'Futuro' -> 'F'; mark DEVN-01 resolved-by-amendment</name>
  <files>
    .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md
  </files>
  <action>
Edit ONLY .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md. Find and
correct EVERY occurrence of the wrong 'Futuro 1' -> 'F' backlog expectation (the
verification cites lines ~23, ~109, ~136 — search the whole file to catch all of them):

1. must_haves truth #3 (~line 23): currently "...and alias 'Futuro 1' still resolves to
   'Futuro 1' and renders 'F' — unchanged from Phase 07." Change to state that the
   two-token alias 'Futuro 1' resolves to 'Futuro 1' and renders the TWO-initial monogram
   'F1' (first + last initial via the unchanged Phase-07 whitespace splitter), and add that
   a true single-token mononym alias (e.g. 'Futuro') yields the single initial 'F'.
   Phase-07 splitter behaviour is unchanged.

2. Task-2 action (~line 109): currently "...teamMember.displayName = 'Futuro 1' still
   renders 'F' and resolves the name to 'Futuro 1'." Change so it states the two-token
   alias 'Futuro 1' renders 'F1' (first+last initial) and resolves the name to 'Futuro 1',
   and that a single-token mononym alias (e.g. 'Futuro') renders 'F'.

3. success_criteria (~line 136): currently "Backlog member 'Futuro 1' (no linked user)
   still renders 'F' and resolves to 'Futuro 1' — Phase-07 behaviour unchanged." Change to
   "Backlog member 'Futuro 1' (no linked user) renders the two-initial monogram 'F1' and
   resolves to 'Futuro 1'; a single-token mononym alias (e.g. 'Futuro') renders the single
   initial 'F' — Phase-07 splitter behaviour unchanged."

Also update the Task-2 <done> line (~line 122-123) if it references "'Futuro 1' -> 'F'" so
it reads "'Futuro 1' -> 'F1' (and mononym 'Futuro' -> 'F')". Add a short note near the
amended truth (or in a deviation/amendment note) recording that DEVN-01 is
resolved-by-amendment: the plan expectation was corrected to match the already-correct
implementation and tests; no product/test code changed.

Do NOT edit, stage, or modify any product, source, or test file — specifically NOT
KanbanCard.tsx and NOT KanbanCard.test.tsx. The only file touched in this round is the
plan .md above.
  </action>
  <verify>
From the repo root:
- `grep -n "Futuro 1" .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md`
  shows the alias still named but now paired with 'F1' (two-initial) expectations.
- `grep -n "renders 'F'\|renders \"F\"\| -> 'F'\| renders F " .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md`
  returns NO line that still claims the two-token 'Futuro 1' renders the single 'F'
  (the only surviving single-'F' references are the explicit single-token mononym
  'Futuro' -> 'F' case).
- `grep -n "F1" .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md`
  confirms the corrected two-initial expectation is present at the amended locations.
- `grep -in "DEVN-01" .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md`
  confirms the resolved-by-amendment note is present.
- `git diff --name-only` lists ONLY
  .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md — no KanbanCard.tsx,
  no KanbanCard.test.tsx, no product/source/test or backend/prisma file.
  </verify>
  <done>
08-01-PLAN.md no longer claims the two-token 'Futuro 1' renders 'F'; it now states
'Futuro 1' -> 'F1' (first+last initial) and 'Futuro' (mononym) -> 'F' at all three prior
locations; DEVN-01 is marked resolved-by-amendment; the only changed file is
08-01-PLAN.md (no product or test code modified).
  </done>
</task>
</tasks>
<verification>
1. `grep -n "Futuro 1" .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md` — the alias appears, now paired with 'F1' (two-initial) expectations.
2. No surviving plan text claims the two-token 'Futuro 1' renders the single monogram 'F'; the only single-'F' expectation is the explicit single-token mononym 'Futuro' -> 'F' case.
3. The amended plan expectation ('Futuro 1' -> 'F1', 'Futuro' -> 'F') matches the assertions already implemented in KanbanCard.test.tsx (cases b1b and b1c) — confirming the plan now agrees with the verified PASS behaviour.
4. DEVN-01 is recorded in 08-01-PLAN.md as resolved-by-amendment.
5. `git diff --name-only` shows ONLY .vbw-planning/phases/08-planner-avatar-name-precedence/08-01-PLAN.md changed — no product, source, or test code (KanbanCard.tsx / KanbanCard.test.tsx) and no backend/prisma file modified in this round.
</verification>
<success_criteria>
- 08-01-PLAN.md no longer claims the backlog two-token alias 'Futuro 1' renders 'F' anywhere; it now correctly states 'Futuro 1' -> 'F1' (first+last initial via the unchanged whitespace splitter).
- 08-01-PLAN.md records the single-token mononym case 'Futuro' -> 'F'.
- DEVN-01 is marked resolved-by-amendment; the plan text now agrees with the already-correct implementation and tests.
- No product, source, or test code is modified in this remediation round; the sole changed file is 08-01-PLAN.md.
</success_criteria>
<known_issue_workflow>
- input_mode=verification with no tracked known issues: both `known_issues_input` and `known_issue_resolutions` are empty arrays.
- No carried known issues exist for this phase/round, so no resolution entries are required.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
