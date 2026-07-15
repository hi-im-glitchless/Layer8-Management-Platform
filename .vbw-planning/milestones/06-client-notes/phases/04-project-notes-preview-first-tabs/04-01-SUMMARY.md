---
phase: 4
plan: "01"
title: Project-Notes Preview-First Tabs (prop-driven)
status: complete
completed: 2026-07-15
tasks_completed: 3
tasks_total: 3
commit_hashes:
  - c76904a
  - 4d57818
  - 0631dad
deviations:
  - "DEVN-02: CardDetailModal cases (a) and (b) could not stay byte-for-byte unchanged. Opting the project-notes editor into previewFirst makes Radix unmount the inactive Edit tab's content, so the project textarea is not in the DOM on mount; the plan's directive to keep (a)-(d) unchanged assumed it stayed mounted. The two incidental project-notes assertions were switched from getByDisplayValue('Project note body') (textarea) to getByText('Project note body') (Preview markdown). The client-notes assertions — the actual purpose of these cases — are unchanged, and (c)/(d) are fully unchanged."
  - "DEVN-01: The new NotesEditor 'keeps Edit functional' case and CardDetailModal case (e) activate/assert against the Preview-default state. Radix Tabs triggers activate on mousedown (left button), not on a bare click, so the Edit-activation step uses fireEvent.mouseDown rather than fireEvent.click (the pre-existing sanitize test's fireEvent.click(Preview) only passed vacuously)."
pre_existing_issues: []
ac_results:
  - criterion: "NotesEditor gains an optional prop previewFirst?: boolean defaulting to false; omitting it preserves today's behavior exactly."
    verdict: pass
    evidence: "c76904a frontend/src/components/NotesEditor.tsx (previewFirst = false destructure); test 'defaults to Edit-first' in NotesEditor.test.tsx"
  - criterion: "With previewFirst absent/false: Edit trigger before Preview AND opens on Edit (client-notes regression guard)."
    verdict: pass
    evidence: "NotesEditor.test.tsx 'defaults to Edit-first: renders Edit trigger before Preview and opens on Edit'"
  - criterion: "With previewFirst={true}: Preview trigger before Edit AND opens on Preview; Edit stays functional (textarea editable after clicking Edit)."
    verdict: pass
    evidence: "NotesEditor.test.tsx previewFirst block: 'renders the Preview trigger before the Edit trigger', 'opens on the Preview tab', 'keeps Edit fully functional'"
  - criterion: "CardDetailModal's project-notes NotesEditor passes previewFirst so planner card project notes open Preview-first."
    verdict: pass
    evidence: "4d57818 CardDetailModal.tsx L662 previewFirst; CardDetailModal.test.tsx case (e)"
  - criterion: "ClientNotesModal does NOT pass previewFirst — client-notes editor stays Edit-first / Edit-default, unchanged."
    verdict: pass
    evidence: "grep previewFirst frontend/src/features/schedule/components/ClientNotesModal.tsx -> no match; file has no git diff"
  - criterion: "Save-on-success still lands on Preview in both modes: setTab('preview') after resolved onSave (NotesEditor L100) unchanged."
    verdict: pass
    evidence: "git diff NotesEditor.tsx shows handleSave/setTab('preview') untouched; test 'flips to the Preview tab when onSave resolves' still green"
  - criterion: "SANITIZE_SCHEMA and the exported NotesPreview render path are byte-for-byte unchanged."
    verdict: pass
    evidence: "git diff NotesEditor.tsx touches only props interface, useState initializer, and TabsList order; sanitize test still green"
  - criterion: "Phase-03 read-only client-notes section (tab-less NotesPreview) untouched and exposes no tab/textarea/Save affordance."
    verdict: pass
    evidence: "CardDetailModal.tsx NotesPreview block unchanged; CardDetailModal.test.tsx case (d) unchanged and green"
---

Prop-driven previewFirst flag flips only the planner card project-notes editor to Preview-first (Preview -> Edit, opens on Preview) while the shared NotesEditor's default and the client-notes editor stay Edit-first.

## What Was Built

- Added optional `previewFirst?: boolean` (default `false`) to `NotesEditor`: initial tab is `previewFirst ? 'preview' : 'edit'`, and the TabsList renders Preview before Edit when set, else Edit before Preview. `SANITIZE_SCHEMA`, `NotesPreview`, `TabsContent`, and the save-on-success `setTab('preview')` are unchanged.
- Opted the CardDetailModal project-notes editor into Preview-first via `previewFirst`; the read-only client-notes `NotesPreview` section and all other props are unchanged. ClientNotesModal is untouched (stays Edit-first).
- Test coverage: strengthened the no-prop cases to prove Edit-first/Edit-default (client-notes regression guard); added `previewFirst` cases (Preview-first order, opens on Preview, Edit stays functional); added CardDetailModal case (e) proving the project-notes editor opens Preview-first.

## Files Modified

- `frontend/src/components/NotesEditor.tsx` -- edit: add `previewFirst` prop driving initial tab + TabsList order (commit c76904a).
- `frontend/src/features/board/components/CardDetailModal.tsx` -- edit: pass `previewFirst` on the project-notes NotesEditor (commit 4d57818).
- `frontend/src/components/__tests__/NotesEditor.test.tsx` -- edit: Edit-first regression assertions + `previewFirst` describe block (commit 0631dad).
- `frontend/src/features/board/components/__tests__/CardDetailModal.test.tsx` -- edit: case (e) Preview-first + adapt (a)/(b) to Preview-default render (commit 0631dad).

## Deviations

- DEVN-02: CardDetailModal (a)/(b) incidental project-notes assertions changed from `getByDisplayValue` (textarea) to `getByText` (Preview markdown) because Radix unmounts the inactive Edit tab under `previewFirst`, so the textarea is not mounted on load. Client-notes assertions (the cases' real purpose) and cases (c)/(d) are unchanged.
- DEVN-01: Edit-tab activation in tests uses `fireEvent.mouseDown` (Radix Tabs activate on mousedown, not a bare click).
