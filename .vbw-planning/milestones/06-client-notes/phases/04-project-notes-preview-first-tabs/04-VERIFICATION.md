---
phase: 04
tier: standard
result: PARTIAL
passed: 12
failed: 4
total: 16
date: 2026-07-15
verified_at_commit: 0631dadb06ca32f70759a2a2f65c84bebcc23854
writer: write-verification.sh
plans_verified:
  - 04-01
---

## Must-Have Checks

| # | ID | Truth/Condition | Status | Evidence |
|---|-----|-----------------|--------|----------|
| 1 | MH-01 | NotesEditor gains optional previewFirst?: boolean defaulting to false; omitting it preserves today's behavior exactly. | PASS | frontend/src/components/NotesEditor.tsx interface + destructure `previewFirst = false` + useState initializer `previewFirst ? 'preview' : 'edit'` (commit c76904a). Re-confirmed clean `npx tsc --noEmit` (0 errors) at HEAD 0631dad. |
| 2 | MH-02 | With previewFirst absent/false: TabsList renders Edit before Preview AND opens on Edit (client-notes regression guard). | PASS | NotesEditor.tsx else-branch renders Edit then Preview; NotesEditor.test.tsx 'defaults to Edit-first' asserts tabs[0]=Edit, tabs[1]=Preview, Edit aria-selected=true. Re-ran `npx vitest run` at HEAD 0631dad: PASS. |
| 3 | MH-03 | With previewFirst={true}: TabsList renders Preview before Edit AND opens on Preview; Edit remains fully functional (textarea editable after clicking Edit). | PASS | NotesEditor.tsx if-branch renders Preview then Edit; NotesEditor.test.tsx describe('previewFirst') 3 cases (DOM order, aria-selected, Edit-functional) all PASS in re-run `npx vitest run` at HEAD 0631dad. |
| 4 | MH-04 | CardDetailModal's project-notes NotesEditor passes previewFirst so planner card project notes open Preview-first. | PASS | frontend/src/features/board/components/CardDetailModal.tsx L662 `previewFirst` on the project-notes <NotesEditor> usage (commit 4d57818). CardDetailModal.test.tsx case (e) asserts Preview tab first + aria-selected=true; PASS in re-run. |
| 5 | MH-05 | ClientNotesModal does NOT pass previewFirst — client-notes editor stays Edit-first/Edit-default, unchanged. | PASS | grep previewFirst frontend/src/features/schedule/components/ClientNotesModal.tsx -> no match; no git diff on this file across the phase's 3 commits. ClientNotesModal.test.tsx (4 tests) still green in the re-run full suite. |
| 6 | MH-06 | Save-on-success still lands on Preview in both modes: setTab('preview') after resolved onSave (NotesEditor L100) is unchanged. | PASS | git diff c76904a~1 c76904a -- NotesEditor.tsx: handleSave block (incl. setTab('preview')) is outside the changed hunks. NotesEditor.test.tsx 'flips to the Preview tab when onSave resolves' still PASS. |
| 7 | MH-07 | SANITIZE_SCHEMA and the exported NotesPreview render path are byte-for-byte unchanged. | PASS | git diff c76904a~1 c76904a -- NotesEditor.tsx touches only the props interface, useState initializer, and TabsList JSX; SANITIZE_SCHEMA and NotesPreview have zero touched lines. 'sanitizes the preview' test still PASS. |
| 8 | MH-08 | Phase-03 read-only client-notes section (tab-less NotesPreview) is untouched and exposes no tab/textarea/Save affordance. | PASS | CardDetailModal.tsx NotesPreview block absent from the 4d57818 diff (only the +1 previewFirst line touched). CardDetailModal.test.tsx case (d) unchanged and PASS: client-notes subtree has no textarea/button/[role=tab]. |
| 9 | MH-09 | Backend is untouched (no backend/ files in the diff); frontend-only change per plan objective. | PASS | `git diff --stat c76904a~1 HEAD -- backend/` returns empty; the 3 phase commits touch only 2 frontend components + 2 frontend test files. |
| 10 | DEVN-01-FM | Declared deviation DEVN-01 (SUMMARY frontmatter `deviations[]`): test activation mechanics changed from click to mousedown, not specified/authorized by the plan. | FAIL | 04-01-SUMMARY.md frontmatter deviations[1]: "DEVN-01: The new NotesEditor 'keeps Edit functional' case and CardDetailModal case (e) activate/assert against the Preview-default state. Radix Tabs triggers activate on mousedown (left button), not on a bare click, so the Edit-activation step uses fireEvent.mouseDown rather than fireEvent.click (the pre-existing sanitize test's fireEvent.click(Preview) only passed vacuously)." Plan 04-01-PLAN.md Task 3 <action>/<verify> specify writing tests to 'ensure all pass' with no mention of fireEvent.mouseDown vs fireEvent.click; the plan's test-interaction approach did not anticipate Radix's mousedown-only activation. Per VBW rule, any divergence from the plan's specified approach is a FAIL check regardless of whether the resulting fix is technically correct. |
| 11 | DEVN-01-TASK | Declared deviation DEVN-01 (SUMMARY body 'Deviations' section, per-task): same fireEvent.mouseDown-vs-click divergence, restated as the Task 3 deliverable deviation. | FAIL | 04-01-SUMMARY.md body 'Deviations' section: "DEVN-01: Edit-tab activation in tests uses fireEvent.mouseDown (Radix Tabs activate on mousedown, not a bare click)." This is the per-task restatement of the frontmatter DEVN-01 entry, counted separately by the deviation gate. Diverges from Task 3 of 04-01-PLAN.md, which specified adding the described test cases without calling out a change to the interaction primitive used to activate tabs. |
| 12 | DEVN-02-FM | Declared deviation DEVN-02 (SUMMARY frontmatter `deviations[]`): CardDetailModal cases (a) and (b) were modified, contradicting the plan's explicit directive to keep (a)-(d) unchanged. | FAIL | 04-01-SUMMARY.md frontmatter deviations[0]: "DEVN-02: CardDetailModal cases (a) and (b) could not stay byte-for-byte unchanged. Opting the project-notes editor into previewFirst makes Radix unmount the inactive Edit tab's content, so the project textarea is not in the DOM on mount; the plan's directive to keep (a)-(d) unchanged assumed it stayed mounted. The two incidental project-notes assertions were switched from getByDisplayValue('Project note body') (textarea) to getByText('Project note body') (Preview markdown)... (c)/(d) are fully unchanged." This directly contradicts 04-01-PLAN.md Task 3 <action>: "Keep the existing Phase-03 read-only client-notes cases (a)-(d) unchanged." Cases (a) and (b) were in fact edited (assertion query swapped), a plan violation regardless of the technical justification (Radix unmounts inactive TabsContent without forceMount). |
| 13 | DEVN-02-TASK | Declared deviation DEVN-02 (SUMMARY body 'Deviations' section, per-task): same (a)/(b) test-assertion change, restated as the Task 3 deliverable deviation. | FAIL | 04-01-SUMMARY.md body 'Deviations' section: "DEVN-02: CardDetailModal (a)/(b) incidental project-notes assertions changed from getByDisplayValue (textarea) to getByText (Preview markdown) because Radix unmounts the inactive Edit tab under previewFirst, so the textarea is not mounted on load. Client-notes assertions (the cases' real purpose) and cases (c)/(d) are unchanged." Per-task restatement of the frontmatter DEVN-02 entry, counted separately by the deviation gate. Diverges from 04-01-PLAN.md Task 3's explicit 'Keep the existing Phase-03 read-only client-notes cases (a)-(d) unchanged' directive — (a) and (b) were not kept unchanged. |

