---
phase: 1
round: 2
title: Client Dropdown UAT round-02 remediation (trigger hover + sentinel-while-searching)
type: remediation
status: complete
completed: 2026-07-08
tasks_completed: 2
tasks_total: 2
commit_hashes:
  - a295fb7
  - abbfe3a
files_modified:
  - frontend/src/components/client-combobox.tsx
  - frontend/src/features/schedule/components/AssignmentModal.tsx
  - frontend/src/components/__tests__/client-combobox.test.tsx
  - frontend/src/features/board/components/__tests__/BoardFilters.test.tsx
deviations:
  - "none"
known_issue_outcomes: []
pre_existing_issues:
  - '{"test":"(board) DeleteCardDialog › renders permanent-delete warning copy","file":"frontend/src/features/board/components/__tests__/DeleteCardDialog.test.tsx","error":"Unable to find element with text /permanently deletes the card and all attached .../ — dialog copy no longer matches the test assertion (last touched by unrelated commit 687a82c)"}'
---

Fixed both UAT round-02 items in the shared ClientCombobox: neutralized the trigger's outline-variant hover fill (UAT-2b, recurring) and switched the pinned sentinel to a search-driven visibility rule while removing the now-vestigial `sentinelMode` prop (UAT-1b).

## Task 1: UAT-2b — neutralize combobox trigger hover to match SelectTrigger

### What Was Built
- Appended `hover:bg-transparent hover:text-foreground` to the trigger Button's own `className` so tailwind-merge overrides the `outline` variant's `hover:bg-accent hover:text-accent-foreground`, eliminating the weird hover fill and matching the pentesters `SelectTrigger` (which has no hover styling)
- Left `variant="outline"`, all Popover/Button wiring, and the item-row / sentinel-row `focus:bg-accent` styling untouched (round-01 wrongly targeted the item rows)

### Files Modified
- `frontend/src/components/client-combobox.tsx` -- edit: hover-neutralize the trigger Button className

### Deviations
None

## Task 2: UAT-1b — sentinel keyed off search text + remove sentinelMode prop + update tests

### What Was Built
- Replaced `showSentinel = sentinelMode === 'always' || value !== null` with `const showSentinel = !search` — sentinel visible when the search box is empty, hidden while search text is present (identical for assignment "No client" and board "All clients")
- Removed the `sentinelMode` prop entirely: interface field, destructured default, the stale field/behavior doc comments, and the inline sentinel comment; both `AssignmentModal` call sites (main + split) no longer pass `sentinelMode="clear"`
- Rewrote client-combobox tests (e),(h),(i),(j) to the new `!search` rule with no `sentinelMode` references; added a BoardFilters (e) parity assertion that "All clients" disappears from the list-button set once search text is typed
- Verified: `grep -rn sentinelMode frontend/src` returns zero matches

### Files Modified
- `frontend/src/components/client-combobox.tsx` -- edit: search-driven `showSentinel`, remove `sentinelMode` prop + stale docs
- `frontend/src/features/schedule/components/AssignmentModal.tsx` -- edit: drop `sentinelMode="clear"` from both ClientCombobox call sites
- `frontend/src/components/__tests__/client-combobox.test.tsx` -- edit: rewrite tests (e,h,i,j) to the `!search` rule, drop `sentinelMode` refs
- `frontend/src/features/board/components/__tests__/BoardFilters.test.tsx` -- edit: add hide-while-searching parity assertion for "All clients"

### Deviations
None
