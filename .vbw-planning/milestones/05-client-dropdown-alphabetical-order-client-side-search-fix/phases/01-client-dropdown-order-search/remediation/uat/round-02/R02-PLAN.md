---
phase: 1
round: 2
plan: R02
title: Client Dropdown UAT round-02 remediation (trigger hover + sentinel-while-searching)
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - frontend/src/components/client-combobox.tsx
  - frontend/src/features/schedule/components/AssignmentModal.tsx
  - frontend/src/components/__tests__/client-combobox.test.tsx
  - frontend/src/features/board/components/__tests__/BoardFilters.test.tsx
forbidden_commands: []
fail_classifications:
  - {id: "UAT-2b", type: "code-fix", rationale: "Recurring (2nd attempt). Round-01 fix targeted the wrong element (item rows). Real cause is the trigger Button variant=outline hover:bg-accent classes. Corrective code change to neutralize trigger hover."}
  - {id: "UAT-1b", type: "code-fix", rationale: "Corrected spec from R01-UAT: sentinel visibility must key off search-text emptiness, not selection/mode. Corrective code change replacing the round-01 rule and removing the now-vestigial sentinelMode prop."}
known_issues_input: []
known_issue_resolutions: []
must_haves:
  truths:
    - "Combobox trigger no longer changes background/text on hover (matches SelectTrigger which has no hover: classes)"
    - "Sentinel row is visible when the search box is empty and hidden while search text is present — identical for assignment ('No client') and board ('All clients')"
    - "The sentinelMode prop no longer exists anywhere (interface, default, call sites, tests)"
    - "Selection/save/board-filter behavior (originally P01-T03) still works — no regression"
  artifacts:
    - {path: "frontend/src/components/client-combobox.tsx", provides: "hover-neutralized trigger + search-driven sentinel", contains: "hover:bg-transparent"}
    - {path: "frontend/src/components/client-combobox.tsx", provides: "search-driven sentinel visibility", contains: "const showSentinel = !search"}
    - {path: "frontend/src/features/schedule/components/AssignmentModal.tsx", provides: "no sentinelMode call sites", contains: "ClientCombobox"}
    - {path: "frontend/src/components/__tests__/client-combobox.test.tsx", provides: "tests encode !search rule, no sentinelMode refs", contains: "sentinel"}
  key_links:
    - {from: "frontend/src/components/client-combobox.tsx", to: "frontend/src/components/ui/button.tsx", via: "trigger overrides outline variant hover classes"}
    - {from: "frontend/src/features/schedule/components/AssignmentModal.tsx", to: "frontend/src/components/client-combobox.tsx", via: "both ClientCombobox call sites (main + split) no longer pass sentinelMode"}
---
<objective>
Fix two precisely-diagnosed UAT round-01 regressions in the shared ClientCombobox, both client-side only, both in frontend/src/components/client-combobox.tsx:

- UAT-2b (RECURRING — 2nd attempt): the round-01 fix wrongly targeted item rows. The real cause is the trigger Button variant="outline" carrying hover:bg-accent hover:text-accent-foreground, producing a weird hover fill. Override the trigger's hover classes to be inert so it matches the pentesters SelectTrigger (which has no hover styling). Item-row focus:bg-accent styling stays untouched.
- UAT-1b: replace the round-01 sentinel rule (sentinelMode === 'always' || value !== null) with `showSentinel = !search` (sentinel shown when search box empty, hidden while typing) — identical for both usages — and REMOVE the now-vestigial sentinelMode prop entirely (interface field, default, doc comment, both AssignmentModal call sites). BoardFilters relied on the 'always' default and now simply gets the shared !search behavior (confirmed desired: "All clients" also hides while searching).

No backend/deps. Keep sort/search/pinning/swatch working. No regression to selection/save/filter (P01-T03).
</objective>
<context>
@.vbw-planning/phases/01-client-dropdown-order-search/remediation/uat/round-02/R02-RESEARCH.md
Root-cause research (high confidence, static reads) — do not re-derive. All file:line references and the minimal-change recommendations (approach 1 for UAT-2b) are authoritative.
@.vbw-planning/phases/01-client-dropdown-order-search/remediation/uat/round-01/R01-UAT.md
UAT re-verification that produced UAT-1b (corrected spec) and UAT-2b (recurring hover).
Note: frontend/package.json has NO test/typecheck npm scripts. Run verification via binaries directly from frontend/: `npx tsc -b --noEmit` and `npx vitest run`.
</context>
<tasks>
<!-- Tasks are executed sequentially — task 2 sees task 1's result. -->
<task type="auto">
  <name>UAT-2b: neutralize combobox trigger hover to match SelectTrigger</name>
  <files>
    frontend/src/components/client-combobox.tsx
  </files>
  <action>
In the trigger Button (client-combobox.tsx ~line 99-103), keep variant="outline" and all Popover/Button wiring, but append hover-neutralizing classes to the trigger's own className so tailwind-merge overrides the outline variant's `hover:bg-accent hover:text-accent-foreground`. Per research (approach 1 — smallest diff):

    className={cn(
      'w-full justify-start font-normal hover:bg-transparent hover:text-foreground',
      triggerClassName,
    )}

This is the RECURRING UAT-2b — the round-01 attempt wrongly changed item rows. Do NOT touch the item-row / sentinel-row focus:bg-accent styling (lines ~144, ~158); the user did not complain about rows. Only the trigger changes here.
  </action>
  <verify>
