---
phase: 1
round: 3
plan: R03
title: Client Dropdown UAT round-03 remediation (caret, sentinel text color, AssignmentModal sentinel coverage)
type: remediation
status: complete
completed: 2026-07-08
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - e7be32a
  - 6ddbcda
  - 62b4a0a
  - 131ad51
files_modified:
  - frontend/src/components/client-combobox.tsx
  - frontend/src/components/__tests__/client-combobox.test.tsx
  - frontend/src/features/schedule/components/__tests__/AssignmentModal.sentinel.test.tsx
deviations:
  - none
pre_existing_issues:
  - '{"test":"shows the destructive warning copy","file":"frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx","error":"TestingLibraryElementError: Unable to find element with text /permanently deletes the card and all attached .../ (DeleteCardDialog.test.tsx:46) — dialog description copy no longer matches; unrelated board dialog, unmodified by this round"}'
known_issue_outcomes: []
---

Resolved Client Dropdown UAT round-03: added a down-chevron affordance (UAT-4) and un-muted the no-selection sentinel label (UAT-5) in the shared ClientCombobox, and closed the untested AssignmentModal sentinel call site (UAT-3) with integration coverage documenting the round-02 report as a stale build.

## Task 1: UAT-4 add down-chevron affordance to the ClientCombobox trigger

### What Was Built
- Imported `ChevronDown` from the existing `lucide-react` dependency (no package change)
- Rendered `<ChevronDown className="ml-auto h-4 w-4 opacity-50 shrink-0" />` as the last child of the trigger Button, keeping `justify-start`; matches `ui/select.tsx` SelectTrigger

### Files Modified
- `frontend/src/components/client-combobox.tsx` -- edit: add chevron import and trailing caret icon in the trigger

## Task 2: UAT-5 render the no-selection sentinel/trigger label in normal foreground

### What Was Built
- Removed `text-muted-foreground` from the no-selection trigger span so the sentinel ("No client"/"All clients") reads in normal foreground and no longer looks disabled
- Left the "No clients found" empty-state span muted and the selected-client span unchanged

### Files Modified
- `frontend/src/components/client-combobox.tsx` -- edit: drop muted class from trigger sentinel span

## Task 3: Lock caret + color fixes in the ClientCombobox unit tests

### What Was Built
- Test (k): asserts the trigger renders a chevron `svg` affordance (UAT-4)
- Test (l): asserts the no-selection sentinel label lacks `text-muted-foreground` (UAT-5)

### Files Modified
- `frontend/src/components/__tests__/client-combobox.test.tsx` -- edit: two regression assertions (12 tests total, all green)

## Task 4: UAT-3 add AssignmentModal integration coverage for the "No client" sentinel

### What Was Built
- New test mounts the real `AssignmentModal` for a new assignment (`clientId === null`) with mocked `useClients` returning a non-empty client list
- Asserts "No client" pinned row is present when the picker is open with empty search, and absent once search text is entered
- Top-of-file note records that the round-02 UAT-3 symptom reproduced the pre-abbfe3a (stale) build; `showSentinel = !search` logic is unchanged and the user must re-test on a freshly rebuilt / hard-refreshed frontend

### Files Modified
- `frontend/src/features/schedule/components/__tests__/AssignmentModal.sentinel.test.tsx` -- create: integration coverage for the previously-untested call site

### Deviations
None
