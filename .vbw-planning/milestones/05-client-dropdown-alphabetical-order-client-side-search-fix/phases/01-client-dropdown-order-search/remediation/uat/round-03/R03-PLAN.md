---
phase: 1
round: 3
plan: R03
title: Client Dropdown UAT round-03 remediation (caret, sentinel text color, AssignmentModal sentinel coverage)
type: remediation
autonomous: true
effort_override: balanced
skills_used: []
files_modified:
  - frontend/src/components/client-combobox.tsx
  - frontend/src/components/__tests__/client-combobox.test.tsx
  - frontend/src/features/schedule/components/__tests__/AssignmentModal.sentinel.test.tsx
forbidden_commands: []
fail_classifications:
  - {id: "UAT-4", type: "code-fix", rationale: "Trigger has no dropdown affordance; add a lucide ChevronDown icon to match ui/select.tsx SelectTrigger. Application-code change to client-combobox.tsx."}
  - {id: "UAT-5", type: "code-fix", rationale: "Sentinel/trigger label renders in text-muted-foreground making the no-filter state look disabled; remove the muted class to match the pentesters Select. Application-code change to client-combobox.tsx."}
  - {id: "UAT-3", type: "code-fix", rationale: "Committed code (abbfe3a, showSentinel = !search) already renders 'No client' symmetrically; R02 symptom was a stale pre-abbfe3a build. No app-code change — add integration test coverage (test is code) closing the untested AssignmentModal call site, plus a re-test-on-fresh-build note."}
known_issues_input: []
known_issue_resolutions: []
must_haves:
  truths:
    - "The ClientCombobox trigger renders a down-chevron affordance in all three call sites (AssignmentModal main/split, BoardFilters) with no new dependency (ChevronDown from existing lucide-react)."
    - "The no-selection sentinel label ('No client'/'All clients') renders in normal foreground, not text-muted-foreground; the selected-client branch remains normal foreground."
    - "showSentinel logic (= !search, client-combobox.tsx:67) is unchanged; the sentinel remains visible when search is empty and hidden while searching."
    - "No regression to sort, search, sentinel-while-searching, swatch, selection, save, or filter; the board 'All clients' row is retained."
  artifacts:
    - {path: "frontend/src/components/client-combobox.tsx", provides: "caret + normal-foreground sentinel", contains: "ChevronDown"}
    - {path: "frontend/src/features/schedule/components/__tests__/AssignmentModal.sentinel.test.tsx", provides: "integration coverage that 'No client' renders in the real AssignmentModal picker when search is empty and disappears when search text is entered", contains: "No client"}
    - {path: "frontend/src/components/__tests__/client-combobox.test.tsx", provides: "caret-present and sentinel-not-muted assertions", contains: "text-muted-foreground"}
  key_links:
    - {from: "frontend/src/components/client-combobox.tsx", to: "lucide-react", via: "import ChevronDown (existing dependency, no package change)"}
    - {from: "frontend/src/features/schedule/components/__tests__/AssignmentModal.sentinel.test.tsx", to: "frontend/src/features/schedule/components/AssignmentModal.tsx", via: "mounts real AssignmentModal with mocked useClients"}
---
<objective>
Resolve Client Dropdown UAT round-03 findings on the shared `frontend/src/components/client-combobox.tsx`: add a down-chevron affordance (UAT-4) and un-mute the no-selection sentinel/trigger label (UAT-5), both matching the pentesters `SelectTrigger` in `ui/select.tsx`. For UAT-3, do NOT change the (already-correct) sentinel logic — instead close the coverage gap with an integration test that mounts the real `AssignmentModal` and asserts "No client" behavior, and flag that the round-02 symptom was a stale build requiring re-test on a fresh frontend. Client-side only, no backend, no new dependency.
</objective>
<context>
@.vbw-planning/phases/01-client-dropdown-order-search/remediation/uat/round-03/R03-RESEARCH.md
Reference (do NOT modify): frontend/src/components/ui/select.tsx:5,22,26-30 (ChevronDown import + `h-4 w-4 opacity-50` icon; `data-[placeholder]:text-muted-foreground` — Radix mutes only genuine absent-value placeholders, which the sentinel is not).
Current source confirmed: client-combobox.tsx:67 (`showSentinel = !search`, keep), :88-109 (trigger Button, `justify-start`, contains only the label span), :107 (`<span className="text-muted-foreground">{sentinelLabel}</span>`), :133-145 (pinned sentinel row, keep).
Call sites (unchanged): AssignmentModal.tsx:325 (main) & :410 (split) pass `sentinelLabel="No client"`; BoardFilters.tsx:65-71 passes `sentinelLabel="All clients"` + `triggerClassName="w-[160px] h-8 text-xs"`.
Existing test mock pattern to mirror: AssignmentModal.lock.test.tsx:1-22 (`vi.mock('../../hooks', ...)` with `useClients`, MemoryRouter wrapper, mocked board hook).
</context>
<tasks>
<!-- Sequential: visual fixes first (same file), then unit-test updates for them, then the UAT-3 integration coverage. -->
<task type="auto">
  <name>UAT-4: add down-chevron affordance to the ClientCombobox trigger</name>
  <files>
    frontend/src/components/client-combobox.tsx
  </files>
  <action>