Confirm the trigger className string contains `hover:bg-transparent hover:text-foreground` and still contains `w-full justify-start font-normal` and `triggerClassName`. Confirm item-row and sentinel-row className strings are unchanged (still `focus:bg-accent focus:text-accent-foreground`). Run `npx tsc -b --noEmit` from frontend/ — no new type errors.
  </verify>
  <done>
Trigger hover classes overridden to inert values; item rows untouched; tsc clean.
  </done>
</task>
<task type="auto">
  <name>UAT-1b: sentinel keyed off search text + remove sentinelMode prop + update tests</name>
  <files>
    frontend/src/components/client-combobox.tsx
    frontend/src/features/schedule/components/AssignmentModal.tsx
    frontend/src/components/__tests__/client-combobox.test.tsx
    frontend/src/features/board/components/__tests__/BoardFilters.test.tsx
  </files>
  <action>
1. In client-combobox.tsx replace the visibility rule at ~line 78 with:
     const showSentinel = !search
   (matches existing `filtered = search ? ...` truthy style — no trim needed).
2. Remove the sentinelMode prop ENTIRELY (it collapses to one behavior):
   - Delete the `sentinelMode?: 'always' | 'clear'` field from the ClientComboboxProps interface (~line 28-35).
   - Delete `sentinelMode = 'always'` from the destructured params (~line 65).
   - Remove `selected`/`value`-based sentinel wording from the doc comments (~lines 28-35 field doc and ~lines 52-56 behavior block, plus the inline comment at ~line 139-140). Replace with one sentence: "the sentinel is always visible except while the user has typed search text."
   - Note: `value` is still used elsewhere (`selected`, current-selection highlight) — only remove sentinelMode-related usage, not `value` itself.
3. In AssignmentModal.tsx remove `sentinelMode="clear"` from BOTH ClientCombobox call sites (main ~line 325 and split ~line 410). Leave sentinelLabel="No client" and all other props intact.
4. Update tests in client-combobox.test.tsx to the new `!search` rule and drop all sentinelMode references:
   - Test (e) (~91-111): change so sentinel is visible when search empty, and HIDDEN once search text is typed (after fireEvent.change to a non-empty value, the sentinel label should no longer appear as a list-row button).
   - Test (h) (~130-137): drop the `sentinelMode="always"` arg; becomes "default shows sentinel when search empty".
   - Test (i) (~139-148): rewrite (or delete) — it encoded the obsolete clear-only rule; replace with "sentinel hidden while search has text regardless of selection".
   - Test (j) (~150-163): rewrite (or delete) — obsolete value-driven semantics; new behavior shows sentinel regardless of value when search empty. Any unrelated trigger-label assertion may be kept/repurposed.
   - Ensure NO remaining `sentinelMode` references in the test file.
   - Tests (a)-(d),(f),(g) are unaffected — leave content, just confirm still passing.
5. In BoardFilters.test.tsx add a cheap parity assertion: after typing search text, the "All clients" sentinel disappears from the list-button set (only the trigger button carries that label). Existing tests unaffected.
  </action>
  <verify>
grep for `sentinelMode` across frontend/src returns ZERO matches. Confirm client-combobox.tsx contains `const showSentinel = !search`. Run from frontend/: `npx tsc -b --noEmit` (no errors) and `npx vitest run` (all pass, including the rewritten client-combobox tests and new BoardFilters parity assertion).
  </verify>
  <done>
sentinelMode fully removed; showSentinel keys off `!search`; both AssignmentModal call sites updated; tests rewritten to the new rule with board hide-while-searching coverage; tsc + vitest green.
  </done>
</task>
</tasks>
<verification>
1. From frontend/: `npx tsc -b --noEmit` exits 0 (no type errors from removed prop / changed classes).
2. From frontend/: `npx vitest run` — all tests pass, including rewritten client-combobox sentinel tests and new BoardFilters hide-while-searching assertion.
3. `grep -rn "sentinelMode" frontend/src` returns no matches (prop fully removed).
4. Trigger className in client-combobox.tsx contains `hover:bg-transparent hover:text-foreground`; item/sentinel-row `focus:bg-accent` styling unchanged.
5. Manual/visual (Dev best-effort): trigger no longer fills on hover; sentinel visible when search empty and hidden while typing for BOTH assignment ("No client") and board ("All clients").
</verification>
<success_criteria>
- UAT-2b resolved: combobox trigger has no hover background/text change (matches pentesters SelectTrigger); fix is on the TRIGGER, not item rows.
- UAT-1b resolved: sentinel visible when search empty, hidden while search text present — identical for assignment and board usages.
- sentinelMode prop removed everywhere; no dead code or stale doc comments referencing it.
- No regression: sort, search, pinning, color swatch, and selection/save/board-filter (P01-T03) all still work.
- tsc and vitest both green from frontend/.
</success_criteria>
<known_issue_workflow>
- No carried test known issues from QA for this phase — both `known_issues_input` and `known_issue_resolutions` are empty arrays. The two items addressed (UAT-1b, UAT-2b) are UAT re-verification failures tracked via `fail_classifications`, not QA test known-issues.
</known_issue_workflow>
<output>
R02-SUMMARY.md
</output>
