---
phase: 1
round: 1
plan: R01
title: Correct sort-example prose in 01-01-PLAN (DEVN-01 plan-amendment) + carry pre-existing ESLint known issues
type: remediation
autonomous: true
effort_override: fast
skills_used: []
files_modified:
  - .vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md
forbidden_commands: []
fail_classifications:
  - {id: "DEV-01", type: "plan-amendment", rationale: "DEVN-01 is a wrong illustrative example in 01-01-PLAN.md's sort-test prose, not a functional defect. The plan text states the expected collation order as (acme, Ácido, Bravo, Zeta), but the actual pt-PT sensitivity:'base' output — independently reproduced by QA via node -e — is ['Ácido','acme','Bravo','Zeta'], which is exactly what the shipped sort.ts helper and sort.test.ts assert. Implementation and tests already satisfy the plan's algorithmic intent (localeCompare pt-PT base); only the prose example was incorrect. Resolve by amending the plan text — no product-code change.", source_plan: "01-01-PLAN.md"}
known_issues_input:
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx","error":"Calling setState synchronously within an effect (form-reset useEffect, line 124 post-change / 202 on HEAD) — pre-existing on the committed version, in code not touched by this plan"}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx","error":"Calling setState synchronously within an effect (form-reset useEffect, line 124) — reproduced on HEAD via `npx eslint AssignmentModal.tsx`; pre-existing, in code this plan did not touch (touched lines are the ClientCombobox call sites, not the effect body)."}'
known_issue_resolutions:
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx","error":"Calling setState synchronously within an effect (form-reset useEffect, line 124 post-change / 202 on HEAD) — pre-existing on the committed version, in code not touched by this plan","disposition":"accepted-process-exception","rationale":"Pre-existing react-hooks/set-state-in-effect finding in the AssignmentModal form-reset useEffect, reproduced on HEAD. Phase 1 only touched the ClientCombobox call sites, not the effect body, so this is not a regression. Out of scope for this dropdown-order/search phase, non-blocking, and remains visible via the summary/STATE backlog."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/features/schedule/components/AssignmentModal.tsx","error":"Calling setState synchronously within an effect (form-reset useEffect, line 124) — reproduced on HEAD via `npx eslint AssignmentModal.tsx`; pre-existing, in code this plan did not touch (touched lines are the ClientCombobox call sites, not the effect body).","disposition":"accepted-process-exception","rationale":"Same pre-existing react-hooks/set-state-in-effect finding as reported by QA verification, reproduced on HEAD via npx eslint. It lives in untouched code (the form-reset effect); Phase 1 only modified the ClientCombobox call sites. Out of scope for this phase, non-blocking, and stays tracked in the summary/STATE backlog."}'
must_haves:
  truths:
    - "01-01-PLAN.md's sort-test prose states the correct pt-PT sensitivity:'base' expected order ['Ácido','acme','Bravo','Zeta'], matching the shipped sort.ts helper and sort.test.ts assertions."
    - "No product-code file is modified by this remediation round; only the planning artifact 01-01-PLAN.md is edited."
  artifacts:
    - path: ".vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md"
      provides: "Corrected sort-test example prose and a recorded DEVN-01 resolution rationale"
      contains: "['Ácido','acme','Bravo','Zeta']"
  key_links: []
