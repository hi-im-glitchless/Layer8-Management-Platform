---
phase: 2
round: 1
plan: R01
title: Phase 02 QA Remediation R01 — amend 02-02 plan snippet, accept pre-existing Sidebar ESLint findings
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - .vbw-planning/phases/02-client-notes-tool-page/02-02-PLAN.md
forbidden_commands: []
fail_classifications:
  - {id: "DEV-01", type: "plan-amendment", rationale: "The as-built useUpdateClientNotes (hooks.ts:335-347) wires onError to handleMutationError exactly like all 18 other mutations in hooks.ts; QA verified this addition does not alter the documented mutationFn/unwrap('r.client')/invalidate(['schedule','client-notes',id]) contract. The code is correct and stripping onError would make it the only unhandled-error mutation in the file. The defect is purely that 02-02-PLAN.md Task 2 records a snippet that omits onError. Resolve by amending the plan to record the as-built snippet, not by changing code.", source_plan: "02-02-PLAN.md"}
known_issues_input:
  - '{"test":"eslint react-hooks/preserve-manual-memoization + exhaustive-deps","file":"frontend/src/components/layout/Sidebar.tsx","error":"Lines 84-87: visibleGroups useMemo flagged for manual-memoization + missing userHasRole dep. Pre-existing on untouched lines; newer react-hooks ruleset flagging long-standing code. Out of scope; not fixed."}'
  - '{"test":"eslint react-hooks/preserve-manual-memoization + exhaustive-deps","file":"frontend/src/components/layout/Sidebar.tsx","error":"Lines 84-87: visibleGroups useMemo flagged for manual-memoization + missing userHasRole dep. Verified via git diff 98c406d..HEAD that this phases only Sidebar.tsx edits are the NotebookPen import and the one nav item line; lines 84-87 are untouched."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/components/layout/Sidebar.tsx","error":"Line 94: Avoid calling setState() directly within an effect (localStorage collapsed-state load). Pre-existing on code untouched by this plan — git diff 98c406d..HEAD shows my only Sidebar edits are the NotebookPen import and the nav item. Out of scope; not fixed."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/components/layout/Sidebar.tsx","error":"Line 94: Avoid calling setState() directly within an effect (localStorage collapsed-state load). Verified via git diff 98c406d..HEAD that line 94 is untouched by this phase."}'
known_issue_resolutions:
  - '{"test":"eslint react-hooks/preserve-manual-memoization + exhaustive-deps","file":"frontend/src/components/layout/Sidebar.tsx","error":"Lines 84-87: visibleGroups useMemo flagged for manual-memoization + missing userHasRole dep. Pre-existing on untouched lines; newer react-hooks ruleset flagging long-standing code. Out of scope; not fixed.","disposition":"accepted-process-exception","rationale":"QA independently confirmed via git diff 98c406d..HEAD that lines 84-87 are byte-identical to baseline — Phase 02 only added the NotebookPen import and one nav item. The visibleGroups useMemo governs role-based sidebar group filtering, which has no test coverage; refactoring its memoization/deps to satisfy the newer react-hooks ruleset risks silently changing which groups render. Fixing is out of this phase boundary and unsafe. Repo precedent DEVN-05 (react-refresh/only-export-components on KanbanCard.tsx) is already accepted as non-blocking, establishing legitimate grounds to accept a pre-existing ESLint finding on untouched code."}'
  - '{"test":"eslint react-hooks/preserve-manual-memoization + exhaustive-deps","file":"frontend/src/components/layout/Sidebar.tsx","error":"Lines 84-87: visibleGroups useMemo flagged for manual-memoization + missing userHasRole dep. Verified via git diff 98c406d..HEAD that this phases only Sidebar.tsx edits are the NotebookPen import and the one nav item line; lines 84-87 are untouched.","disposition":"accepted-process-exception","rationale":"Same finding as the 02-03-SUMMARY entry, re-observed at verification time. QA re-confirmed lines 84-87 untouched by Phase 02. The visibleGroups useMemo drives untested role-based group filtering; a memoization/deps rewrite risks behaviour change with no regression net. Out of phase boundary; accepted as non-blocking under the DEVN-05 precedent for pre-existing ESLint findings on code this phase did not modify."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/components/layout/Sidebar.tsx","error":"Line 94: Avoid calling setState() directly within an effect (localStorage collapsed-state load). Pre-existing on code untouched by this plan — git diff 98c406d..HEAD shows my only Sidebar edits are the NotebookPen import and the nav item. Out of scope; not fixed.","disposition":"accepted-process-exception","rationale":"QA independently confirmed via git diff 98c406d..HEAD that line 94 is byte-identical to baseline. This effect hydrates the sidebar collapsed-state from localStorage; reworking it to avoid setState-in-effect (e.g. lazy initial state) risks changing initial collapse behaviour, which has no test coverage. Fixing is out of this phase boundary and unsafe. Accepted as non-blocking under the DEVN-05 precedent for pre-existing ESLint findings on untouched code."}'
  - '{"test":"eslint react-hooks/set-state-in-effect","file":"frontend/src/components/layout/Sidebar.tsx","error":"Line 94: Avoid calling setState() directly within an effect (localStorage collapsed-state load). Verified via git diff 98c406d..HEAD that line 94 is untouched by this phase.","disposition":"accepted-process-exception","rationale":"Same finding as the 02-03-SUMMARY entry, re-observed at verification time. QA re-confirmed line 94 untouched by Phase 02. The effect hydrates collapsed-state from localStorage; a fix risks altering untested initial sidebar collapse behaviour. Out of phase boundary; accepted as non-blocking under the DEVN-05 precedent for pre-existing ESLint findings on code this phase did not modify."}'