Add `import { ChevronDown } from 'lucide-react'` at the top of the file (lucide-react is already a dependency — used by ui/select.tsx — so add NO package). Inside the trigger `<Button>` (client-combobox.tsx:88-109), add a trailing sibling immediately after the selected/placeholder conditional span (after line 108's closing `)}`, before `</Button>`):
`<ChevronDown className="ml-auto h-4 w-4 opacity-50 shrink-0" />`
Keep the trigger's existing `justify-start` — `ml-auto` on the icon pushes the chevron to the right without a disruptive layout change and without touching any `triggerClassName` consumer (BoardFilters' `w-[160px] h-8 text-xs` keeps working). `h-4 w-4 opacity-50` matches ui/select.tsx:29; `shrink-0` protects the icon in the narrow board trigger. Do NOT switch to `justify-between`.
  </action>
  <verify>
From `frontend/`: `npx tsc -b --noEmit` (clean). Grep confirms icon present: `grep -n "ChevronDown" frontend/src/components/client-combobox.tsx` returns the import and the trigger usage. Adding an svg with no text does not change the trigger's accessible name, so existing `getAllByRole('button', { name: ... })` locators keep resolving.
  </verify>
  <done>
ChevronDown imported from lucide-react and rendered as the last child of the trigger Button with `ml-auto h-4 w-4 opacity-50 shrink-0`; tsc clean; no new dependency added (package.json unchanged).
  </done>
</task>
<task type="auto">
  <name>UAT-5: render the no-selection sentinel/trigger label in normal foreground</name>
  <files>
    frontend/src/components/client-combobox.tsx
  </files>
  <action>
At client-combobox.tsx:107, remove `text-muted-foreground` from the no-selection branch span so it inherits normal `text-foreground` like the selected-client branch (line 97) and like the pentesters Select's "no filter" item. Change `<span className="text-muted-foreground">{sentinelLabel}</span>` to `<span>{sentinelLabel}</span>`. Do NOT alter the selected-client span (line 97, already normal foreground). Do NOT change the "No clients found" empty-state span at line 167 (that is a genuine empty state, keep it muted). Do NOT touch the pinned sentinel row (lines 133-145) or `showSentinel`.
  </action>
  <verify>
From `frontend/`: `npx tsc -b --noEmit` (clean). `grep -n "text-muted-foreground" frontend/src/components/client-combobox.tsx` should show it ONLY on the "No clients found" empty-state line (167), not on the trigger label span.
  </verify>
  <done>
Trigger no-selection label renders without `text-muted-foreground`; empty-state span retains it; selected-client span unchanged; tsc clean.
  </done>
</task>
<task type="auto">
  <name>Lock caret + color fixes in the ClientCombobox unit tests</name>
  <files>
    frontend/src/components/__tests__/client-combobox.test.tsx
  </files>
  <action>
Add two lightweight regression assertions mirroring existing test setup/locators in this file:
1. UAT-4: after opening/rendering the trigger, assert a chevron svg is present in the trigger (e.g. locate the trigger button and assert `trigger.querySelector('svg')` is truthy). Do not assert on accessible name changes (there are none).
2. UAT-5: assert the trigger's no-selection label span does NOT carry `text-muted-foreground` (e.g. render with `value={null}` and `expect(the label span).not.toHaveClass('text-muted-foreground')`).
Reuse the existing SENTINEL constant and render helpers already in the file; do not rewrite existing passing tests.
  </action>
  <verify>
