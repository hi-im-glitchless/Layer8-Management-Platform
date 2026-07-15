---
phase: 01
tier: deep
result: PARTIAL
passed: 29
failed: 1
total: 30
date: 2026-07-08
verified_at_commit: 8e2653457120d3870f3e4d40c18556d4982a07b4
writer: write-verification.sh
plans_verified:
  - 01-01
---

## Must-Have Checks

| # | ID | Truth/Condition | Status | Evidence |
|---|-----|-----------------|--------|----------|
| 1 | MH-01 | Every client-selection dropdown renders real clients case- & accent-insensitively A→Z via localeCompare(name,'pt-PT',{sensitivity:'base'}) | PASS | sort.ts:23-27 implements exactly this; verified with `node -e` reproducing ['Ácido','acme','Bravo','Zeta']; client-combobox.test.tsx (a) and BoardFilters.test.tsx (b) assert this order at both consumer sites. |
| 2 | MH-02 | Every client-selection dropdown has client-side search: case-insensitive substring; clearing restores full list; 'No clients found' on no match | PASS | client-combobox.tsx:68-70 filter logic; client-combobox.test.tsx (b)(c)(d) and BoardFilters.test.tsx (a) all pass (verified via vitest run). |
| 3 | MH-03 | Sentinel options ('No client'/'All clients') stay pinned above the list, never alphabetized, visible under any search text | PASS | client-combobox.tsx:124-135 renders sentinel as a static button outside the sorted/filtered map; client-combobox.test.tsx (e) and BoardFilters.test.tsx (c) assert pinning + visibility under a no-match query. |
| 4 | MH-04 | Color swatch preserved at schedule call sites, rendered only when color present (board list has none) | PASS | client-combobox.tsx:91-96,147-152 conditional `{c.color && ...}`; client-combobox.test.tsx (g) asserts swatch present for colored rows and absent for CLIENTS_NO_COLOR; Board.tsx:131-139 confirmed to derive a colorless {id,name} map (no `color` key emitted). |
| 5 | MH-05 | No new runtime dependency added (no cmdk); hand-rolled Popover+Input+button-list reused | PASS | `git grep cmdk frontend/package.json` → no match; `git diff 13bc3ad~1 8e26534 -- frontend/package.json` → empty diff (no dependency changes across all 4 phase commits); client-combobox.tsx imports only @/components/ui/popover and @/components/ui/input. |
| 6 | MH-06 | No regression to create/assign (AssignmentModal) or board filter flows; existing AssignmentModal tests still pass | PASS | `npx vitest run` of AssignmentModal.lock.test.tsx (3), AssignmentModal.deleteConfirm.test.tsx (3), AssignmentCell.split-lock.test.tsx (4) — all 10 pass unmodified; BoardFilters pentester Select and Show-Archived toggle left untouched in the diff. |
| 7 | DEV-01 | DEVIATION (declared, DEVN-01): plan's sort-test example expected order '(acme, Ácido, Bravo, Zeta)' does not match actual pt-PT sensitivity:'base' collation output | FAIL | Verified independently: `localeCompare('pt-PT',{sensitivity:'base'})` on ['Zeta','acme','Ácido','Bravo'] actually produces ['Ácido','acme','Bravo','Zeta'] (reproduced via node -e), NOT the plan's stated '(acme, Ácido, ...)'. The implemented test (sort.test.ts:20) and helper both match this correct, verifiable output — the deviation is a wrong example in the plan's prose, not a functional defect; the code satisfies the plan's actual algorithmic intent (localeCompare pt-PT base). Verdict: plan-text correction, not a behavior regression — but per protocol this is surfaced as a FAIL/deviation check regardless, since the shipped test assertion differs from literal plan text. |

## Artifact Checks

| # | ID | Artifact | Exists | Contains | Status |
|---|-----|----------|--------|----------|--------|
| 1 | ART-01 | frontend/src/lib/sort.ts provides generic pure sort helper | Yes | sortClientsByName | PASS |
| 2 | ART-02 | frontend/src/components/client-combobox.tsx provides reusable generic ClientCombobox | Yes | ClientCombobox | PASS |
| 3 | ART-03 | frontend/src/features/board/components/BoardFilters.tsx uses ClientCombobox for the client filter | Yes | ClientCombobox | PASS |
| 4 | ART-04 | frontend/src/features/schedule/components/AssignmentModal.tsx uses ClientCombobox for both client pickers | Yes | ClientCombobox | PASS |

## Key Link Checks

| # | ID | From | To | Via | Status |
|---|-----|------|-----|-----|--------|
| 1 | KL-01 | frontend/src/components/client-combobox.tsx | frontend/src/lib/sort.ts | imports sortClientsByName to order the client list | PASS |
| 2 | KL-02 | frontend/src/features/schedule/components/AssignmentModal.tsx | frontend/src/components/client-combobox.tsx | renders ClientCombobox for main + split client selection | PASS |
| 3 | KL-03 | frontend/src/features/board/components/BoardFilters.tsx | frontend/src/components/client-combobox.tsx | renders ClientCombobox for the 'All clients' filter | PASS |

## Anti-Pattern Scan

