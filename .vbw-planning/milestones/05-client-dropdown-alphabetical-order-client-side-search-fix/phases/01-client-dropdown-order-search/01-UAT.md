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