---
<objective>
Close the QA PARTIAL for Phase 1 round 01. The single FAIL (DEV-01 / DEVN-01) is a plan-text defect, not a code defect: the shipped sort.ts helper and sort.test.ts already produce and assert the correct pt-PT sensitivity:'base' collation order ['Ácido','acme','Bravo','Zeta'], but the prose example in 01-01-PLAN.md wrongly states (acme, Ácido, Bravo, Zeta). Amend the plan prose to the correct expected order and record the resolution rationale, marking DEVN-01 resolved-by-amendment. Make NO product-code change. The 2 carried pre-existing ESLint known issues (react-hooks/set-state-in-effect in AssignmentModal's untouched form-reset useEffect) are accepted as process exceptions and remain tracked.
</objective>
<context>
@.vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md
@.vbw-planning/phases/01-client-dropdown-order-search/01-VERIFICATION.md
The FAIL is DEV-01 (DEVN-01): 01-01-PLAN.md task "Add shared sortClientsByName helper + unit test" describes the fixture ['Zeta','acme','Ácido','Bravo'] as sorting to "(acme, Ácido, Bravo, Zeta)". QA independently reproduced the actual localeCompare('pt-PT', { sensitivity: 'base' }) output as ['Ácido','acme','Bravo','Zeta'] via node -e, which is exactly what the implemented helper and sort.test.ts assert. This is a wrong illustrative example in plan prose; the code and tests are correct and already verified (29/30 PASS). Only the plan text needs correcting.
</context>
<tasks>
<task type="auto">
  <name>Amend 01-01-PLAN sort-example prose and record DEVN-01 resolution</name>
  <files>
    .vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md
  </files>
  <action>
In .vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md, locate the sort-test task action text (task "Add shared sortClientsByName helper + unit test") that reads: "sorts to case/accent-insensitive order (acme, Ácido, Bravo, Zeta)". Replace the wrong expected order with the correct pt-PT sensitivity:'base' collation output: ['Ácido','acme','Bravo','Zeta']. Do NOT change any other prose, the algorithm description (localeCompare(b, 'pt-PT', { sensitivity: 'base' })), or any code/test content.
Additionally, append a short DEVN-01 resolution note to the plan (e.g. an HTML comment or a brief "Deviations" line near the amended task) recording: "DEVN-01 resolved-by-amendment (QA round 01): the plan's prior example order (acme, Ácido, Bravo, Zeta) was an incorrect illustration; the correct pt-PT sensitivity:'base' output is ['Ácido','acme','Bravo','Zeta'], which the shipped sort.ts helper and sort.test.ts already implement and assert. Implementation/tests were correct; only the illustrative example text was wrong. No product-code change."
Make NO changes to any product-code or test file — this is a planning-artifact edit only.
  </action>
  <verify>
grep -n "\['Ácido','acme','Bravo','Zeta'\]" .vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md   (correct order now present)
grep -n "acme, Ácido, Bravo, Zeta" .vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md   (returns nothing — wrong order removed)
grep -n "DEVN-01 resolved-by-amendment" .vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md   (resolution note recorded)
git status --porcelain   (only 01-01-PLAN.md shown as modified; no frontend/ product-code files touched)
  </verify>
  <done>
01-01-PLAN.md's sort-test prose states the correct expected order ['Ácido','acme','Bravo','Zeta']; the wrong (acme, Ácido, Bravo, Zeta) text is gone; a DEVN-01 resolved-by-amendment note with rationale is recorded; no product-code or test files are modified.
  </done>
</task>
</tasks>
<verification>
1. grep -n "\['Ácido','acme','Bravo','Zeta'\]" .vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md returns the corrected example.
2. grep -n "acme, Ácido, Bravo, Zeta" .vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md returns nothing.
3. grep -n "DEVN-01 resolved-by-amendment" .vbw-planning/phases/01-client-dropdown-order-search/01-01-PLAN.md confirms the rationale note.
4. git status --porcelain shows only 01-01-PLAN.md modified — no frontend/ product-code changes.
</verification>
<success_criteria>
- DEVN-01 is resolved-by-amendment: 01-01-PLAN.md now states the correct pt-PT sensitivity:'base' order ['Ácido','acme','Bravo','Zeta'] and records the rationale that implementation/tests were already correct.
- No product-code or test file is modified in this round (the code was verified correct at 29/30 PASS).
- Both carried pre-existing ESLint known issues are dispositioned accepted-process-exception and remain tracked in the summary/STATE backlog.
</success_criteria>
<known_issue_workflow>
- Both carried known issues (the two react-hooks/set-state-in-effect findings in frontend/src/features/schedule/components/AssignmentModal.tsx) appear verbatim in `known_issues_input` and each has a matching `accepted-process-exception` entry in `known_issue_resolutions`.
- Rationale for acceptance: pre-existing on committed HEAD, reproduced independently, located in code Phase 1 did not touch (the form-reset useEffect, not the ClientCombobox call sites), out of scope for this dropdown-order/search phase, non-blocking, and remaining visible via the summary/STATE backlog.
- No known issue is omitted; both remain tracked rather than silently dropped.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