| # | ID | Pattern | Status | Evidence |
|---|-----|---------|--------|----------|
| 1 | AP-01 | No backend/Prisma/migration changes introduced by this phase's commits | PASS | `git show --stat` on all 4 commits (13bc3ad, 34e1680, 49591de, 8e26534) shows only frontend/src paths touched; no backend/ or prisma/ files in any commit. |
| 2 | AP-02 | No new npm dependency added to frontend/package.json | PASS | `git diff 13bc3ad~1 8e26534 -- frontend/package.json` returns empty. |
| 3 | AP-03 | No new eslint errors introduced in the 4 modified/added files beyond the declared pre-existing issue | PASS | `npx eslint client-combobox.tsx sort.ts AssignmentModal.tsx BoardFilters.tsx` → exactly 1 error, at AssignmentModal.tsx:124 (the declared pre-existing set-state-in-effect issue, in the untouched form-reset effect); client-combobox.tsx, sort.ts, and BoardFilters.tsx are all clean. |
| 4 | AP-04 | No leftover inline ClientSelect definition or dead Popover/useRef imports in AssignmentModal.tsx | PASS | Read full AssignmentModal.tsx (556 lines): no `ClientSelect` symbol, no `Popover`/`useRef` imports remain; commit 49591de message confirms 'Drop now-unused Popover imports, useRef, and Client type import' (93 lines removed net -71). |
| 5 | AP-05 | sortClientsByName does not mutate its input array (spread-then-sort pattern) | PASS | sort.ts:24 `[...items].sort(...)`; sort.test.ts 'does not mutate the input array' test passes and asserts `result` is a different reference than `input`. |

## Convention Compliance

| # | ID | Convention | File | Status | Detail |
|---|-----|------------|------|--------|--------|
| 1 | CONV-01 | File naming matches established shared-component convention in components/ (not components/ui but same pattern) | frontend/src/components/client-combobox.tsx | PASS | kebab-case filename exporting a PascalCase component, matching the existing components/ui/*.tsx pattern (e.g. alert-dialog.tsx exports AlertDialog) |
| 2 | CONV-02 | Uses @/ alias for cross-directory imports per CONVENTIONS.md | frontend/src/components/client-combobox.tsx | PASS | @/ import alias used throughout |
| 3 | CONV-03 | All 3 new test files follow the co-located __tests__ convention | frontend/src | PASS | Tests co-located in __tests__/ dirs, *.test.tsx / *.test.ts naming |
| 4 | CONV-04 | Frontend server-state convention preserved (no direct fetch calls added) | frontend/src/features/schedule/components/AssignmentModal.tsx | PASS | Server state stays behind useClients() TanStack Query hook; no raw fetch introduced |

## Requirement Mapping

| # | ID | Requirement | Plan Ref | Evidence | Status |
|---|-----|-------------|----------|----------|--------|
| 1 | TEST-01 | sort.test.ts passes (collation order, no-mutation, generic field preservation) | 01-01 | `npx vitest run src/lib/__tests__/sort.test.ts` → 3/3 pass. | PASS |
| 2 | TEST-02 | client-combobox.test.tsx passes all 7 named cases (a)-(g) | 01-01 | `npx vitest run src/components/__tests__/client-combobox.test.tsx` → 7/7 pass. | PASS |
| 3 | TEST-03 | BoardFilters.test.tsx passes all 4 named cases (a)-(d) | 01-01 | `npx vitest run src/features/board/components/__tests__/BoardFilters.test.tsx` → 4/4 pass. | PASS |
| 4 | TEST-04 | Existing AssignmentModal + AssignmentCell tests unaffected by the refactor | 01-01 | AssignmentModal.lock.test.tsx (3), AssignmentModal.deleteConfirm.test.tsx (3), AssignmentCell.split-lock.test.tsx (4) all pass, 10/10. | PASS |
| 5 | TEST-05 | Whole-project frontend typecheck clean (tsc -b) | 01-01 | `cd frontend && npx tsc -b` produced no output / exit clean. | PASS |
| 6 | TEST-06 | Full named-file vitest run totals 24 passing tests across 6 files, matching SUMMARY's claim | 01-01 | Combined run output: 'Test Files 6 passed (6)', 'Tests 24 passed (24)' — matches SUMMARY.md's '24 tests pass across 6 files' claim exactly. | PASS |
| 7 | UD-01 | Undeclared-deviation sweep: no other client-selection dropdown exists in the frontend that should have been covered but wasn't (ClientManager, ScheduleGrid, executive-report metadata all checked) | 01-01 | grep sweep for `useClients`/`clientId`/client-select usage across src: ClientManager.tsx is a CRUD table (unsorted list of all clients for add/edit/delete), not a client-selection combobox — out of scope by the plan's own definition; ScheduleGrid.tsx only threads clientId through drag/paste logic, no selector UI; executive-report/MetadataEditor.tsx has only a free-text 'Client Name' field, not an entity picker. No undeclared gap found. | PASS |

## Pre-existing Issues

| Test | File | Error |
|------|------|-------|
| eslint react-hooks/set-state-in-effect | frontend/src/features/schedule/components/AssignmentModal.tsx | Calling setState synchronously within an effect (form-reset useEffect, line 124) — reproduced on HEAD via `npx eslint AssignmentModal.tsx`; pre-existing, in code this plan did not touch (touched lines are the ClientCombobox call sites, not the effect body). |

## Summary

**Tier:** deep
**Result:** PARTIAL
**Passed:** 29/30
**Failed:** DEV-01
