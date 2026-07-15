---
phase: 01
round: 1
plan: R01
title: Clear tracked TS2835 known-issue in rateLimit.test.ts
type: remediation
autonomous: true
effort_override: fast
skills_used: []
files_modified: [backend/src/middleware/__tests__/rateLimit.test.ts]
forbidden_commands: []
fail_classifications: []
known_issues_input:
  - '{"test":"tsc --noEmit (typecheck)","file":"backend/src/middleware/__tests__/rateLimit.test.ts","error":"TS2835: Relative import paths need explicit file extensions in ECMAScript imports when moduleResolution is node16/nodenext (line 15) — pre-existing in an unmodified file, unrelated to this plan"}'
  - '{"test":"tsc --noEmit (typecheck)","file":"backend/src/middleware/__tests__/rateLimit.test.ts","error":"TS2835: Relative import paths need explicit file extensions in ECMAScript imports when moduleResolution is node16/nodenext (line 15) — pre-existing in an unmodified file, unrelated to this plan; not fixed"}'
known_issue_resolutions:
  - '{"test":"tsc --noEmit (typecheck)","file":"backend/src/middleware/__tests__/rateLimit.test.ts","error":"TS2835: Relative import paths need explicit file extensions in ECMAScript imports when moduleResolution is node16/nodenext (line 15) — pre-existing in an unmodified file, unrelated to this plan","disposition":"resolved","rationale":"The missing .js extension is added to the ../rateLimit import on line 15, so tsc TS2835 no longer fires for this file. Registry entry is legitimately cleared by a code fix rather than a carried process-exception."}'
  - '{"test":"tsc --noEmit (typecheck)","file":"backend/src/middleware/__tests__/rateLimit.test.ts","error":"TS2835: Relative import paths need explicit file extensions in ECMAScript imports when moduleResolution is node16/nodenext (line 15) — pre-existing in an unmodified file, unrelated to this plan; not fixed","disposition":"resolved","rationale":"Duplicate registry record of the same underlying defect. The same one-line .js-extension fix on line 15 resolves both entries; tsc TS2835 no longer fires for this file."}'
must_haves:
  truths:
    - "npx tsc --noEmit reports no TS2835 error for backend/src/middleware/__tests__/rateLimit.test.ts"
    - "The rateLimit test file still imports and exercises resolveAuthRateLimitMax"
  artifacts:
    - {path: "backend/src/middleware/__tests__/rateLimit.test.ts", provides: "typecheck-clean rateLimit middleware test", contains: "from '../rateLimit.js'"}
  key_links:
    - {from: "backend/src/middleware/__tests__/rateLimit.test.ts", to: "backend/src/middleware/rateLimit.ts", via: "explicit-extension ESM import"}
---
<objective>
Contract QA for Phase 01 already PASSED (0 FAIL checks, source_fail_count=0). This round exists only to clear the tracked known-issues backlog that blocks UAT. Both registry entries describe the SAME genuine, pre-existing tsc error: a relative import in an unmodified test file that is missing the explicit `.js` extension required under `moduleResolution: node16/nodenext`. Resolve it with a one-line code fix so the registry is legitimately emptied rather than carrying a process-exception forever.
</objective>
<context>
@backend/src/middleware/__tests__/rateLimit.test.ts
@backend/src/middleware/rateLimit.ts
Rationale: The defect is a single line 15 import statement (`import { resolveAuthRateLimitMax } from '../rateLimit';`). Adding `.js` aligns it with the project's nodenext module resolution, matching how sibling ESM imports are written.
</context>
<tasks>
<task type="auto">
  <name>Add explicit .js extension to the rateLimit import</name>
  <files>
    backend/src/middleware/__tests__/rateLimit.test.ts
  </files>
  <action>
On line 15, change the relative import specifier from `'../rateLimit'` to `'../rateLimit.js'` so the statement reads:
`import { resolveAuthRateLimitMax } from '../rateLimit.js';`
Do not modify any other import, assertion, or test body. Commit as `fix(rateLimit-test): add explicit .js extension to satisfy nodenext TS2835`.
  </action>
  <verify>
Run `npx tsc --noEmit` from the backend workspace and confirm no TS2835 diagnostic is emitted for backend/src/middleware/__tests__/rateLimit.test.ts. Run the rateLimit test file (e.g. the project's test runner scoped to rateLimit.test.ts) and confirm it still loads and executes.
  </verify>
  <done>
tsc --noEmit no longer reports TS2835 for the file, the rateLimit test still runs, and exactly one atomic `fix(...)` commit was made.
  </done>
</task>
</tasks>
<verification>
1. `npx tsc --noEmit` produces no TS2835 error referencing backend/src/middleware/__tests__/rateLimit.test.ts.
2. Line 15 of the file imports from `'../rateLimit.js'`.
3. The rateLimit test file still runs (import resolves, test cases execute).
4. Exactly one `fix(...)` commit was created for this change.
</verification>
<success_criteria>
- The tracked TS2835 known-issue is resolved via code fix and the registry is emptied.
- No new tsc diagnostics are introduced by the change.
- Phase 01 known-issues backlog no longer blocks UAT.
</success_criteria>
<known_issue_workflow>
- Both carried registry entries are the same underlying defect and are both copied into `known_issues_input` verbatim.
- Both receive a matching `known_issue_resolutions` entry with `disposition:"resolved"`, since the one-line `.js`-extension fix clears TS2835 for the file.
- No known issue is carried forward; the registry is legitimately emptied this round.
</known_issue_workflow>
<output>
R01-SUMMARY.md
</output>
