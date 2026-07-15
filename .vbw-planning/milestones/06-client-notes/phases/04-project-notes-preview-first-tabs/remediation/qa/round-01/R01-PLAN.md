---
phase: 04
round: 1
plan: R01
title: Amend 04-01 Task 3 to document as-built Radix Tabs test approach (DEVN-01 + DEVN-02)
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - .vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md
forbidden_commands: []
fail_classifications:
  - {id: "DEVN-01-FM", type: "plan-amendment", rationale: "The delivered tests correctly activate the Edit tab via fireEvent.mouseDown because Radix Tabs triggers activate on mousedown, not a bare click; tsc is clean and 92/92 pass. The original plan's Task 3 simply did not anticipate this Radix interaction primitive. The correct fix is to amend Task 3 to document the as-built mousedown activation, not to change product code or tests.", source_plan: "04-01-PLAN.md"}
  - {id: "DEVN-01-TASK", type: "plan-amendment", rationale: "Per-task restatement of the same DEVN-01 divergence (Edit-tab activation uses fireEvent.mouseDown). Same underlying fact, re-verified green. Resolved by amending Task 3's description/acceptance to specify the mousedown activation primitive; no code or test change is warranted.", source_plan: "04-01-PLAN.md"}
  - {id: "DEVN-02-FM", type: "plan-amendment", rationale: "Under previewFirst, Radix unmounts the inactive Edit tab (no forceMount), so the project textarea is not in the DOM on mount; CardDetailModal cases (a)/(b) incidental project-notes assertions were validly switched from getByDisplayValue (textarea) to getByText (Preview markdown). The client-notes assertions (the cases' real purpose) and cases (c)/(d) are unchanged, and the suite is green. The plan's 'keep (a)-(d) unchanged' directive assumed the textarea stayed mounted; fix is to amend Task 3, not to revert correct tests.", source_plan: "04-01-PLAN.md"}
  - {id: "DEVN-02-TASK", type: "plan-amendment", rationale: "Per-task restatement of the same DEVN-02 divergence (cases (a)/(b) assertions moved to getByText due to Radix unmounting the inactive Edit tab). Same underlying fact, re-verified green. Resolved by amending Task 3 to document the unmount rationale and the getByText assertion approach; no code or test change is warranted.", source_plan: "04-01-PLAN.md"}
known_issues_input: []
known_issue_resolutions: []
must_haves:
  truths:
    - "04-01-PLAN.md Task 3 documents that Edit-tab activation in tests uses fireEvent.mouseDown because Radix Tabs triggers activate on mousedown, not a bare click."
    - "04-01-PLAN.md Task 3 documents that under previewFirst Radix unmounts the inactive Edit tab (no forceMount), so CardDetailModal cases (a)/(b) incidental project-notes assertions use getByText (Preview markdown) instead of getByDisplayValue (textarea), while the client-notes assertions and cases (c)/(d) remain unchanged."
    - "04-01-PLAN.md records DEVN-01 and DEVN-02 as resolved-by-amendment (the as-built approach is now the specified approach)."
    - "No product code or test file is modified by this remediation round; only the planning artifact 04-01-PLAN.md changes."
  artifacts:
    - path: ".vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md"
      provides: "amended Task 3 documenting the as-built Radix Tabs test approach (mousedown activation + unmount-driven getByText), with DEVN-01/DEVN-02 marked resolved-by-amendment"
      contains: "fireEvent.mouseDown"
  key_links:
    - from: ".vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md"
      to: ".vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-SUMMARY.md"
      via: "amended Task 3 approach now matches the delivered SUMMARY deviations DEVN-01/DEVN-02"
---
<objective>
Remediate the 4 FAIL checks (DEVN-01-FM, DEVN-01-TASK, DEVN-02-FM, DEVN-02-TASK) from
04-VERIFICATION.md as plan-amendments. The delivered code and tests are correct and were
re-verified green (tsc clean, 92/92 passing); the two deviations are valid, necessary
adaptations to Radix Tabs' actual runtime behavior that the original plan did not anticipate.
The fix is to AMEND the original plan (04-01-PLAN.md) Task 3 so it documents the actual,
as-built test approach — NOT to change any product code or test. After the amendment, the
plan's specified approach matches what was delivered, and DEVN-01/DEVN-02 are resolved by
amendment.
</objective>
<context>
@.vbw-planning/phases/04-project-notes-preview-first-tabs/04-VERIFICATION.md
@.vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md
@.vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-SUMMARY.md
Key facts (do not re-derive):
- DEVN-01: Radix Tabs triggers activate on mousedown (left button), not a bare click, so the
  Edit-activation step in tests uses fireEvent.mouseDown rather than fireEvent.click.
- DEVN-02: under previewFirst Radix unmounts the inactive Edit tab's content (no forceMount),
  so the project textarea is not in the DOM on mount; CardDetailModal cases (a)/(b) incidental
  project-notes assertions were switched from getByDisplayValue('Project note body') (textarea)
  to getByText('Project note body') (Preview markdown). The client-notes assertions (the cases'
  real purpose) and cases (c)/(d) are unchanged.
