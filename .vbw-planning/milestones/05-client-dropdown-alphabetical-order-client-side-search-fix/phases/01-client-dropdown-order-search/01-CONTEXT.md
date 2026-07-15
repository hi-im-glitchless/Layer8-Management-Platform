---
phase: 1
gathered: 2026-07-08
calibration: builder
pre_seeded: false
pre_seeded: true
---

# Phase 1 — Client Dropdown: Alphabetical Order + Client-Side Search — Discussion Context

## Current state (evidence from codebase)

- `backend/src/services/clientService.ts:8` — `listClients()` already does `prisma.client.findMany({ orderBy: { name: 'asc' } })`. On SQLite this ordering is **case-sensitive (ASCII)**, so mixed-case/accented names can look out of order (e.g. "Zeta" before "acme").
- `frontend/src/features/schedule/components/AssignmentModal.tsx:43-116` — `ClientSelect` (used for both main and split client selection) is a Popover + `Input` combobox that **already has a working client-side search** (case-insensitive `name.includes`) and a "No clients found" empty state, but renders clients in **raw array order** (no explicit client-side sort).
- `frontend/src/features/board/components/BoardFilters.tsx:62-77` — the board "All clients" filter is a plain Radix/shadcn `<Select>` with **no search box** and no explicit client-side sort.
- No shared searchable-combobox component exists yet (no cmdk/`Command`/`Combobox`).

## Decisions

1. **Scope = all client selector dropdowns.** Apply consistent alphabetical ordering + client-side search to every client selection dropdown in the app. Known instances: the schedule assignment/split picker (`ClientSelect` in `AssignmentModal.tsx`) and the board "All clients" filter (`BoardFilters.tsx`). Planning/Scout must sweep the frontend for any other client selectors (e.g. `ClientManager`, project cards, other filters) and cover them too.
2. **Ordering = case- and accent-insensitive, PT-PT aware.** Sort client-side (e.g. `localeCompare` with `sensitivity: 'base'`) so "acme"/"Acme"/"Ácido" order naturally. Applied in the UI so it's robust regardless of backend order; the existing backend `name: 'asc'` stays as a reasonable default.
3. **Search already exists on the assignment picker — keep it; add equivalent search where missing.** The board "All clients" filter (a Radix `<Select>`) needs a searchable pattern. Prefer **extracting the existing `ClientSelect` search+sort behavior into a reusable searchable client-select/combobox component** and reusing it, rather than duplicating the filter logic, so behavior stays uniform. (Final structure is a planning decision.)
4. **Search behavior:** case-insensitive substring match on client name, client-side over the already-fetched list; clearing the input restores the full sorted list; show the existing "No clients found" empty state on no match.
5. **Sentinel options stay pinned.** Non-client entries like "All clients" and "No client" remain at the top and are not alphabetized among real clients.
6. **Preserve** keyboard accessibility, existing shadcn/ui styling, the client color swatch, and current selection behavior (no regression to create/assign/filter flows).

## Deferred / out of scope

- Server-side client search or pagination (this is client-side over the fetched list; small client count).
- Any redesign of the dropdowns beyond ordering + search.

## Open questions for planning

- Exact reusable-component shape: extract a shared `<ClientCombobox>` vs. add a search input to the board `<Select>` in place. Lead/Scout to decide based on how many selectors exist and how divergent their triggers are.

---

## UAT Remediation Issues

---
phase: 1
plan_count: 1
status: issues_found
started: 2026-07-08
total_tests: 3
passed: 1
skipped: 0
issues: 2
completed: 2026-07-08
---

UAT for Phase 01 — client dropdowns: case/accent-insensitive alphabetical order + client-side search (shared ClientCombobox).

## Tests

### P01-T01 — Assignment/schedule client picker: sorted + searchable
- **Scenario:** In the Schedule, open the assignment modal (create/edit an assignment) and open the client picker. Also check the "split" client picker.
- **Expected:** Clients are listed case- & accent-insensitively A→Z (e.g. "acme"/"Acme"/"Ácido" order naturally). The "Search clients..." box filters as you type (case-insensitive); clearing restores the full sorted list; no matches shows "No clients found". "No client" stays pinned at the top. Color swatches still show.
- **Result:** issues_found
- **Issues:**
  - **UAT-1 (minor):** The "No client" option should not be shown when clients exist (user wants it removed / not displayed alongside real clients).
  - **UAT-2 (minor):** The on-hover highlight color on the client-combobox items is weird and should not exist at all — the dropdown should match the pentesters dropdown (Radix `<Select>`) hover styling.

### P01-T02 — Board "All clients" filter: now searchable + sorted
- **Scenario:** On the Board, open the "All clients" client filter in the top bar.
- **Expected:** The filter now has a search box (previously it did not) and lists clients alphabetically (case/accent-insensitive). "All clients" stays pinned at the top. Typing filters the list; selecting a client filters the board as before.
- **Result:** issues_found
- **Issues:**
  - **UAT-2 (minor, same as P01-T01):** The board client filter combobox has the same weird on-hover highlight color — remove it, match the pentesters dropdown styling. (Sorting + search themselves work.)

### P01-T03 — No regression to selection/save/filter flows
- **Scenario:** Select a client (and a split client) in the assignment modal and save; use the board client filter to filter and then clear.
- **Expected:** Selecting/saving a client works exactly as before (assignment persists with the right client/color); the board filter filters and clears correctly. No errors, no console breakage.
- **Result:** pass
