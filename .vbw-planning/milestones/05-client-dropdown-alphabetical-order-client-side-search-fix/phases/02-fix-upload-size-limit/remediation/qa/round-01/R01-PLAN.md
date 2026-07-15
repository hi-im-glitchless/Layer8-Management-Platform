---
phase: 2
round: 1
plan: R01
title: Fix stale DeleteCardDialog expected-text assertion
type: remediation
autonomous: true
effort_override: fast
skills_used: []
files_modified: [frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx]
forbidden_commands: []
fail_classifications: []
known_issues_input:
  - '{"test":"DeleteCardDialog.test.tsx (unnamed shows destructive delete warning test)","file":"frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx:46","error":"TestingLibraryElementError: Unable to find element with text matching /permanently deletes the card and all attached.../i - actual rendered text is This permanently deletes the card, the project, and all its linked schedule assignments (for all pentesters), along with all attached comments, notes, and files. Text/copy drifted from what the test expects. Predates Phase 2 (component/test last touched in commits 41e08eb/687a82c/195840b, none of which are part of this phases b764f97/4a48358/735a581/b6cc33c, and DeleteCardDialog.tsx/test.tsx are not in files_modified for 02-01)."}'
known_issue_resolutions:
  - '{"test":"DeleteCardDialog.test.tsx (unnamed shows destructive delete warning test)","file":"frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx:46","error":"TestingLibraryElementError: Unable to find element with text matching /permanently deletes the card and all attached.../i - actual rendered text is This permanently deletes the card, the project, and all its linked schedule assignments (for all pentesters), along with all attached comments, notes, and files. Text/copy drifted from what the test expects. Predates Phase 2 (component/test last touched in commits 41e08eb/687a82c/195840b, none of which are part of this phases b764f97/4a48358/735a581/b6cc33c, and DeleteCardDialog.tsx/test.tsx are not in files_modified for 02-01).","disposition":"resolved","rationale":"Fixed the stale expected-text assertion to match current DeleteCardDialog copy; test now passes."}'
must_haves:
  truths:
    - "The DeleteCardDialog test suite passes: the destructive-warning assertion matches the current dialog copy."
    - "DeleteCardDialog.tsx component copy is unchanged — only the test expectation is updated."
  artifacts:
    - path: "frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx"
      provides: "Updated expected-text assertion matching current dialog copy"
      contains: "permanently deletes the card, the project"
  key_links:
    - from: "frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx"
      to: "frontend/src/features/board/components/DeleteCardDialog.tsx"
      via: "asserts on a stable substring of the rendered AlertDialogDescription copy"
---
<objective>
Resolve the one tracked known issue for Phase 2. This round has NO verification FAILs; it exists solely to fix a pre-existing stale test. The DeleteCardDialog test at line 46 asserts obsolete warning copy (/permanently deletes the card and all attached.../i) that no longer matches the current dialog text. Update the test's expected-text assertion to match the current rendered copy, asserting on a stable substring so it is robust. Do NOT change the DeleteCardDialog component copy — only the test expectation. After the fix the DeleteCardDialog suite must pass.
</objective>
<context>
@frontend/src/features/board/components/DeleteCardDialog.tsx
@frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx
Current rendered copy (assignmentCount omitted → fallback branch): "This permanently deletes the card, the project, and all its linked schedule assignments (for all pentesters), along with all attached comments, notes, and files. This cannot be undone." The test renders without assignmentCount, so the fallback branch is what appears. A stable substring to assert on is "permanently deletes the card, the project" (avoids brittle full-string matching while still proving the permanent-delete warning renders).
</context>
<tasks>
<task type="auto">
  <name>Update stale destructive-warning assertion in DeleteCardDialog test</name>
  <files>
    frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx
  </files>
  <action>
In the test "(1) renders the permanent-delete warning text and the project name when open" (around line 45-47), replace the stale matcher `/permanently deletes the card and all attached comments/i` with a stable substring that matches the current DeleteCardDialog copy: `/permanently deletes the card, the project/i`. Leave the `/cannot be undone/i` assertion and the project-name assertion unchanged. Do NOT edit DeleteCardDialog.tsx — the component copy is correct; only the test expectation is stale.
  </action>
  <verify>
Run the DeleteCardDialog suite from the frontend directory: `cd frontend && npx vitest run src/features/board/components/__tests__/DeleteCardDialog.test.tsx`. All three tests must pass. Confirm via grep that the stale matcher is gone: `grep -n "and all attached comments" frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx` returns no match, and `grep -n "permanently deletes the card, the project" frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx` returns the updated line.
  </verify>
  <done>
DeleteCardDialog.test.tsx asserts on the current dialog copy substring; the full DeleteCardDialog suite passes; DeleteCardDialog.tsx is unmodified.
  </done>
</task>
</tasks>
<verification>
1. `cd frontend && npx vitest run src/features/board/components/__tests__/DeleteCardDialog.test.tsx` — suite passes (3/3).
2. `git diff --name-only` includes only DeleteCardDialog.test.tsx (component file untouched).
3. Stale matcher string `/permanently deletes the card and all attached/` is absent from the test file.
</verification>
<success_criteria>
- The tracked known issue is resolved: the DeleteCardDialog test suite passes.
- The test asserts on a stable substring of the current dialog copy.
- DeleteCardDialog.tsx component copy is unchanged.
</success_criteria>
<known_issue_workflow>
- `known_issues_input` carries the one tracked known issue verbatim from R01-KNOWN-ISSUES.json.
- `known_issue_resolutions` records disposition `resolved` for that issue — this round fixes the stale test.
- No issues are carried forward; no verification FAILs exist this round (`fail_classifications: []`).
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
