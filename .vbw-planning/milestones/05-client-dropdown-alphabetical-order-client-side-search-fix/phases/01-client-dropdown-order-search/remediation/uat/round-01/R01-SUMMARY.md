---
phase: 1
round: 1
title: Client Dropdown UAT quick-fixes (clear sentinel + hover styling)
type: remediation
status: complete
completed: 2026-07-08
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - 1bfe71a
  - ff20a8e
files_modified:
  - frontend/src/components/client-combobox.tsx
  - frontend/src/features/schedule/components/AssignmentModal.tsx
  - frontend/src/components/__tests__/client-combobox.test.tsx
deviations:
  - none
---

Resolved two UAT-reported ClientCombobox polish issues: the "No client" clear sentinel now appears only when a client is selected (assignment picker), and the item rows adopt shadcn SelectItem's focus styling instead of the aggressive hover highlight — board filter's always-visible "All clients" sentinel preserved.

## Task 1: UAT-1 — clear sentinel only shown when a value is selected

### What Was Built
- Added `sentinelMode?: 'always' | 'clear'` prop to `ClientCombobox` (default `'always'`)
- `'clear'` mode hides the pinned sentinel row unless a value is currently selected, so the assignment picker's "No client" behaves purely as a clear action; the field stays clearable when a client is set
- Wired both `AssignmentModal` call sites (main + split) to `sentinelMode="clear"`
- Board filter left on the default `'always'` so its "All clients" no-filter sentinel remains permanently visible (no regression)
- Extended `client-combobox.test.tsx` with cases (h) always-mode shows sentinel with no selection, (i) clear-mode hides sentinel with no selection, (j) clear-mode shows sentinel-as-clear once a client is selected and clearing calls `onChange(null)`

### Files Modified
- `frontend/src/components/client-combobox.tsx` -- edit: add `sentinelMode` prop + `showSentinel` gate on the pinned sentinel row
- `frontend/src/features/schedule/components/AssignmentModal.tsx` -- edit: pass `sentinelMode="clear"` at both combobox call sites
- `frontend/src/components/__tests__/client-combobox.test.tsx` -- edit: add 3 sentinel-mode tests

### Deviations
None

## Task 2: UAT-2 — match ClientCombobox item hover to shadcn Select

### What Was Built
- Removed the aggressive `hover:bg-accent` highlight from both the sentinel and client item rows
- Adopted `SelectItem`'s interaction styling (`ui/select.tsx`): `cursor-default select-none outline-none focus:bg-accent focus:text-accent-foreground`, with the current-selection row using `bg-accent text-accent-foreground`
- Applied to all rows so the assignment picker and board filter both visually match the pentesters Radix `<Select>` dropdown

### Files Modified
- `frontend/src/components/client-combobox.tsx` -- edit: swap hover highlight for SelectItem focus styling on sentinel + client rows

### Deviations
None