- Re-verified state at HEAD 0631dad: `npx tsc --noEmit` clean; full frontend suite 92/92 pass.
</context>
<tasks>
<task type="auto">
  <name>Amend 04-01-PLAN.md Task 3 to document the as-built Radix Tabs test approach</name>
  <files>
    .vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md
  </files>
  <action>
Edit ONLY the planning artifact `04-01-PLAN.md`. Do NOT touch any product code or test file.

In Task 3 ("Test coverage: default Edit-first regression + previewFirst Preview-first"),
amend the <action>, <verify>, and <done> sections so the plan documents the actual, as-built
approach:

1. Edit-tab activation (DEVN-01): State explicitly that any step that activates the Edit tab
   in the tests uses `fireEvent.mouseDown` (NOT `fireEvent.click`), because Radix Tabs triggers
   activate on mousedown (left button), not on a bare click. This applies to the NotesEditor
   "keeps Edit functional" case and CardDetailModal case (e).

2. CardDetailModal cases (a)/(b) (DEVN-02): Replace the directive "Keep the existing Phase-03
   read-only client-notes cases (a)-(d) unchanged" with the as-built reality: under
   `previewFirst`, Radix unmounts the inactive Edit tab's content (no `forceMount`), so the
   project textarea is not in the DOM on mount. Therefore cases (a) and (b) have their
   INCIDENTAL project-notes assertions changed from `getByDisplayValue('Project note body')`
   (textarea) to `getByText('Project note body')` (Preview markdown). Make clear that the
   client-notes assertions — the actual purpose of these cases — remain unchanged, and cases
   (c) and (d) remain fully unchanged.

3. Add a brief note (in Task 3 or an adjacent Deviations/Amendments note in the plan) marking
   DEVN-01 and DEVN-02 as resolved-by-amendment: the as-built approach described above is now
   the plan's specified approach, so the SUMMARY's declared deviations no longer diverge from
   the plan.

Keep all other Task 3 intent intact (strengthened default Edit-first regression cases; new
previewFirst Preview-first cases; CardDetailModal case (e) proving Preview-first). Do not alter
Tasks 1 or 2, the frontmatter must_haves, or the objective beyond what is needed to reflect the
mousedown + getByText/unmount rationale.
  </action>
  <verify>
`grep -n "fireEvent.mouseDown" .vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md`
shows the mousedown activation rationale is now documented in Task 3.
`grep -n "getByText" .vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md`
and `grep -n "unmount" .vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md`
show the previewFirst-unmount / getByText rationale for cases (a)/(b) is documented.
`grep -niE "DEVN-01|DEVN-02" .vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md`
shows both deviations are referenced as resolved-by-amendment.
`git diff --name-only` shows ONLY `04-01-PLAN.md` changed — no product code or test files.
  </verify>
  <done>
04-01-PLAN.md Task 3 now specifies (1) fireEvent.mouseDown Edit-tab activation because Radix
activates on mousedown, and (2) the previewFirst-driven unmount of the inactive Edit tab causing
cases (a)/(b) to use getByText (Preview markdown) instead of getByDisplayValue (textarea), with
client-notes assertions and cases (c)/(d) unchanged; DEVN-01 and DEVN-02 are marked
resolved-by-amendment. No product code or test file was modified.
  </done>
</task>
</tasks>
<verification>
1. `grep -n "fireEvent.mouseDown" .vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md` — mousedown activation rationale present (DEVN-01).
2. `grep -nE "getByText|unmount|forceMount" .vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md` — getByText / inactive-tab-unmount rationale present for cases (a)/(b) (DEVN-02).
3. `grep -niE "DEVN-01|DEVN-02" .vbw-planning/phases/04-project-notes-preview-first-tabs/04-01-PLAN.md` — both deviations marked resolved-by-amendment.
4. `git diff --name-only` — ONLY 04-01-PLAN.md changed; no frontend product code or test files modified.
</verification>
<success_criteria>
- 04-01-PLAN.md Task 3 documents fireEvent.mouseDown Edit-tab activation (Radix activates on mousedown), resolving DEVN-01-FM and DEVN-01-TASK by amendment.
- 04-01-PLAN.md Task 3 documents the previewFirst-driven unmount of the inactive Edit tab and the resulting getByText (Preview markdown) assertions for cases (a)/(b), with client-notes assertions and cases (c)/(d) unchanged, resolving DEVN-02-FM and DEVN-02-TASK by amendment.
- The amended plan's specified test approach matches the delivered SUMMARY deviations.
- No product code or test file is modified by this round; only 04-01-PLAN.md changes.
</success_criteria>
<known_issue_workflow>
- This is a verification-only round with NO tracked known issues: `known_issues_input: []` and `known_issue_resolutions: []`.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
</content>
</invoke>
