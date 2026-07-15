---
phase: 1
plan: "01"
title: Alphabetical + searchable client dropdowns (shared ClientCombobox)
status: complete
completed: 2026-07-08
tasks_completed: 4
tasks_total: 4
commit_hashes:
  - 13bc3ad
  - 34e1680
  - 49591de
  - 8e26534
deviations:
  - "DEVN-01: the plan's sort-test example expected order (acme, Ácido, ...) was alphabetically wrong; case/accent-insensitive base-letter collation puts 'Ácido' (a,c,i...) before 'acme' (a,c,m...). Test asserts the correct order ['Ácido','acme','Bravo','Zeta']; helper behavior matches the plan's intent."
pre_existing_issues:
  - '{"test": "eslint react-hooks/set-state-in-effect", "file": "frontend/src/features/schedule/components/AssignmentModal.tsx", "error": "Calling setState synchronously within an effect (form-reset useEffect, line 124 post-change / 202 on HEAD) — pre-existing on the committed version, in code not touched by this plan"}'
ac_results:
  - criterion: "Every client-selection dropdown (schedule ClientSelect x2 + board filter) renders clients case- & accent-insensitively A→Z via localeCompare(b,'pt-PT',{sensitivity:'base'})"
    verdict: "pass"
    evidence: "13bc3ad sort.ts; sort.test.ts + client-combobox.test.tsx (a) + BoardFilters.test.tsx (b)"
  - criterion: "Every client-selection dropdown has client-side search: case-insensitive substring; clearing restores full list; 'No clients found' on no match"
    verdict: "pass"
    evidence: "client-combobox.test.tsx (b)(c)(d); BoardFilters.test.tsx (a)"
  - criterion: "Sentinels ('No client','All clients') stay pinned above the client list, never alphabetized, visible under any search text"
    verdict: "pass"
    evidence: "client-combobox.test.tsx (e); BoardFilters.test.tsx (c)"
  - criterion: "Color swatch preserved at schedule call sites, rendered only when color present (board list has none)"
    verdict: "pass"
    evidence: "client-combobox.tsx conditional {selected.color && ...}; client-combobox.test.tsx (g)"
  - criterion: "No new runtime dependency (no cmdk); hand-rolled Popover+Input+button-list reused"
    verdict: "pass"
    evidence: "git grep cmdk package.json → none; client-combobox.tsx uses ui/popover + ui/input"
  - criterion: "No regression to create/assign (AssignmentModal) or board flows; existing AssignmentModal tests still pass"
    verdict: "pass"
    evidence: "49591de; AssignmentModal.lock + deleteConfirm + AssignmentCell.split-lock tests pass (10 tests)"
  - criterion: "artifact frontend/src/lib/sort.ts contains sortClientsByName"
    verdict: "pass"
    evidence: "13bc3ad"
  - criterion: "artifact frontend/src/components/client-combobox.tsx contains ClientCombobox"
    verdict: "pass"
    evidence: "34e1680"
  - criterion: "artifact BoardFilters.tsx + AssignmentModal.tsx contain ClientCombobox"
    verdict: "pass"
    evidence: "8e26534 (board); 49591de (schedule)"
  - criterion: "key_links: client-combobox imports sortClientsByName; AssignmentModal + BoardFilters render ClientCombobox"
    verdict: "pass"
    evidence: "imports present in 34e1680/49591de/8e26534; tsc -b clean"
---

Client dropdowns are now alphabetical (pt-PT, case/accent-insensitive) and searchable via one shared generic ClientCombobox backed by a shared sortClientsByName helper, adopted at both schedule pickers and the board client filter with no new dependency.

## What Was Built

- `sortClientsByName<T extends {name}>` — pure, non-mutating pt-PT `sensitivity:'base'` collation helper in `lib/` (cross-feature shared).
- `ClientCombobox` — generic `{id,name,color?}` Popover+Input+button-list combobox: sorts before filtering, case-insensitive substring search, clear-restores-list, "No clients found" empty state, pinned always-visible sentinel, conditional color swatch, focus-on-open + wheel-stop a11y behavior preserved.
- AssignmentModal main + split pickers now use ClientCombobox ("No client" sentinel, swatches); inline ClientSelect deleted; handlers look client up by id to keep the adopt-color behavior.
- Board "All clients" filter now uses ClientCombobox (search + sort + pinned sentinel), preserving the `w-[160px] h-8 text-xs` footprint; pentester Select untouched.
- Unit tests: sort helper (3), ClientCombobox (7), BoardFilters (4). Full run: 24 tests pass across 6 files; tsc -b clean; no new eslint errors.

## Files Modified

- `frontend/src/lib/sort.ts` -- add: sortClientsByName helper.
- `frontend/src/lib/__tests__/sort.test.ts` -- add: collation/no-mutation/generic tests.
- `frontend/src/components/client-combobox.tsx` -- add: shared ClientCombobox.
- `frontend/src/components/__tests__/client-combobox.test.tsx` -- add: combobox behavior tests.
- `frontend/src/features/schedule/components/AssignmentModal.tsx` -- refactor: adopt ClientCombobox at both pickers; remove inline ClientSelect + unused imports.
- `frontend/src/features/board/components/BoardFilters.tsx` -- refactor: replace Radix client Select with ClientCombobox.
- `frontend/src/features/board/components/__tests__/BoardFilters.test.tsx` -- add: board client-filter tests.

## Deviations

- DEVN-01 (minor): corrected the plan's mistaken sort-test expected order — base-letter collation orders "Ácido" before "acme"; the helper matches the plan's stated intent (pt-PT, sensitivity:base). No behavior change from plan.
- DEVN-05 (pre-existing): `react-hooks/set-state-in-effect` eslint error in AssignmentModal's form-reset `useEffect` exists on the committed HEAD version (verified) and is unrelated to this plan; not fixed (out of scope).