## Convention Compliance

| # | ID | Convention | File | Status | Detail |
|---|-----|------------|------|--------|--------|
| 1 | TSC-01 | Type-check clean after the previewFirst prop change. | frontend/ | PASS | Re-ran `cd frontend && npx tsc --noEmit` at HEAD 0631dad: no output, 0 errors. |
| 2 | VITEST-01 | Targeted test files (NotesEditor.test.tsx, CardDetailModal.test.tsx) pass in full. | frontend/src/components/__tests__/NotesEditor.test.tsx, frontend/src/features/board/components/__tests__/CardDetailModal.test.tsx | PASS | Re-ran full suite at HEAD 0631dad: NotesEditor.test.tsx 11 tests passed, CardDetailModal.test.tsx 5 tests passed (16 total), 0 failed. |
| 3 | VITEST-02 | Full frontend suite has no regressions from this phase (incl. ClientNotesModal, KanbanCard, board/schedule suites). | frontend/ | PASS | Re-ran `npx vitest run` (full frontend suite) at HEAD 0631dad: Test Files 15 passed (15), Tests 92 passed (92), 0 failed. |

## Summary

**Tier:** standard
**Result:** PARTIAL
**Passed:** 12/16
**Failed:** DEVN-01-FM, DEVN-01-TASK, DEVN-02-FM, DEVN-02-TASK