must_haves:
  truths:
    - "02-02-PLAN.md Task 2's useUpdateClientNotes snippet includes the as-built line `onError: (error: Error) => handleMutationError(error, 'Failed to save client notes'),`, so the recorded plan matches hooks.ts:335-347 byte-for-byte."
    - "02-02-PLAN.md records a rationale that the onError handler mirrors the file-wide handleMutationError convention (18 sibling mutations) and does not change the mutationFn/unwrap('r.client')/invalidate(['schedule','client-notes',id]) contract — DEV-01 is resolved by plan amendment, not by editing product code."
    - "No file under frontend/ or backend/ is modified in this round; the onError handler in hooks.ts is left exactly as built; the 82/82 frontend suite is untouched."
  artifacts:
    - path: ".vbw-planning/phases/02-client-notes-tool-page/02-02-PLAN.md"
      provides: "amended Task 2 snippet + DEV-01 resolution note recording the as-built onError handler"
      contains: "handleMutationError(error, 'Failed to save client notes')"
  key_links:
    - from: ".vbw-planning/phases/02-client-notes-tool-page/02-02-PLAN.md"
      to: "frontend/src/features/schedule/hooks.ts"
      via: "amended plan snippet now reproduces the as-built useUpdateClientNotes (incl. onError) at hooks.ts:335-347"
---
<objective>
Close Phase 02 QA round 01. One FAIL (DEV-01) and four tracked known issues.

DEV-01 is a plan-amendment, not a code defect: the as-built `useUpdateClientNotes` (frontend/src/features/schedule/hooks.ts:335-347) adds an `onError` handler wired to `handleMutationError`, matching all 18 other mutations in the file; QA verified it does not change the mutationFn/unwrap/invalidate contract. The only defect is that 02-02-PLAN.md Task 2 still records a snippet that omits `onError`. Resolve by amending that plan to record the as-built snippet and rationale — do NOT strip onError, do NOT touch product code.