From `frontend/`: `npx vitest run src/components/__tests__/client-combobox.test.tsx` — all tests pass including the two new assertions.
  </verify>
  <done>
Both new assertions pass; the full client-combobox test file is green; no existing test modified beyond additions.
  </done>
</task>
<task type="auto">
  <name>UAT-3: add AssignmentModal integration coverage for the "No client" sentinel</name>
  <files>
    frontend/src/features/schedule/components/__tests__/AssignmentModal.sentinel.test.tsx
  </files>
  <action>
Create a new test file mirroring the mock pattern in AssignmentModal.lock.test.tsx:1-22 (mock `../../hooks` including `useClients`, mock `../../../board/hooks` `useBoardCardByProjectId: () => ({ data: null })`, wrap render in MemoryRouter). Mock `useClients` to return a NON-empty list, e.g. `useClients: () => ({ data: { clients: [{ id: 'c1', name: 'Acme', color: '#3366ff' }] } })`. Mount the real `AssignmentModal` for a NEW assignment (no client selected, `clientId === null` — follow how the existing AssignmentModal tests construct/pass props for an unedited assignment). Then:
1. Open the main client picker (click its trigger button) and assert `screen.getByText('No client')` (or getAllByText, since the trigger label may also read "No client") — the pinned sentinel row is present when the search box is empty.
2. Type text into the picker's search input (fireEvent.change) and assert the pinned sentinel row is no longer rendered (query the popover list; "No client" as the sentinel row disappears while searching — note the trigger label is not the popover row, so scope the assertion to the popover list or match count as appropriate).
This is the direct analogue of BoardFilters.test.tsx tests (c)/(e) for the previously-untested AssignmentModal call site. Do NOT modify AssignmentModal.tsx or client-combobox.tsx sentinel logic.
Add a top-of-file comment noting: the round-02 UAT-3 symptom reproduced the pre-abbfe3a build (stale bundle); the committed code is symmetric; user must re-test UAT-3 on a freshly rebuilt / hard-refreshed frontend.
  </action>
  <verify>
From `frontend/`: `npx vitest run src/features/schedule/components/__tests__/AssignmentModal.sentinel.test.tsx` — passes. `npx tsc -b --noEmit` clean.
  </verify>
  <done>
New AssignmentModal.sentinel.test.tsx exists and passes, asserting "No client" renders in the real modal picker when search is empty and is absent while searching; stale-build re-test note present in the file.
  </done>
</task>
</tasks>
<verification>
1. From `frontend/`: `npx tsc -b --noEmit` exits 0.
2. From `frontend/`: `npx vitest run` exits 0 (all suites green, including the two updated client-combobox assertions and the new AssignmentModal.sentinel test).
3. `grep -n "ChevronDown" frontend/src/components/client-combobox.tsx` shows the import + trigger usage; `grep -n "text-muted-foreground" frontend/src/components/client-combobox.tsx` shows it only on the "No clients found" empty state.
4. `grep -n "showSentinel = !search" frontend/src/components/client-combobox.tsx` confirms sentinel logic unchanged; no new entry in package.json / lockfile diff (no new dependency).
5. Board "All clients" row still present (BoardFilters.test.tsx green).
</verification>
<success_criteria>
- UAT-4 resolved: the ClientCombobox trigger shows a down-chevron affordance matching the pentesters SelectTrigger, in all three call sites, with no new dependency and no disruptive layout change.
- UAT-5 resolved: the no-selection sentinel/trigger label ("No client"/"All clients") reads in normal foreground, not greyed/disabled-looking; genuine empty state stays muted.
- UAT-3 addressed without app-code change: integration test proves "No client" renders symmetrically in the real AssignmentModal picker; plan/file record that the round-02 report was a stale build and the user must re-test on a freshly rebuilt / hard-refreshed frontend.
- No regression: sort, search, sentinel-while-searching, swatch, selection, save, filter all intact; board "All clients" row retained; tsc + full vitest green.
</success_criteria>
<output>
R03-SUMMARY.md
</output>
