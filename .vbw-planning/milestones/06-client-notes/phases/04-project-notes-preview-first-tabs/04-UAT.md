---
phase: 4
plan_count: 2
status: complete
started: 2026-07-15
completed: 2026-07-15
total_tests: 6
passed: 6
skipped: 0
issues: 0
---

Human acceptance testing for Phase 04 — Project-Notes Preview-First Tabs (the planner-card project-notes editor opens Preview-first via a prop-driven NotesEditor; client-notes page editor unchanged).

## Tests

### D01: Review summary deviation — Plan 01 DEVN-02 (cases a/b getByText)

- **Source:** Summary deviation review
- **Deviation Signature:** d430276f71982fbb6930ecafce9291561f53296df68df121bafc83184dc64494
- **Source Plan:** 01
- **Source Summary:** 04-01-SUMMARY.md
- **Deviation:** DEVN-02: CardDetailModal test cases (a)/(b) could not stay byte-for-byte unchanged. Under previewFirst Radix unmounts the inactive Edit tab, so the project textarea isn't in the DOM on mount; the two incidental project-notes assertions were switched from getByDisplayValue (textarea) to getByText (Preview markdown). The client-notes assertions (the cases' real purpose) and cases (c)/(d) are unchanged. (Resolved-by-amendment in QA remediation R01 — the plan now documents this.)
- **Plan:** 01 -- Project-Notes Preview-First Tabs (prop-driven)
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D02: Review summary deviation — Plan 01 DEVN-01 (mousedown activation)

- **Source:** Summary deviation review
- **Deviation Signature:** 9f9d0ffd7eae9dd011f1c17c7f173dc8a688fa61849cd16fc126e142c6cbc02a
- **Source Plan:** 01
- **Source Summary:** 04-01-SUMMARY.md
- **Deviation:** DEVN-01: The new "keeps Edit functional" case and CardDetailModal case (e) assert against the Preview-default state. Radix Tabs triggers activate on mousedown (not a bare click), so Edit-tab activation in tests uses fireEvent.mouseDown rather than fireEvent.click. (Resolved-by-amendment in QA remediation R01.)
- **Plan:** 01 -- Project-Notes Preview-First Tabs (prop-driven)
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D03: Review summary deviation — Plan 01 DEVN-02 restatement

- **Source:** Summary deviation review
- **Deviation Signature:** ab110fa70dca1837d57b27c5e7a05aa4628705a8bca876ee28025ea9d967fd8b
- **Source Plan:** 01
- **Source Summary:** 04-01-SUMMARY.md
- **Deviation:** DEVN-02 (per-task restatement): CardDetailModal (a)/(b) incidental project-notes assertions changed from getByDisplayValue (textarea) to getByText (Preview markdown) because Radix unmounts the inactive Edit tab under previewFirst. Client-notes assertions and cases (c)/(d) are unchanged. (Resolved-by-amendment in QA remediation R01.)
- **Plan:** 01 -- Project-Notes Preview-First Tabs (prop-driven)
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### D04: Review summary deviation — Plan 01 DEVN-01 restatement

- **Source:** Summary deviation review
- **Deviation Signature:** 5a5bb719095f49e09b4d1d586b1a7e01c469e2d0eeeab8fd5d6ab48e0104f23d
- **Source Plan:** 01
- **Source Summary:** 04-01-SUMMARY.md
- **Deviation:** DEVN-01 (per-task restatement): Edit-tab activation in tests uses fireEvent.mouseDown (Radix Tabs activate on mousedown, not a bare click). (Resolved-by-amendment in QA remediation R01.)
- **Plan:** 01 -- Project-Notes Preview-First Tabs (prop-driven)
- **Scenario:** Review a documented implementation deviation from SUMMARY.md
- **Expected:** Human confirms whether this documented deviation is acceptable for this phase.
- **Result:** pass
- **Disposition:** accepted-process-exception

### P01-T01: Planner card project notes open Preview-first

- **Plan:** 01 -- Project-Notes Preview-First Tabs (prop-driven)
- **Scenario:** Open the Board, open a card's detail modal, and look at the project Notes editor (the editable one, below any read-only client-notes section).
- **Expected:** The project Notes editor now renders the **Preview** tab first and OPENS on Preview (you see the rendered markdown first). The **Edit** tab is still present and fully works — click it and you can edit the notes; saving still lands back on Preview.
- **Result:** pass

### P01-T02: Client Notes page editor is unchanged (still Edit-first)

- **Plan:** 01 -- Project-Notes Preview-First Tabs (prop-driven)
- **Scenario:** As a PM/Admin, open Tools > Client Notes, open a client, and look at the notes editor.
- **Expected:** The client-notes page editor is unchanged — it still renders **Edit** first and OPENS on the Edit tab (only the planner-card project notes were flipped to Preview-first, not this editor).
- **Result:** pass

## Summary

- Passed: 0
- Skipped: 0
- Issues: 0
- Total: 6