The four known issues are two distinct pre-existing ESLint react-hooks findings in Sidebar.tsx (each registered twice), both on lines QA confirmed untouched by Phase 02. They are dispositioned `accepted-process-exception` in frontmatter (no code task) — a fix would risk untested sidebar collapse / group-filtering behaviour and is out of this phase's boundary; the DEVN-05 ESLint acceptance is the governing precedent.
</objective>
<context>
@.vbw-planning/phases/02-client-notes-tool-page/02-VERIFICATION.md
@.vbw-planning/phases/02-client-notes-tool-page/02-02-PLAN.md
@.vbw-planning/phases/02-client-notes-tool-page/remediation/qa/round-01/R01-KNOWN-ISSUES.json
As-built reference (do NOT edit): frontend/src/features/schedule/hooks.ts:335-347 — useUpdateClientNotes, including `onError: (error: Error) => handleMutationError(error, 'Failed to save client notes'),`.
Constraints: no backend/** edits; do not weaken/delete any passing test (82/82); do not strip onError; do not add any projects fetch (descoped).
</context>
<tasks>
<task type="auto">
  <name>Amend 02-02-PLAN.md to record the as-built onError handler (resolve DEV-01)</name>
  <files>
    .vbw-planning/phases/02-client-notes-tool-page/02-02-PLAN.md
  </files>
  <action>
Edit 02-02-PLAN.md so the recorded plan matches the as-built code (this is the deterministic resolution of DEV-01 — the gate checks the original plan was amended, not the SUMMARY).

1. In Task 2 ("Add useClientNotes + useUpdateClientNotes hooks") <action>, inside the `useUpdateClientNotes` snippet, add the as-built onError line immediately after the `onSuccess` block's closing `},` and before the `})` that closes useMutation, so the snippet reads:

  export function useUpdateClientNotes() {
    const queryClient = useQueryClient()
    return useMutation({
      mutationFn: ({ id, notes }: { id: string; notes: string }) =>
        scheduleApi.updateClientNotes(id, notes).then((r) => r.client),  // unwrap the { client } envelope
      onSuccess: (_data, { id }) => {
        queryClient.invalidateQueries({ queryKey: ['schedule', 'client-notes', id] })
      },
      onError: (error: Error) => handleMutationError(error, 'Failed to save client notes'),  // file-wide error convention
    })
  }

2. In that same <action>, append a one-line as-built note, e.g.:
   "As-built note (DEV-01, R01): the onError handler above mirrors the identical handleMutationError pattern used by all 18 other mutations in hooks.ts; it is required for convention consistency and does not alter the mutationFn/unwrap('r.client')/invalidate(['schedule','client-notes',id]) contract."

3. In the frontmatter must_haves.truths of 02-02-PLAN.md, add a truth recording the onError handler, e.g.:
   "useUpdateClientNotes wires onError to handleMutationError(error, 'Failed to save client notes'), consistent with every other mutation in hooks.ts; this does not change the unwrap/invalidate contract."

Do NOT edit hooks.ts or any frontend/backend file. Only 02-02-PLAN.md changes.
  </action>
  <verify>
- `grep -n "handleMutationError(error, 'Failed to save client notes')" .vbw-planning/phases/02-client-notes-tool-page/02-02-PLAN.md` returns the amended snippet line.
- `grep -n "DEV-01" .vbw-planning/phases/02-client-notes-tool-page/02-02-PLAN.md` returns the as-built resolution note.
- `git diff --name-only` shows ONLY .vbw-planning/phases/02-client-notes-tool-page/02-02-PLAN.md changed — no frontend/ or backend/ file touched.
- The amended snippet matches frontend/src/features/schedule/hooks.ts:335-347 (onSuccess then onError, in that order).
  </verify>
  <done>
02-02-PLAN.md Task 2 snippet + must_haves record the as-built onError handler with a DEV-01 rationale; no product code changed. One commit: `docs(remediation): amend 02-02 plan to record as-built onError handler (DEV-01)`.
  </done>
</task>
</tasks>
<verification>
1. 02-02-PLAN.md now records the onError line and a DEV-01 as-built rationale; the plan snippet matches hooks.ts:335-347.
2. `git diff --name-only` for this round shows only the plan file changed — no frontend/backend edits, onError left intact, 82/82 suite untouched.
3. All four tracked known issues appear in both known_issues_input and known_issue_resolutions with byte-identical {test,file,error} and disposition accepted-process-exception.
4. DEV-01 is classified plan-amendment with source_plan 02-02-PLAN.md; no code-fix stripping onError was planned.
</verification>
<success_criteria>
- DEV-01 resolved by amending 02-02-PLAN.md to record the as-built onError handler and rationale — product code and passing tests untouched.
- The four pre-existing Sidebar ESLint findings are dispositioned accepted-process-exception with specific, credible rationales grounded in the untouched-lines git-diff evidence and the DEVN-05 precedent.
- Phase 02 QA round 01 can close without any backend change, without stripping onError, and without a projects fetch.
</success_criteria>
<known_issue_workflow>
- known_issues_input and known_issue_resolutions carry all four tracked issues (both registry duplicates of each of the two distinct findings), copied byte-for-byte from R01-KNOWN-ISSUES.json.
- All four dispositions are accepted-process-exception: QA-verified pre-existing on lines untouched by Phase 02, unsafe to fix within this phase's boundary (no test coverage for the affected sidebar behaviour), accepted under the DEVN-05 non-blocking-ESLint precedent.
- No known issue is carried unresolved; none is dropped.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
</output>
